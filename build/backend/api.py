"""
Rated - HTTP API wrapper

Wraps the service classes from rated_backend.py with FastAPI routes so
the frontend (Vite dev / Netlify build) can talk to them via fetch().

Run locally:
    make install && make dev
or:
    uvicorn api:app --reload

Then open http://localhost:8000/docs to test every endpoint.

Storage: SQLAlchemy → SQLite (backend/rated.db) by default. Set DATABASE_URL
to a Postgres URL (e.g. Netlify DB / Neon) and it works the same way.
The DB file persists across server restarts; delete it (or run `make db-reset`)
to wipe back to seeded fixtures.
"""

import os
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, func, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db import get_db, init_db, SessionLocal
from models import FollowRow, MovieRow, RankingRow, ReviewRow, UserRow
from rated_backend import App, Movie


# OpenAPI tag descriptions show up as section headers in /docs and /redoc.
TAGS = [
    {"name": "Health",    "description": "Liveness + readiness checks for hosts."},
    {"name": "Movies",    "description": "Catalog, search, leaderboard, per-movie aggregates."},
    {"name": "Users",     "description": "Profiles, follow graph, user search."},
    {"name": "Auth",      "description": "Login (Google OAuth stub) + username claim."},
    {"name": "Rankings",  "description": "1–10 scores. One per (user, movie). Upsert semantics."},
    {"name": "Watchlist", "description": "Plan-to-watch list."},
    {"name": "Saved",     "description": "Bookmarks."},
    {"name": "Reviews",   "description": "Written reviews. One per (user, movie)."},
    {"name": "Feed",      "description": "Activity from followed users."},
    {"name": "Notifications", "description": "In-app notifications. Auto-created on follow today."},
]


# ─── App init ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Rated API", version="0.1.0", openapi_tags=TAGS)

# CORS — read allowlist from env. Default covers local dev (Vite at :5173).
# For production set ALLOWED_ORIGINS to a comma-separated list of frontend URLs,
# e.g. "https://silver-salamander-08daf4.netlify.app,https://rated.com".
_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service singletons. Stateless — each method takes a Session.
app_instance = App()


# ─── Pagination helper ────────────────────────────────────────────────────────
# Clamp user-supplied paging params so a malicious or buggy client can't ask
# for ?limit=10000000 and OOM the server. Defaults match what the routes had
# before pagination was added.

PAGE_LIMIT_DEFAULT = 50
PAGE_LIMIT_MAX = 200


def _clamp_pagination(limit: Optional[int], offset: Optional[int],
                      default: int = PAGE_LIMIT_DEFAULT) -> tuple[int, int]:
    lim = max(1, min(int(limit or default), PAGE_LIMIT_MAX))
    off = max(0, int(offset or 0))
    return lim, off


# ─── Schema + seeding (run once on startup) ───────────────────────────────────

@app.on_event("startup")
def _startup() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.execute(select(func.count()).select_from(MovieRow)).scalar() == 0:
            _seed_initial(db)
            print("[seed] inserted fixture movies + 8 mock users + rankings")
        else:
            print(f"[startup] DB has data — skipping seed")
    finally:
        db.close()


