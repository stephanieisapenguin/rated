from __future__ import annotations
import asyncio
from typing import Optional
from .models import Movie, User, Ranking, PairwiseResult


class UserDB:
    def __init__(self):
        self._by_id: dict[str, User] = {}
        self._by_sub: dict[str, User] = {}

    def save(self, user: User):
        self._by_id[user.user_id] = user
        if user.google_sub:
            self._by_sub[user.google_sub] = user

    def get(self, user_id: str) -> Optional[User]:
        return self._by_id.get(user_id)

    def find_by_google_sub(self, sub: str) -> Optional[User]:
        return self._by_sub.get(sub)

    def all(self) -> list[User]:
        return list(self._by_id.values())


class MovieDB:
    def __init__(self):
        self._movies: dict[str, Movie] = {}

    def save(self, movie: Movie):
        self._movies[movie.movie_id] = movie

    def get(self, movie_id: str) -> Optional[Movie]:
        return self._movies.get(movie_id)

    def all(self) -> list[Movie]:
        return list(self._movies.values())

    def seed(self, movies: list[Movie]):
        for m in movies:
            self.save(m)


class RankingsDB:
    """
    Indexed for O(1) upserts and O(1) per-user/per-movie lookups.

    _by_key:      (user_id, movie_id) -> Ranking          — dedup + point lookup
    _by_user:     user_id -> list[Ranking]                 — user feed / user rankings
    _by_movie:    movie_id -> list[Ranking]                — average score
    _score_cache: movie_id -> [running_sum, count]         — O(1) average_score
    _pairwise:    list[PairwiseResult]

    All write paths are guarded by _lock so coroutines on the same event loop
    don't produce torn cache state.  In a multi-host deployment replace the
    in-memory structures with Redis hashes / sorted-sets and drop the lock —
    Redis is single-threaded and INCRBYFLOAT is atomic.
    """

    def __init__(self):
        self._by_key: dict[tuple[str, str], Ranking] = {}
        self._by_user: dict[str, list[Ranking]] = {}
        self._by_movie: dict[str, list[Ranking]] = {}
        self._score_cache: dict[str, list[float]] = {}  # [sum, count]
        self._pairwise: list[PairwiseResult] = []
        self._pairwise_wins: dict[str, int] = {}   # movie_id -> win count
        self._pairwise_total: dict[str, int] = {}  # movie_id -> total appearances
        self._lock = asyncio.Lock()

    async def save_ranking(self, ranking: Ranking):
        async with self._lock:
            key = (ranking.user_id, ranking.movie_id)
            old = self._by_key.get(key)
            if old:
                # evict old entry from per-user / per-movie lists
                self._by_user[ranking.user_id] = [
                    r for r in self._by_user[ranking.user_id] if r.movie_id != ranking.movie_id
                ]
                self._by_movie[ranking.movie_id] = [
                    r for r in self._by_movie[ranking.movie_id] if r.user_id != ranking.user_id
                ]
                # patch score cache
                s, c = self._score_cache[ranking.movie_id]
                self._score_cache[ranking.movie_id] = [s - old.score + ranking.score, c]
            else:
                s, c = self._score_cache.get(ranking.movie_id, [0.0, 0])
                self._score_cache[ranking.movie_id] = [s + ranking.score, c + 1]

            self._by_key[key] = ranking
            self._by_user.setdefault(ranking.user_id, []).append(ranking)
            self._by_movie.setdefault(ranking.movie_id, []).append(ranking)

    def average_score(self, movie_id: str) -> float:
        entry = self._score_cache.get(movie_id)
        if not entry or entry[1] == 0:
            return 0.0
        return round(entry[0] / entry[1], 2)

    def user_rankings(self, user_id: str) -> list[Ranking]:
        return sorted(self._by_user.get(user_id, []), key=lambda r: r.score, reverse=True)

    def rankings_for_movie(self, movie_id: str) -> list[Ranking]:
        return list(self._by_movie.get(movie_id, []))

    def top_movies(self, n: int = 10) -> list[tuple[str, float]]:
        """Returns list of (movie_id, avg_score) sorted descending."""
        scored = [
            (mid, self.average_score(mid))
            for mid in self._score_cache
            if self._score_cache[mid][1] > 0
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:n]

    async def save_pairwise(self, result: PairwiseResult):
        async with self._lock:
            self._pairwise.append(result)
            for mid in (result.winner_movie_id, result.loser_movie_id):
                self._pairwise_total[mid] = self._pairwise_total.get(mid, 0) + 1
            self._pairwise_wins[result.winner_movie_id] = (
                self._pairwise_wins.get(result.winner_movie_id, 0) + 1
            )

    def pairwise_win_rate(self, movie_id: str) -> float:
        total = self._pairwise_total.get(movie_id, 0)
        if total == 0:
            return 0.0
        return round(self._pairwise_wins.get(movie_id, 0) / total, 2)

    def get_feed(self, following: set[str], limit: int = 20) -> list[Ranking]:
        feed = [
            r for uid in following for r in self._by_user.get(uid, [])
        ]
        feed.sort(key=lambda r: r.ranked_at, reverse=True)
        return feed[:limit]
