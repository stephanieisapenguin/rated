from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


class Movie:
    def __init__(self, movie_id, title, genre=None, poster_url=None, year=None):
        self.movie_id = movie_id
        self.title = title
        self.genre = genre
        self.poster_url = poster_url
        self.year = year

    def to_dict(self):
        return {
            "movie_id": self.movie_id,
            "title": self.title,
            "genre": self.genre,
            "poster_url": self.poster_url,
            "year": self.year,
        }


class User:
    def __init__(self, user_id, name, email=None, avatar_url=None, google_sub=None):
        self.user_id = user_id
        self.name = name
        self.email = email
        self.avatar_url = avatar_url
        self.google_sub = google_sub
        self.followers: set[str] = set()
        self.following: set[str] = set()
        self.created_at = time.time()

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "follower_count": len(self.followers),
            "following_count": len(self.following),
        }


class Ranking:
    def __init__(self, user_id: str, movie_id: str, score: int):
        if not 1 <= score <= 10:
            raise ValueError("Score must be between 1 and 10")
        self.user_id = user_id
        self.movie_id = movie_id
        self.score = score
        self.ranked_at = time.time()

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "movie_id": self.movie_id,
            "score": self.score,
            "ranked_at": self.ranked_at,
        }


@dataclass
class PairwiseResult:
    user_id: str
    winner_movie_id: str
    loser_movie_id: str
    timestamp: float = field(default_factory=time.time)