def _seed_initial(db: Session) -> None:
    app_instance.seed_movies(db, [
        Movie("m-001", "Interstellar",       "Sci-Fi",   year=2014),
        Movie("m-002", "Parasite",           "Thriller", year=2019),
        Movie("m-003", "The Dark Knight",    "Action",   year=2008),
        Movie("m-004", "Whiplash",           "Drama",    year=2014),
        Movie("m-005", "RRR",                "Action",   year=2022),
    ])

    def _user(username, name, email):
        user = app_instance.auth.google_login(db, f"sub_seed_{username}|{name}|{email}")
        app_instance.auth.claim_username(db, user, username)
        return user

    seeds = [
        ("cinephile99", "Cinephile",  "cinephile@example.com",
            [("m-002", 10), ("m-001", 9), ("m-004", 9), ("m-003", 8)]),
        ("filmfreak",   "Film Freak", "filmfreak@example.com",
            [("m-003", 10), ("m-001", 9), ("m-002", 8)]),
        ("reeltalks",   "Reel Talks", "reeltalks@example.com",
            [("m-002", 10), ("m-005", 9), ("m-004", 8), ("m-003", 7)]),
        ("maya",        "Maya",       "maya@example.com",
            [("m-004", 10), ("m-001", 9), ("m-002", 9)]),
        ("jasonk",      "Jason K",    "jasonk@example.com",
            [("m-001", 10), ("m-003", 9)]),
        ("josh",        "Josh",       "josh@example.com",
            [("m-005", 10), ("m-002", 8)]),
        ("lina",        "Lina",       "lina@example.com",
            [("m-004", 10), ("m-002", 9), ("m-001", 8)]),
        ("carlos",      "Carlos",     "carlos@example.com",
            [("m-005", 10), ("m-003", 9), ("m-001", 7)]),
    ]
    for username, name, email, ranks in seeds:
        user = _user(username, name, email)
        for movie_id, score in ranks:
            app_instance.ranking_service.add_ranking(db, user.user_id, movie_id, score)


# ─── Pydantic request bodies ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    id_token: str  # stub format: "sub|name|email"

class RankRequest(BaseModel):
    movie_id: str
    score: int

class PairwiseRequest(BaseModel):
    winner_movie_id: str
    loser_movie_id: str

class WatchlistAddRequest(BaseModel):
    movie_id: str
    item_type: Optional[str] = "catalog"

class FollowRequest(BaseModel):
    followee_id: str

class UsernameClaimRequest(BaseModel):
    username: str

class SavedAddRequest(BaseModel):
    movie_id: str

class ReviewSubmitRequest(BaseModel):
    movie_id: str
    rating: int
    text: str


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root(db: Session = Depends(get_db)):
    movies = db.execute(select(func.count()).select_from(MovieRow)).scalar() or 0
    users = db.execute(select(func.count()).select_from(UserRow)).scalar() or 0
    return {
        "service": "rated-api",
        "status": "ok",
        "movies_seeded": movies,
        "users_registered": users,
    }


def _healthz_impl(db: Session):
    """Liveness + DB-readiness check. 200 when reachable + DB responding,
    503 when the DB connection is broken. Hosts (Render, Fly, k8s) hit this
    every few seconds — keep it cheap."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=503, detail={"status": "fail", "db": str(e)[:200]})


@app.get("/healthz", tags=["Health"])
def healthz(db: Session = Depends(get_db)):
    return _healthz_impl(db)


# Alias: Replit's edge proxy reserves /healthz for its own liveness probes,
# so external traffic to /healthz never reaches our app. /health is the
# externally-callable equivalent — same response shape.
@app.get("/health", tags=["Health"])
def health(db: Session = Depends(get_db)):
    return _healthz_impl(db)


# ─── Movies ──────────────────────────────────────────────────────────────────
# /movies/top must come before /movies/{movie_id} so "top" isn't matched as id.

@app.get("/movies", tags=["Movies"])
def list_movies(
    q: Optional[str] = None,
    genre: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List movies. Optional ?q=<title-substring> and ?genre=<exact-match>.
    Paginate with ?limit=&offset= (limit clamped to 200 max)."""
    lim, off = _clamp_pagination(limit, offset, default=100)
    stmt = select(MovieRow)
    if q:
        stmt = stmt.where(func.lower(MovieRow.title).like(f"%{q.lower()}%"))
    if genre:
        stmt = stmt.where(func.lower(MovieRow.genre) == genre.lower())
    stmt = stmt.order_by(MovieRow.title).offset(off).limit(lim)
    return [m.to_dict() for m in db.execute(stmt).scalars()]


