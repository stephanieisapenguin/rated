from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .db import UserDB, MovieDB, RankingsDB
from .models import Movie
from .services import AuthService, RankingService, FeedService


# ─── Dependency injection ──────────────────────────────────────────────────────

class State:
    user_db: UserDB
    movie_db: MovieDB
    rankings_db: RankingsDB
    auth: AuthService
    ranking_svc: RankingService
    feed_svc: FeedService


_state = State()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state.user_db = UserDB()
    _state.movie_db = MovieDB()
    _state.rankings_db = RankingsDB()
    _state.auth = AuthService(_state.user_db)
    _state.ranking_svc = RankingService(_state.rankings_db, _state.movie_db, _state.user_db)
    _state.feed_svc = FeedService(_state.rankings_db, _state.user_db)

    # Seed sample data (remove in prod — pull from TMDB instead)
    _state.movie_db.seed([
        Movie("m1", "Inception", "Sci-Fi", year=2010),
        Movie("m2", "Parasite", "Thriller", year=2019),
        Movie("m3", "Moonlight", "Drama", year=2016),
        Movie("m4", "Everything Everywhere All at Once", "Sci-Fi", year=2022),
    ])
    yield


app = FastAPI(title="Rated API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:5174",   # Vite dev server (alt port)
        "http://localhost:4173",   # Vite preview
        # add your prod domain here e.g. "https://rated.example.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_state() -> State:
    return _state


# ─── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    id_token: str

class RankingRequest(BaseModel):
    movie_id: str
    score: int = Field(..., ge=1, le=10)

class PairwiseRequest(BaseModel):
    winner_movie_id: str
    loser_movie_id: str

class FollowRequest(BaseModel):
    followee_id: str

class SeedMovieRequest(BaseModel):
    movie_id: str
    title: str
    genre: str | None = None
    poster_url: str | None = None
    year: int | None = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# Auth
@app.post("/auth/google")
async def google_login(body: LoginRequest, s: State = Depends(get_state)):
    try:
        user = await s.auth.google_login(body.id_token)
        token = s.auth.generate_session_token(user)
        return {"user": user.to_dict(), "session_token": token}
    except ValueError as e:
        raise HTTPException(400, str(e))


# Movies
@app.get("/movies")
def list_movies(s: State = Depends(get_state)):
    return [m.to_dict() for m in s.movie_db.all()]

@app.get("/movies/top")
def top_movies(n: int = 10, s: State = Depends(get_state)):
    return s.ranking_svc.top_movies(n)

@app.get("/movies/{movie_id}")
def get_movie(movie_id: str, s: State = Depends(get_state)):
    movie = s.movie_db.get(movie_id)
    if not movie:
        raise HTTPException(404, "Movie not found")
    return {
        **movie.to_dict(),
        "avg_score": s.ranking_svc.average_score(movie_id),
        "pairwise_win_rate": s.ranking_svc.pairwise_win_rate(movie_id),
    }

@app.post("/movies/seed")
def seed_movie(body: SeedMovieRequest, s: State = Depends(get_state)):
    """Upsert a movie (e.g. from TMDB webhook or admin tool)."""
    movie = Movie(
        movie_id=body.movie_id,
        title=body.title,
        genre=body.genre,
        poster_url=body.poster_url,
        year=body.year,
    )
    s.movie_db.save(movie)
    return movie.to_dict()


# Rankings
@app.post("/users/{user_id}/rankings")
async def add_ranking(user_id: str, body: RankingRequest, s: State = Depends(get_state)):
    try:
        ranking = await s.ranking_svc.add_ranking(user_id, body.movie_id, body.score)
        return ranking.to_dict()
    except ValueError as e:
        raise HTTPException(404, str(e))

@app.get("/users/{user_id}/rankings")
def user_rankings(user_id: str, s: State = Depends(get_state)):
    return [r.to_dict() for r in s.ranking_svc.user_rankings(user_id)]

@app.post("/users/{user_id}/pairwise")
async def record_pairwise(user_id: str, body: PairwiseRequest, s: State = Depends(get_state)):
    result = await s.ranking_svc.record_pairwise(
        user_id, body.winner_movie_id, body.loser_movie_id
    )
    return {"user_id": result.user_id, "winner": result.winner_movie_id, "loser": result.loser_movie_id}


# Social
@app.post("/users/{user_id}/follow")
def follow(user_id: str, body: FollowRequest, s: State = Depends(get_state)):
    try:
        s.feed_svc.follow(user_id, body.followee_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(404, str(e))

@app.delete("/users/{user_id}/follow/{followee_id}")
def unfollow(user_id: str, followee_id: str, s: State = Depends(get_state)):
    s.feed_svc.unfollow(user_id, followee_id)
    return {"ok": True}

@app.get("/users/{user_id}/feed")
def get_feed(user_id: str, limit: int = 20, s: State = Depends(get_state)):
    try:
        return s.feed_svc.get_feed(user_id, limit)
    except ValueError as e:
        raise HTTPException(404, str(e))

@app.get("/users/{user_id}")
def get_user(user_id: str, s: State = Depends(get_state)):
    user = s.user_db.get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user.to_dict()
