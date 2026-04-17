"""
Rated API Server
Run: uvicorn api:app --reload --port 8000

Install deps:
    pip install fastapi uvicorn python-multipart

Frontend should set API_BASE = "http://localhost:8000"
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import time

# ── Import the backend ────────────────────────────────────────────────────────
from rated_backend import (
    App as RatedApp, Movie, User
)

app_state = RatedApp()

# Seed the same movies the frontend uses
app_state.seed_movies([
    Movie("m-001", "Interstellar",    "Sci-Fi",   "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", 2014),
    Movie("m-002", "Parasite",        "Thriller",  "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", 2019),
    Movie("m-003", "The Dark Knight", "Action",    "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911BTUgMe1YRr.jpg",  2008),
    Movie("m-004", "Whiplash",        "Drama",     "https://image.tmdb.org/t/p/w500/oPxnRhyAEBhPIT5uXGb02JMbuz.jpg", 2014),
    Movie("m-005", "RRR",             "Action",    "https://image.tmdb.org/t/p/w500/nEufeZYpKOlqp3fkDJKVECVpfjn.jpg", 2022),
])

# ── FastAPI app ───────────────────────────────────────────────────────────────
api = FastAPI(title="Rated API", version="1.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory username store (extend User model in prod) ─────────────────────
_usernames: dict[str, str] = {}          # user_id → username
_username_set: set[str] = set([          # pre-taken
    "jasonk","maya","josh","lina","carlos",
    "cinephile99","filmfreak","reeltalks","admin","rated","movies","film"
])
_watchlists: dict[str, list[str]] = {}   # removed — now handled by WatchlistService
_sessions: dict[str, str] = {}           # session_token → user_id


# ── Pydantic request bodies ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    provider: str          # "google" | "apple"
    id_token: str          # stub: "sub|name|email"

class UsernameRequest(BaseModel):
    username: str

class RankingRequest(BaseModel):
    movie_id: str
    score: int             # 1-10

class PairwiseRequest(BaseModel):
    winner_id: str
    loser_id: str

class WatchlistRequest(BaseModel):
    movie_id: str

class FollowRequest(BaseModel):
    followee_id: str


# ── Auth helpers ──────────────────────────────────────────────────────────────

def get_user_id(session_token: str) -> str:
    uid = _sessions.get(session_token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return uid


# ── Auth endpoints ────────────────────────────────────────────────────────────

@api.post("/auth/login")
def login(body: LoginRequest):
    """
    Step 1: Google / Apple sign-in.
    Returns session_token + whether user needs to pick a username.
    """
    user = app_state.auth.google_login(body.id_token)
    token = app_state.auth.generate_session_token(user)
    _sessions[token] = user.user_id
    needs_username = user.user_id not in _usernames
    return {
        "session_token": token,
        "user": user.to_dict(),
        "needs_username": needs_username,
        "username": _usernames.get(user.user_id),
    }


@api.get("/auth/username/check/{username}")
def check_username(username: str):
    """Real-time username availability check."""
    taken = username.lower() in _username_set
    return {"username": username, "available": not taken}


@api.post("/auth/username")
def set_username(body: UsernameRequest, session_token: str):
    """Step 2: Claim a username after first login."""
    user_id = get_user_id(session_token)
    uname = body.username.lower().strip()

    if len(uname) < 3 or len(uname) > 20:
        raise HTTPException(400, "Username must be 3-20 characters")
    if not uname.replace("_","").isalnum():
        raise HTTPException(400, "Only letters, numbers and _ allowed")
    if uname in _username_set:
        raise HTTPException(409, "Username already taken")

    _usernames[user_id] = uname
    _username_set.add(uname)
    return {"username": uname, "user_id": user_id}


# ── Rankings endpoints ────────────────────────────────────────────────────────

@api.post("/users/{user_id}/rankings")
def add_ranking(user_id: str, body: RankingRequest, session_token: str):
    """Save a movie ranking (score 1-10) for the logged-in user."""
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    try:
        ranking = app_state.ranking_service.add_ranking(user_id, body.movie_id, body.score)
        return ranking.to_dict()
    except ValueError as e:
        raise HTTPException(400, str(e))


@api.get("/users/{user_id}/rankings")
def get_rankings(user_id: str, session_token: str):
    """Get a user's personal rankings, sorted by score."""
    get_user_id(session_token)
    return [r.to_dict() for r in app_state.ranking_service.user_rankings(user_id)]