@app.get("/movies/top", tags=["Movies"])
def top_movies(n: int = 10, db: Session = Depends(get_db)):
    return [
        {"movie": m.to_dict(), "avg_score": s}
        for m, s in app_instance.ranking_service.top_movies(db, n)
    ]


@app.get("/movies/{movie_id}", tags=["Movies"])
def get_movie(movie_id: str, db: Session = Depends(get_db)):
    movie = db.get(MovieRow, movie_id)
    if not movie:
        raise HTTPException(status_code=404, detail=f"Movie {movie_id} not found")
    return movie.to_dict()


@app.get("/movies/{movie_id}/reviews", tags=["Reviews"])
def get_movie_reviews(
    movie_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    lim, off = _clamp_pagination(limit, offset)
    out = []
    for r in app_instance.review_service.get_for_movie(db, movie_id, limit=lim, offset=off):
        d = r.to_dict()
        author = db.get(UserRow, r.user_id)
        d["username"] = author.username if author else None
        d["display_name"] = author.name if author else None
        out.append(d)
    return out


@app.get("/movies/{movie_id}/stats", tags=["Movies"])
def get_movie_stats(movie_id: str, db: Session = Depends(get_db)):
    """Aggregate counts + average for a single movie. Used by the frontend's
    movie-detail screen — it was already calling this endpoint, just nothing
    was answering."""
    if not db.get(MovieRow, movie_id):
        raise HTTPException(status_code=404, detail=f"Movie {movie_id} not found")
    avg = db.execute(
        select(func.avg(RankingRow.score)).where(RankingRow.movie_id == movie_id)
    ).scalar()
    ranking_count = db.execute(
        select(func.count()).select_from(RankingRow)
        .where(RankingRow.movie_id == movie_id)
    ).scalar() or 0
    review_count = db.execute(
        select(func.count()).select_from(ReviewRow)
        .where(ReviewRow.movie_id == movie_id)
    ).scalar() or 0
    return {
        "movie_id": movie_id,
        "avg_score": round(float(avg), 2) if avg is not None else 0.0,
        "ranking_count": ranking_count,
        "review_count": review_count,
    }


@app.get("/movies/{movie_id}/rankings", tags=["Rankings"])
def list_movie_rankings(
    movie_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """All rankings for a movie, highest score first then most recent."""
    if not db.get(MovieRow, movie_id):
        raise HTTPException(status_code=404, detail=f"Movie {movie_id} not found")
    lim, off = _clamp_pagination(limit, offset)
    rows = db.execute(
        select(RankingRow)
        .where(RankingRow.movie_id == movie_id)
        .order_by(RankingRow.score.desc(), RankingRow.ranked_at.desc())
        .offset(off).limit(lim)
    ).scalars()
    return [r.to_dict() for r in rows]


# ─── Auth ────────────────────────────────────────────────────────────────────

@app.post("/auth/login", tags=["Auth"])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Exchange an id_token for a session_token.

    When GOOGLE_CLIENT_ID env var is set, id_token must be a real Google JWT
    (signature + audience verified server-side via google-auth).
    Without GOOGLE_CLIENT_ID we fall back to dev-stub format 'sub|name|email'.

    The returned session_token is a 256-bit urlsafe random string stored in
    the sessions table — pass it back as ?session_token=... on protected
    routes (e.g. /auth/username, future write endpoints)."""
    try:
        user = app_instance.auth.google_login(db, req.id_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    session = app_instance.auth.create_session(db, user)
    return {
        "user": user.to_dict(),
        "session_token": session.token,
        "expires_at": session.expires_at,
        "user_id": user.user_id,
        "username": user.username,
        "needs_username": user.username is None,
    }


@app.post("/auth/logout", tags=["Auth"])
def logout(session_token: str = "", db: Session = Depends(get_db)):
    """Invalidate the given session token. Idempotent — returns ok even if
    the token was already gone or never existed."""
    revoked = app_instance.auth.revoke_session(db, session_token) if session_token else False
    return {"ok": True, "revoked": revoked}


@app.get("/auth/username/check/{username}", tags=["Auth"])
def check_username(username: str, db: Session = Depends(get_db)):
    err = app_instance.auth.validate_username(username)
    if err:
        return {"available": False, "reason": err}
    if app_instance.auth.is_username_taken(db, username):
        return {"available": False, "reason": "Username already taken"}
    return {"available": True}


@app.post("/auth/username", tags=["Auth"])
def claim_username(
    body: UsernameClaimRequest,
    session_token: str = "",
    db: Session = Depends(get_db),
):
    """Claim a username for the user identified by session_token.
    Returns 401 if the token is missing, unknown, or expired."""
    user = app_instance.auth.get_user_from_session(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    err = app_instance.auth.validate_username(body.username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    if user.username != body.username and app_instance.auth.is_username_taken(db, body.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    app_instance.auth.claim_username(db, user, body.username)
    return {"ok": True, "username": body.username, "user_id": user.user_id}


# ─── Users ───────────────────────────────────────────────────────────────────

@app.get("/users", tags=["Users"])
def list_users(
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List users for discovery. Optional ?q=<substring> matches both
    username (case-insensitive) and display name. Paginate with ?limit=&offset=."""
    lim, off = _clamp_pagination(limit, offset)
    stmt = select(UserRow)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(
            func.lower(UserRow.username).like(like),
            func.lower(UserRow.name).like(like),
        ))
    stmt = stmt.order_by(UserRow.created_at).offset(off).limit(lim)
    return [u.to_dict() for u in db.execute(stmt).scalars()]


def _list_follow_edge(db: Session, user_id: str, *, side: str,
                      limit: int = 50, offset: int = 0) -> list[dict]:
    """Shared helper for /followers and /following.
    side='followers' → users following user_id.
    side='following' → users user_id is following."""
    if not db.get(UserRow, user_id):
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    lim, off = _clamp_pagination(limit, offset)
    if side == "followers":
        join_col, where_col = FollowRow.follower_id, FollowRow.followee_id
    else:
        join_col, where_col = FollowRow.followee_id, FollowRow.follower_id
    rows = db.execute(
        select(UserRow)
        .join(FollowRow, join_col == UserRow.user_id)
        .where(where_col == user_id)
        .order_by(FollowRow.created_at.desc())
        .offset(off).limit(lim)
    ).scalars()
    return [u.to_dict() for u in rows]


@app.get("/users/{user_id}/followers", tags=["Users"])
def list_followers(user_id: str, limit: int = 50, offset: int = 0,
                   db: Session = Depends(get_db)):
    return _list_follow_edge(db, user_id, side="followers", limit=limit, offset=offset)


@app.get("/users/{user_id}/following", tags=["Users"])
def list_following(user_id: str, limit: int = 50, offset: int = 0,
                   db: Session = Depends(get_db)):
    return _list_follow_edge(db, user_id, side="following", limit=limit, offset=offset)


@app.get("/users/{user_id}", tags=["Users"])
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.get(UserRow, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    d = user.to_dict()
    d["follower_count"] = app_instance.feed_service.follower_count(db, user_id)
    d["following_count"] = app_instance.feed_service.following_count(db, user_id)
    return d


@app.get("/users/by-username/{username}", tags=["Users"])
def get_user_by_username(username: str, db: Session = Depends(get_db)):
    user = app_instance.auth.find_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail=f"@{username} not found")
    d = user.to_dict()
    d["follower_count"] = app_instance.feed_service.follower_count(db, user.user_id)
    d["following_count"] = app_instance.feed_service.following_count(db, user.user_id)
    return d


@app.get("/users/{user_id}/stats", tags=["Users"])
def get_user_stats(user_id: str, db: Session = Depends(get_db)):
    """Aggregate counts + tastes for a user's profile screen.
    All numbers are computed server-side so the UI doesn't reimplement them."""
    user = db.get(UserRow, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    rank_count = db.execute(
        select(func.count()).select_from(RankingRow).where(RankingRow.user_id == user_id)
    ).scalar() or 0

    avg_score = db.execute(
        select(func.avg(RankingRow.score)).where(RankingRow.user_id == user_id)
    ).scalar()

    review_count = db.execute(
        select(func.count()).select_from(ReviewRow).where(ReviewRow.user_id == user_id)
    ).scalar() or 0

    # Top genres: GROUP BY genre on the user's rankings, sort by count desc.
    top_genres = [
        {"genre": g, "count": int(c)}
        for g, c in db.execute(
            select(MovieRow.genre, func.count(RankingRow.id))
            .join(RankingRow, RankingRow.movie_id == MovieRow.movie_id)
            .where(RankingRow.user_id == user_id, MovieRow.genre.isnot(None))
            .group_by(MovieRow.genre)
            .order_by(func.count(RankingRow.id).desc())
            .limit(5)
        )
    ]

    # Most recent rankings — full movie + score, capped at 10.
    recent = list(db.execute(
        select(RankingRow)
        .where(RankingRow.user_id == user_id)
        .order_by(RankingRow.ranked_at.desc())
        .limit(10)
    ).scalars())

    return {
        "user_id": user_id,
        "ranking_count": rank_count,
        "review_count": review_count,
        "avg_score": round(float(avg_score), 2) if avg_score is not None else 0.0,
        "follower_count": app_instance.feed_service.follower_count(db, user_id),
        "following_count": app_instance.feed_service.following_count(db, user_id),
        "top_genres": top_genres,
        "recent_rankings": [r.to_dict() for r in recent],
    }


# ─── Rankings ────────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/rankings", tags=["Rankings"])
def add_ranking(user_id: str, body: RankRequest, db: Session = Depends(get_db)):
    try:
        ranking = app_instance.ranking_service.add_ranking(
            db, user_id, body.movie_id, body.score,
        )
        return ranking.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/users/{user_id}/rankings", tags=["Rankings"])
def get_user_rankings(user_id: str, limit: int = 50, offset: int = 0,
                      db: Session = Depends(get_db)):
    lim, off = _clamp_pagination(limit, offset)
    return [r.to_dict() for r in app_instance.ranking_service.user_rankings(
        db, user_id, limit=lim, offset=off,
    )]


@app.post("/users/{user_id}/pairwise", tags=["Rankings"])
def record_pairwise(user_id: str, body: PairwiseRequest, db: Session = Depends(get_db)):
    row = app_instance.ranking_service.record_pairwise(
        db, user_id, body.winner_movie_id, body.loser_movie_id,
    )
    return {
        "user_id": row.user_id,
        "winner_movie_id": row.winner_movie_id,
        "loser_movie_id": row.loser_movie_id,
        "timestamp": row.timestamp,
    }


# ─── Feed ────────────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/follow", tags=["Feed"])
def follow(user_id: str, body: FollowRequest, db: Session = Depends(get_db)):
    try:
        app_instance.feed_service.follow(db, user_id, body.followee_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{user_id}/follow/{followee_id}", tags=["Feed"])
def unfollow(user_id: str, followee_id: str, db: Session = Depends(get_db)):
    app_instance.feed_service.unfollow(db, user_id, followee_id)
    return {"ok": True}


@app.get("/users/{user_id}/feed", tags=["Feed"])
def get_feed(user_id: str, limit: int = 20, offset: int = 0,
             db: Session = Depends(get_db)):
    lim, off = _clamp_pagination(limit, offset, default=20)
    try:
        return [r.to_dict() for r in app_instance.feed_service.get_feed(
            db, user_id, limit=lim, offset=off,
        )]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Watchlist ───────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/watchlist", tags=["Watchlist"])
def add_to_watchlist(user_id: str, body: WatchlistAddRequest, db: Session = Depends(get_db)):
    try:
        app_instance.watchlist_service.add(db, user_id, body.movie_id, body.item_type)
        return {"ok": True, "movie_id": body.movie_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{user_id}/watchlist/{movie_id}", tags=["Watchlist"])
def remove_from_watchlist(user_id: str, movie_id: str, db: Session = Depends(get_db)):
    app_instance.watchlist_service.remove(db, user_id, movie_id)
    return {"ok": True}


@app.get("/users/{user_id}/watchlist", tags=["Watchlist"])
def get_watchlist(user_id: str, limit: int = 50, offset: int = 0,
                  db: Session = Depends(get_db)):
    lim, off = _clamp_pagination(limit, offset)
    return app_instance.watchlist_service.get(db, user_id, limit=lim, offset=off)


# ─── Saved (bookmarks) ───────────────────────────────────────────────────────

@app.post("/users/{user_id}/saved", tags=["Saved"])
def add_saved(user_id: str, body: SavedAddRequest, db: Session = Depends(get_db)):
    try:
        app_instance.saved_service.add(db, user_id, body.movie_id)
        return {"ok": True, "movie_id": body.movie_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{user_id}/saved/{movie_id}", tags=["Saved"])
def remove_saved(user_id: str, movie_id: str, db: Session = Depends(get_db)):
    app_instance.saved_service.remove(db, user_id, movie_id)
    return {"ok": True}


@app.get("/users/{user_id}/saved", tags=["Saved"])
def get_saved(user_id: str, limit: int = 50, offset: int = 0,
              db: Session = Depends(get_db)):
    lim, off = _clamp_pagination(limit, offset)
    return app_instance.saved_service.get(db, user_id, limit=lim, offset=off)


# ─── Reviews ─────────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/reviews", tags=["Reviews"])
def submit_review(user_id: str, body: ReviewSubmitRequest, db: Session = Depends(get_db)):
    try:
        review = app_instance.review_service.submit(
            db, user_id, body.movie_id, body.rating, body.text,
        )
        return review.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{user_id}/reviews/{movie_id}", tags=["Reviews"])
def delete_review(user_id: str, movie_id: str, db: Session = Depends(get_db)):
    if not app_instance.review_service.delete(db, user_id, movie_id):
        raise HTTPException(status_code=404, detail="Review not found")
    return {"ok": True}


@app.get("/users/{user_id}/reviews", tags=["Reviews"])
def get_user_reviews(user_id: str, limit: int = 50, offset: int = 0,
                     db: Session = Depends(get_db)):
    lim, off = _clamp_pagination(limit, offset)
    return [r.to_dict() for r in app_instance.review_service.get_for_user(
        db, user_id, limit=lim, offset=off,
    )]


# ─── Notifications ───────────────────────────────────────────────────────────

@app.get("/users/{user_id}/notifications", tags=["Notifications"])
def list_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Notifications for {user_id}, newest first. ?unread_only=true filters
    to unread. Always includes the unread_count for the badge."""
    if not db.get(UserRow, user_id):
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    lim, off = _clamp_pagination(limit, offset)
    rows = app_instance.notification_service.list_for_user(
        db, user_id, unread_only=unread_only, limit=lim, offset=off,
    )
    return {
        "items": [r.to_dict() for r in rows],
        "unread_count": app_instance.notification_service.unread_count(db, user_id),
    }


@app.post("/users/{user_id}/notifications/{notification_id}/read", tags=["Notifications"])
def mark_notification_read(
    user_id: str,
    notification_id: int,
    db: Session = Depends(get_db),
):
    ok = app_instance.notification_service.mark_one_read(db, user_id, notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@app.post("/users/{user_id}/notifications/mark-all-read", tags=["Notifications"])
def mark_all_notifications_read(user_id: str, db: Session = Depends(get_db)):
    if not db.get(UserRow, user_id):
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    n = app_instance.notification_service.mark_all_read(db, user_id)
    return {"ok": True, "marked_read": n}
