from __future__ import annotations
import hashlib
import time
import uuid
from typing import Optional

import httpx

from .db import UserDB, MovieDB, RankingsDB
from .models import Movie, User, Ranking, PairwiseResult


class AuthService:
    """
    Google OAuth2.  Prod: POST id_token to tokeninfo endpoint via httpx.
    Stub: parse fake token of form 'sub|name|email'.
    """

    def __init__(self, user_db: UserDB):
        self._db = user_db

    async def google_login(self, id_token: str) -> User:
        # --- swap this block for real Google verification in prod ---
        try:
            sub, name, email = id_token.split("|")
        except ValueError:
            # Real prod path:
            # async with httpx.AsyncClient() as client:
            #     r = await client.get(
            #         "https://oauth2.googleapis.com/tokeninfo",
            #         params={"id_token": id_token},
            #     )
            #     r.raise_for_status()
            #     claims = r.json()
            # sub, name, email = claims["sub"], claims["name"], claims["email"]
            raise ValueError("Invalid id_token format")
        # ------------------------------------------------------------

        existing = self._db.find_by_google_sub(sub)
        if existing:
            return existing

        user = User(user_id=str(uuid.uuid4()), name=name, email=email, google_sub=sub)
        self._db.save(user)
        return user

    @staticmethod
    def generate_session_token(user: User) -> str:
        raw = f"{user.user_id}:{time.time()}"
        return hashlib.sha256(raw.encode()).hexdigest()


class RankingService:
    def __init__(self, rankings_db: RankingsDB, movie_db: MovieDB, user_db: UserDB):
        self._db = rankings_db
        self._movies = movie_db
        self._users = user_db

    async def add_ranking(self, user_id: str, movie_id: str, score: int) -> Ranking:
        if not self._users.get(user_id):
            raise ValueError(f"User {user_id} not found")
        if not self._movies.get(movie_id):
            raise ValueError(f"Movie {movie_id} not found")
        ranking = Ranking(user_id=user_id, movie_id=movie_id, score=score)
        await self._db.save_ranking(ranking)
        return ranking

    def user_rankings(self, user_id: str) -> list[Ranking]:
        return self._db.user_rankings(user_id)

    def average_score(self, movie_id: str) -> float:
        return self._db.average_score(movie_id)

    def top_movies(self, n: int = 10) -> list[dict]:
        results = self._db.top_movies(n)
        out = []
        for movie_id, avg in results:
            movie = self._movies.get(movie_id)
            if movie:
                out.append({"movie": movie.to_dict(), "avg_score": avg})
        return out

    async def record_pairwise(self, user_id: str, winner_id: str, loser_id: str) -> PairwiseResult:
        result = PairwiseResult(user_id=user_id, winner_movie_id=winner_id, loser_movie_id=loser_id)
        await self._db.save_pairwise(result)
        return result

    def pairwise_win_rate(self, movie_id: str) -> float:
        return self._db.pairwise_win_rate(movie_id)


class FeedService:
    def __init__(self, rankings_db: RankingsDB, user_db: UserDB):
        self._db = rankings_db
        self._users = user_db

    def follow(self, follower_id: str, followee_id: str):
        follower = self._users.get(follower_id)
        followee = self._users.get(followee_id)
        if not follower or not followee:
            raise ValueError("User not found")
        follower.following.add(followee_id)
        followee.followers.add(follower_id)

    def unfollow(self, follower_id: str, followee_id: str):
        follower = self._users.get(follower_id)
        followee = self._users.get(followee_id)
        if follower:
            follower.following.discard(followee_id)
        if followee:
            followee.followers.discard(follower_id)

    def get_feed(self, user_id: str, limit: int = 20) -> list[dict]:
        user = self._users.get(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        rankings = self._db.get_feed(user.following, limit)
        return [r.to_dict() for r in rankings]