@api.post("/users/{user_id}/pairwise")
def record_pairwise(user_id: str, body: PairwiseRequest, session_token: str):
    """Record a head-to-head comparison result from the RANK screen."""
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    result = app_state.ranking_service.record_pairwise(user_id, body.winner_id, body.loser_id)
    return {
        "user_id": result.user_id,
        "winner_movie_id": result.winner_movie_id,
        "loser_movie_id": result.loser_movie_id,
        "timestamp": result.timestamp,
    }


@api.get("/movies/top")
def top_movies(n: int = 10):
    """Global top movies by average score."""
    return [
        {"movie": m.to_dict(), "avg_score": score}
        for m, score in app_state.ranking_service.top_movies(n)
    ]


@api.get("/movies/{movie_id}/stats")
def movie_stats(movie_id: str):
    """Average score + pairwise win rate for a movie."""
    return {
        "movie_id": movie_id,
        "avg_score": app_state.ranking_service.average_score(movie_id),
        "win_rate": app_state.ranking_service.pairwise_win_rate(movie_id),
    }


# ── Feed endpoints ────────────────────────────────────────────────────────────

@api.get("/users/{user_id}/feed")
def get_feed(user_id: str, session_token: str, limit: int = 20):
    """Activity feed — rankings from users the current user follows."""
    get_user_id(session_token)
    try:
        feed = app_state.feed_service.get_feed(user_id, limit)
        return [r.to_dict() for r in feed]
    except ValueError as e:
        raise HTTPException(404, str(e))


@api.post("/users/{user_id}/follow")
def follow(user_id: str, body: FollowRequest, session_token: str):
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    try:
        app_state.feed_service.follow(user_id, body.followee_id)
        return {"status": "following", "followee_id": body.followee_id}
    except ValueError as e:
        raise HTTPException(404, str(e))


@api.delete("/users/{user_id}/follow/{followee_id}")
def unfollow(user_id: str, followee_id: str, session_token: str):
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    app_state.feed_service.unfollow(user_id, followee_id)
    return {"status": "unfollowed", "followee_id": followee_id}


# ── Watchlist / saved endpoints ───────────────────────────────────────────────

@api.get("/users/{user_id}/watchlist")
def get_watchlist(user_id: str, session_token: str):
    get_user_id(session_token)
    return {"movie_ids": app_state.watchlist_service.get(user_id)}


@api.post("/users/{user_id}/watchlist")
def add_to_watchlist(user_id: str, body: WatchlistRequest, session_token: str):
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    # Detect upcoming vs catalog by id prefix (u- = upcoming, m- = catalog)
    item_type = "upcoming" if body.movie_id.startswith("u-") else "catalog"
    item = app_state.watchlist_service.add(user_id, body.movie_id, item_type)
    return {"movie_ids": app_state.watchlist_service.get(user_id), "added": item.to_dict()}


@api.delete("/users/{user_id}/watchlist/{movie_id}")
def remove_from_watchlist(user_id: str, movie_id: str, session_token: str):
    uid = get_user_id(session_token)
    if uid != user_id:
        raise HTTPException(403, "Forbidden")
    app_state.watchlist_service.remove(user_id, movie_id)
    return {"movie_ids": app_state.watchlist_service.get(user_id)}


# ── Health check ──────────────────────────────────────────────────────────────

@api.get("/health")
def health():
    return {"status": "ok", "timestamp": time.time()}
