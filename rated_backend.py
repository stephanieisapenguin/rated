"""
Rated - Movie Ranking Backend
Architecture: ranking_service + feed_service + watchlist_service + auth gateway
"""

from __future__ import annotations
import hashlib
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


# ─── Domain Models ────────────────────────────────────────────────────────────

class Movie:
    def __init__(self, movie_id, title, genre=None, poster_url=None, year=None):
        self.movie_id = movie_id
        self.title = title
        self.genre = genre
        self.poster_url = poster_url
        self.year = year

    def __repr__(self):
        return f"Movie({self.movie_id}, '{self.title}')"

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
        self.google_sub = google_sub        # Google OAuth subject claim
        self.followers: set[str] = set()    # user_ids following this user
        self.following: set[str] = set()    # user_ids this user follows
        self.created_at = time.time()

    def __repr__(self):
        return f"User({self.user_id}, '{self.name}')"

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
    def __init__(self, user, movie, score):
        if not 1 <= score <= 10:
            raise ValueError("Score must be between 1 and 10")
        self.user = user
        self.movie = movie
        self.score = score
        self.ranked_at = time.time()

    def __repr__(self):
        return f"Ranking({self.user.name} -> {self.movie.title}: {self.score})"

    def to_dict(self):
        return {
            "user": self.user.to_dict(),
            "movie": self.movie.to_dict(),
            "score": self.score,
            "ranked_at": self.ranked_at,
        }


@dataclass
class PairwiseResult:
    """User chose winner over loser in a head-to-head comparison."""
    user_id: str
    winner_movie_id: str
    loser_movie_id: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class WatchlistItem:
    """A movie saved to a user's watchlist."""
    user_id: str
    movie_id: str
    item_type: str = "catalog"   # "catalog" | "upcoming"
    added_at: float = field(default_factory=time.time)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "movie_id": self.movie_id,
            "item_type": self.item_type,
            "added_at": self.added_at,
        }


# ─── Auth Service (Google OAuth stub) ─────────────────────────────────────────

class AuthService:
    """
    Stub for Google OAuth2 flow.
    In prod: validate id_token via google-auth library,
    extract sub/email/name/picture from JWT claims.
    """

    def __init__(self, user_db: UserDB):
        self._user_db = user_db

    def google_login(self, id_token: str) -> User:
        """
        Validate Google id_token → upsert User → return User.
        Stub: parse fake token of form 'sub|name|email'.
        """
        try:
            sub, name, email = id_token.split("|")
        except ValueError:
            raise ValueError("Invalid id_token format")

        existing = self._user_db.find_by_google_sub(sub)
        if existing:
            return existing

        user = User(
            user_id=str(uuid.uuid4()),
            name=name,
            email=email,
            google_sub=sub,
        )
        self._user_db.save(user)
        return user

    def generate_session_token(self, user: User) -> str:
        raw = f"{user.user_id}:{time.time()}"
        return hashlib.sha256(raw.encode()).hexdigest()


# ─── Databases (in-memory, swap for Postgres/Redis in prod) ───────────────────

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

    def seed_latest(self, movies: list[Movie]):
        """Seed from external source (TMDB, etc.)"""
        for m in movies:
            self.save(m)


class RankingsDB:
    def __init__(self):
        self._rankings: list[Ranking] = []
        self._pairwise: list[PairwiseResult] = []

    def save_ranking(self, ranking: Ranking):
        self._rankings = [
            r for r in self._rankings
            if not (r.user.user_id == ranking.user.user_id
                    and r.movie.movie_id == ranking.movie.movie_id)
        ]
        self._rankings.append(ranking)

    def save_pairwise(self, result: PairwiseResult):
        self._pairwise.append(result)

    def get_rankings(self) -> list[Ranking]:
        return list(self._rankings)

    def get_pairwise(self) -> list[PairwiseResult]:
        return list(self._pairwise)


class WatchlistDB:
    def __init__(self):
        self._items: list[WatchlistItem] = []

    def add(self, item: WatchlistItem):
        """Add item — silently skips duplicates for the same user+movie."""
        already_exists = any(
            i.user_id == item.user_id and i.movie_id == item.movie_id
            for i in self._items
        )
        if not already_exists:
            self._items.append(item)

    def remove(self, user_id: str, movie_id: str):
        self._items = [
            i for i in self._items
            if not (i.user_id == user_id and i.movie_id == movie_id)
        ]

    def get_for_user(self, user_id: str) -> list[WatchlistItem]:
        return [i for i in self._items if i.user_id == user_id]

    def contains(self, user_id: str, movie_id: str) -> bool:
        return any(
            i.user_id == user_id and i.movie_id == movie_id
            for i in self._items
        )


# ─── Ranking Service ───────────────────────────────────────────────────────────

class RankingService:
    """
    POST /users/{user_id}/movies      → add_ranking
    GET  /users/{user_id}/rankings    → user_rankings
    GET  /movies/top                  → top_movies
    POST /users/{user_id}/pairwise    → record_pairwise
    """

    def __init__(self, rankings_db: RankingsDB, movie_db: MovieDB, user_db: UserDB):
        self._db = rankings_db
        self._movies = movie_db
        self._users = user_db

    def add_ranking(self, user_id: str, movie_id: str, score: int) -> Ranking:
        user = self._users.get(user_id)
        movie = self._movies.get(movie_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        if not movie:
            raise ValueError(f"Movie {movie_id} not found")
        ranking = Ranking(user, movie, score)
        self._db.save_ranking(ranking)
        return ranking

    def user_rankings(self, user_id: str) -> list[Ranking]:
        return sorted(
            [r for r in self._db.get_rankings() if r.user.user_id == user_id],
            key=lambda r: r.score,
            reverse=True,
        )

    def average_score(self, movie_id: str) -> float:
        scores = [
            r.score for r in self._db.get_rankings()
            if r.movie.movie_id == movie_id
        ]
        return round(sum(scores) / len(scores), 2) if scores else 0.0

    def top_movies(self, n: int = 10) -> list[tuple[Movie, float]]:
        seen: dict[str, Movie] = {}
        for r in self._db.get_rankings():
            seen[r.movie.movie_id] = r.movie
        ranked = sorted(
            seen.values(),
            key=lambda m: self.average_score(m.movie_id),
            reverse=True,
        )
        return [(m, self.average_score(m.movie_id)) for m in ranked[:n]]

    def record_pairwise(self, user_id: str, winner_id: str, loser_id: str) -> PairwiseResult:
        result = PairwiseResult(
            user_id=user_id,
            winner_movie_id=winner_id,
            loser_movie_id=loser_id,
        )
        self._db.save_pairwise(result)
        return result

    def pairwise_win_rate(self, movie_id: str) -> float:
        results = self._db.get_pairwise()
        involving = [r for r in results if r.winner_movie_id == movie_id or r.loser_movie_id == movie_id]
        if not involving:
            return 0.0
        wins = sum(1 for r in involving if r.winner_movie_id == movie_id)
        return round(wins / len(involving), 2)


# ─── Feed Service ──────────────────────────────────────────────────────────────

class FeedService:
    """
    GET /users/{user_id}/feed  → activity from followed users
    """

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

    def get_feed(self, user_id: str, limit: int = 20) -> list[Ranking]:
        user = self._users.get(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        feed = [
            r for r in self._db.get_rankings()
            if r.user.user_id in user.following
        ]
        feed.sort(key=lambda r: r.ranked_at, reverse=True)
        return feed[:limit]


# ─── Watchlist Service ─────────────────────────────────────────────────────────

class WatchlistService:
    """
    POST   /users/{user_id}/watchlist            → add
    DELETE /users/{user_id}/watchlist/{movie_id} → remove
    GET    /users/{user_id}/watchlist            → get
    """

    def __init__(self, watchlist_db: WatchlistDB, movie_db: MovieDB):
        self._db = watchlist_db
        self._movies = movie_db

    def add(self, user_id: str, movie_id: str, item_type: str = "catalog") -> WatchlistItem:
        """Add a movie to the user's watchlist. No-op if already present."""
        if item_type not in ("catalog", "upcoming"):
            raise ValueError("item_type must be 'catalog' or 'upcoming'")
        item = WatchlistItem(user_id=user_id, movie_id=movie_id, item_type=item_type)
        self._db.add(item)
        return item

    def remove(self, user_id: str, movie_id: str):
        """Remove a movie from the user's watchlist."""
        self._db.remove(user_id, movie_id)

    def get(self, user_id: str) -> list[str]:
        """Return list of movie_ids on the user's watchlist, newest first."""
        items = sorted(
            self._db.get_for_user(user_id),
            key=lambda i: i.added_at,
            reverse=True,
        )
        return [i.movie_id for i in items]

    def get_detailed(self, user_id: str) -> list[WatchlistItem]:
        """Return full WatchlistItem objects, newest first."""
        return sorted(
            self._db.get_for_user(user_id),
            key=lambda i: i.added_at,
            reverse=True,
        )

    def contains(self, user_id: str, movie_id: str) -> bool:
        return self._db.contains(user_id, movie_id)


# ─── App (dependency injection root) ──────────────────────────────────────────

class App:
    def __init__(self):
        self.user_db       = UserDB()
        self.movie_db      = MovieDB()
        self.rankings_db   = RankingsDB()
        self.watchlist_db  = WatchlistDB()

        self.auth              = AuthService(self.user_db)
        self.ranking_service   = RankingService(self.rankings_db, self.movie_db, self.user_db)
        self.feed_service      = FeedService(self.rankings_db, self.user_db)
        self.watchlist_service = WatchlistService(self.watchlist_db, self.movie_db)

    def seed_movies(self, movies: list[Movie]):
        self.movie_db.seed_latest(movies)


# ─── Demo ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()

    app.seed_movies([
        Movie("m1", "Inception",                           "Sci-Fi",  year=2010),
        Movie("m2", "Parasite",                            "Thriller",year=2019),
        Movie("m3", "Moonlight",                           "Drama",   year=2016),
        Movie("m4", "Everything Everywhere All at Once",   "Sci-Fi",  year=2022),
    ])

    alice = app.auth.google_login("sub_alice|Alice|alice@example.com")
    bob   = app.auth.google_login("sub_bob|Bob|bob@example.com")

    # Rankings
    app.ranking_service.add_ranking(alice.user_id, "m1", 9)
    app.ranking_service.add_ranking(alice.user_id, "m2", 10)
    app.ranking_service.add_ranking(bob.user_id,   "m1", 8)
    app.ranking_service.add_ranking(bob.user_id,   "m3", 10)

    # Pairwise
    app.ranking_service.record_pairwise(alice.user_id, "m2", "m1")
    app.ranking_service.record_pairwise(bob.user_id,   "m3", "m2")

    # Follow
    app.feed_service.follow(alice.user_id, bob.user_id)

    # Watchlist
    app.watchlist_service.add(alice.user_id, "m3", "catalog")
    app.watchlist_service.add(alice.user_id, "m4", "upcoming")
    app.watchlist_service.add(alice.user_id, "m3", "catalog")  # duplicate → ignored

    print("Alice's rankings:  ", app.ranking_service.user_rankings(alice.user_id))
    print("Top movies:        ", app.ranking_service.top_movies())
    print("Parasite avg:      ", app.ranking_service.average_score("m2"))
    print("Parasite win rate: ", app.ranking_service.pairwise_win_rate("m2"))
    print("Alice's feed:      ", app.feed_service.get_feed(alice.user_id))
    print("Alice's watchlist: ", app.watchlist_service.get(alice.user_id))
    print("Alice has m3?      ", app.watchlist_service.contains(alice.user_id, "m3"))
