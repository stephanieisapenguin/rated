"""
Rated - Movie Ranking Backend (SQLAlchemy edition)

Service classes that wrap the ORM models in models.py. Every method takes a
SQLAlchemy Session as its first argument so FastAPI can inject one per
request via Depends(get_db).

Architecture preserved from the original in-memory version:
    AuthService     auth gateway (Google OAuth stub)
    RankingService  add_ranking, top_movies, pairwise
    FeedService     follow / unfollow / get_feed
    WatchlistService
    SavedMovieService
    ReviewService

The App() class at the bottom wires everything together so callers can do
`app_instance.ranking_service.add_ranking(db, ...)`.
"""

from __future__ import annotations

import enum
import os
import re
import secrets
import time
import uuid
from typing import Optional

from sqlalchemy import delete, select, func
from sqlalchemy.orm import Session

from models import (
    UserRow, MovieRow, RankingRow, PairwiseRow,
    WatchlistRow, SavedRow, ReviewRow, FollowRow, SessionRow,
    NotificationRow,
)


# Session lifetime — 30 days unless overridden.
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", 30 * 24 * 3600))


class NotificationType(str, enum.Enum):
    """Closed set of notification kinds. Stored as a string in the DB so
    SQLite/Postgres are both happy without a real ENUM type. Validated in the
    service layer instead. Add new variants here when emitting new kinds."""
    FOLLOW         = "follow"
    FOLLOW_REQUEST = "follow_request"   # private account got asked to be followed
    REVIEW         = "review"           # reserved — not auto-emitted yet
    RANK           = "rank"             # reserved — not auto-emitted yet


# ─── Convenience factories ────────────────────────────────────────────────────

def Movie(movie_id, title, genre=None, poster_url=None, year=None) -> MovieRow:
    """Helper kept for legacy seed code. Returns a MovieRow ready to be added."""
    return MovieRow(
        movie_id=movie_id, title=title, genre=genre,
        poster_url=poster_url, year=year,
    )


# Username validation, unchanged from the original.
_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
_RESERVED_USERNAMES = {"admin", "root", "rated", "support", "help", "api", "www"}


# ─── Auth Service ─────────────────────────────────────────────────────────────

class AuthService:
    """
    Google OAuth: when GOOGLE_CLIENT_ID env var is set, treats id_token as a
    real Google JWT and verifies the signature + audience via google-auth.
    Otherwise falls back to the dev-stub format "sub|name|email" so local
    development and tests don't need a Google client set up.
    """

    def google_login(self, db: Session, id_token: str) -> UserRow:
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        # Real Google JWTs are dot-separated base64 segments and never contain
        # a pipe character. The stub format "sub|name|email" is dev-only — and
        # also currently the only thing the Apple button sends until we ship
        # real Sign-in-with-Apple. Detect by delimiter so JWT-strict mode
        # still works for Google but the Apple stub also passes through.
        if "|" in id_token:
            sub, name, email = self._parse_stub(id_token)
        elif client_id:
            sub, name, email = self._verify_google_jwt(id_token, client_id)
        else:
            sub, name, email = self._parse_stub(id_token)

        existing = db.execute(
            select(UserRow).where(UserRow.google_sub == sub)
        ).scalar_one_or_none()
        if existing:
            # Refresh name/email in case Google profile changed.
            existing.name = name or existing.name
            existing.email = email or existing.email
            db.commit()
            db.refresh(existing)
            return existing

        user = UserRow(
            user_id=str(uuid.uuid4()),
            name=name,
            email=email,
            google_sub=sub,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def _parse_stub(id_token: str) -> tuple[str, str, str]:
        try:
            sub, name, email = id_token.split("|")
        except ValueError:
            raise ValueError("Invalid id_token format (expected 'sub|name|email')")
        return sub, name, email

    @staticmethod
    def _verify_google_jwt(id_token_str: str, client_id: str) -> tuple[str, str, str]:
        # Imported lazily so dev/test installs without google-auth still work.
        try:
            from google.oauth2 import id_token as g_id_token
            from google.auth.transport import requests as g_requests
        except ImportError as e:
            raise ValueError(f"google-auth not installed: {e}")
        try:
            claims = g_id_token.verify_oauth2_token(
                id_token_str, g_requests.Request(), client_id,
            )
        except ValueError as e:
            raise ValueError(f"Invalid Google id_token: {e}")
        sub = claims.get("sub")
        if not sub:
            raise ValueError("Google JWT missing required 'sub' claim")
        return sub, claims.get("name") or "", claims.get("email") or ""

    # ─── Sessions ────────────────────────────────────────────────────────────

    @staticmethod
    def create_session(db: Session, user: UserRow) -> SessionRow:
        """Mint a fresh opaque token and persist it. 256 bits of randomness via
        secrets.token_urlsafe — long enough to be infeasible to guess. Replaces
        the old deterministic sha256(user_id+timestamp) scheme."""
        row = SessionRow(
            token=secrets.token_urlsafe(32),
            user_id=user.user_id,
            expires_at=time.time() + SESSION_TTL_SECONDS,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    @staticmethod
    def get_user_from_session(db: Session, token: Optional[str]) -> Optional[UserRow]:
        """Look up the session, validate not-expired, return the user. None if
        token missing/unknown/expired."""
        if not token:
            return None
        row = db.get(SessionRow, token)
        if not row:
            return None
        if row.expires_at < time.time():
            db.delete(row)
            db.commit()
            return None
        return db.get(UserRow, row.user_id)

    @staticmethod
    def revoke_session(db: Session, token: str) -> bool:
        result = db.execute(delete(SessionRow).where(SessionRow.token == token))
        db.commit()
        return result.rowcount > 0

    # ─── Username claim flow ─────────────────────────────────────────────────

    @staticmethod
    def validate_username(username: str) -> Optional[str]:
        """Return None if valid, else error message."""
        if not _USERNAME_RE.match(username or ""):
            return "Username must be 3-20 chars: lowercase letters, numbers, underscores"
        if username.lower() in _RESERVED_USERNAMES:
            return "That username is reserved"
        return None

    def is_username_taken(self, db: Session, username: str) -> bool:
        return db.execute(
            select(func.count()).select_from(UserRow)
            .where(func.lower(UserRow.username) == username.lower())
        ).scalar() > 0

    def find_by_username(self, db: Session, username: str) -> Optional[UserRow]:
        return db.execute(
            select(UserRow).where(func.lower(UserRow.username) == username.lower())
        ).scalar_one_or_none()

    def claim_username(self, db: Session, user: UserRow, username: str) -> UserRow:
        user.username = username
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


# ─── Ranking Service ──────────────────────────────────────────────────────────

def ensure_movie_exists(db: Session, movie_id: str, meta: Optional[dict] = None) -> MovieRow:
    """Resolve a movie row, auto-creating it if the client supplied metadata.

    The seed catalog only contains the 5 hardcoded films; TMDB-sourced movies
    arrive with `tmdb-{id}` and aren't in our table yet. When the frontend
    ranks/saves/watchlist/reviews one of these, it sends the title/poster/etc
    alongside the request — we insert a row on first reference so foreign-key
    constraints hold and subsequent lookups (leaderboard, search, etc.) work.
    Without `meta` we still raise ValueError to preserve the legacy contract.
    """
    existing = db.get(MovieRow, movie_id)
    if existing:
        return existing
    if not meta or not meta.get("title"):
        raise ValueError(f"Movie {movie_id} not found")
    row = MovieRow(
        movie_id=movie_id,
        title=meta["title"],
        genre=meta.get("genre"),
        poster_url=meta.get("poster_url"),
        year=meta.get("year"),
    )
    db.add(row)
    db.flush()  # FKs in the same transaction can see it without committing
    return row


class RankingService:
    """add_ranking, user_rankings, average_score, top_movies, record_pairwise."""

    def add_ranking(self, db: Session, user_id: str, movie_id: str, score: int,
                    movie_meta: Optional[dict] = None) -> RankingRow:
        if not 1 <= score <= 10:
            raise ValueError("Score must be between 1 and 10")
        if not db.get(UserRow, user_id):
            raise ValueError(f"User {user_id} not found")
        ensure_movie_exists(db, movie_id, movie_meta)
        # Upsert: drop any existing (user, movie) row, then insert.
        db.execute(
            delete(RankingRow).where(
                RankingRow.user_id == user_id,
                RankingRow.movie_id == movie_id,
            )
        )
        row = RankingRow(user_id=user_id, movie_id=movie_id, score=score)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def user_rankings(self, db: Session, user_id: str,
                      limit: int = 50, offset: int = 0) -> list[RankingRow]:
        return list(db.execute(
            select(RankingRow)
            .where(RankingRow.user_id == user_id)
            .order_by(RankingRow.score.desc())
            .offset(offset).limit(limit)
        ).scalars())

    def average_score(self, db: Session, movie_id: str) -> float:
        avg = db.execute(
            select(func.avg(RankingRow.score)).where(RankingRow.movie_id == movie_id)
        ).scalar()
        return round(float(avg), 2) if avg is not None else 0.0

    def top_movies(self, db: Session, n: int = 10) -> list[tuple[MovieRow, float]]:
        rows = db.execute(
            select(MovieRow, func.avg(RankingRow.score).label("avg"))
            .join(RankingRow, RankingRow.movie_id == MovieRow.movie_id)
            .group_by(MovieRow.movie_id)
            .order_by(func.avg(RankingRow.score).desc())
            .limit(n)
        ).all()
        return [(m, round(float(avg), 2)) for m, avg in rows]

    def record_pairwise(self, db: Session, user_id: str, winner_id: str, loser_id: str) -> PairwiseRow:
        row = PairwiseRow(user_id=user_id, winner_movie_id=winner_id, loser_movie_id=loser_id)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row


# ─── Feed Service ─────────────────────────────────────────────────────────────

class FeedService:
    """follow, unfollow, get_feed, follower/following counts."""

    def follow(self, db: Session, follower_id: str, followee_id: str) -> dict:
        """Create a follow edge. Returns {state: "approved"|"pending"}.
        - Public followee → state="approved", takes effect immediately.
        - Private followee → state="pending", awaits the followee's approval.
        Idempotent: re-following preserves whatever state the existing edge has."""
        if follower_id == followee_id:
            raise ValueError("Cannot follow yourself")
        followee = db.get(UserRow, followee_id)
        if not db.get(UserRow, follower_id) or not followee:
            raise ValueError("User not found")
        # No-op if already following — don't double-emit notifications.
        existing = db.execute(
            select(FollowRow).where(
                FollowRow.follower_id == follower_id,
                FollowRow.followee_id == followee_id,
            )
        ).scalar_one_or_none()
        if existing:
            return {"state": existing.state}
        state = "pending" if followee.is_private else "approved"
        db.add(FollowRow(follower_id=follower_id, followee_id=followee_id, state=state))
        # Notify the followee. Approved follows get a FOLLOW notification;
        # pending requests on private accounts get FOLLOW_REQUEST so the
        # frontend can render approve/reject controls. Either way the actor
        # info is JOINed in at read time, no stale text.
        notif_type = (
            NotificationType.FOLLOW.value
            if state == "approved"
            else NotificationType.FOLLOW_REQUEST.value
        )
        db.add(NotificationRow(
            user_id=followee_id,
            type=notif_type,
            actor_id=follower_id,
        ))
        db.commit()
        return {"state": state}

    def unfollow(self, db: Session, follower_id: str, followee_id: str) -> None:
        """Remove the edge regardless of state — works for both unfollow and
        canceling-a-pending-request from the requester side."""
        db.execute(
            delete(FollowRow).where(
                FollowRow.follower_id == follower_id,
                FollowRow.followee_id == followee_id,
            )
        )
        db.commit()

    def follower_count(self, db: Session, user_id: str) -> int:
        """Approved followers only — pending requests don't count toward the
        public number on a profile."""
        return db.execute(
            select(func.count()).select_from(FollowRow)
            .where(FollowRow.followee_id == user_id, FollowRow.state == "approved")
        ).scalar() or 0

    def following_count(self, db: Session, user_id: str) -> int:
        return db.execute(
            select(func.count()).select_from(FollowRow)
            .where(FollowRow.follower_id == user_id, FollowRow.state == "approved")
        ).scalar() or 0

    # ─── Follow-request approvals (for private accounts) ─────────────────

    def list_pending_requests(self, db: Session, user_id: str) -> list[UserRow]:
        """Users who've asked to follow {user_id} and are still pending.
        Returned UserRow objects so the API can hand back full profile dicts."""
        rows = db.execute(
            select(UserRow)
            .join(FollowRow, FollowRow.follower_id == UserRow.user_id)
            .where(FollowRow.followee_id == user_id, FollowRow.state == "pending")
            .order_by(FollowRow.created_at.desc())
        ).scalars()
        return list(rows)

    def approve_request(self, db: Session, followee_id: str, follower_id: str) -> bool:
        """Flip a pending edge to approved. Returns False if no pending edge exists.

        On approval we also delete the existing FOLLOW_REQUEST notification on
        the followee (it's resolved — no point cluttering the inbox) and emit
        a fresh FOLLOW notification so the followee sees "X followed you" the
        same way they would for a public follow."""
        row = db.execute(
            select(FollowRow).where(
                FollowRow.follower_id == follower_id,
                FollowRow.followee_id == followee_id,
                FollowRow.state == "pending",
            )
        ).scalar_one_or_none()
        if not row:
            return False
        row.state = "approved"
        # Clear the resolved request notification.
        db.execute(
            delete(NotificationRow).where(
                NotificationRow.user_id == followee_id,
                NotificationRow.actor_id == follower_id,
                NotificationRow.type == NotificationType.FOLLOW_REQUEST.value,
            )
        )
        # Emit the regular FOLLOW notification — feed-style entry, distinct
        # from the dismissed request.
        db.add(NotificationRow(
            user_id=followee_id,
            type=NotificationType.FOLLOW.value,
            actor_id=follower_id,
        ))
        db.commit()
        return True

    def reject_request(self, db: Session, followee_id: str, follower_id: str) -> bool:
        """Delete a pending edge AND the FOLLOW_REQUEST notification it spawned.
        Returns False if no pending edge exists."""
        # Clear the resolved request notification regardless of whether the
        # edge delete succeeds — same target, same action.
        db.execute(
            delete(NotificationRow).where(
                NotificationRow.user_id == followee_id,
                NotificationRow.actor_id == follower_id,
                NotificationRow.type == NotificationType.FOLLOW_REQUEST.value,
            )
        )
        result = db.execute(
            delete(FollowRow).where(
                FollowRow.follower_id == follower_id,
                FollowRow.followee_id == followee_id,
                FollowRow.state == "pending",
            )
        )
        db.commit()
        return result.rowcount > 0

    def set_privacy(self, db: Session, user_id: str, is_private: bool) -> UserRow:
        """Toggle a user's account privacy. Existing followers are kept
        regardless — only future follow attempts route to pending."""
        user = db.get(UserRow, user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        user.is_private = bool(is_private)
        db.commit()
        db.refresh(user)
        return user

    def get_feed(self, db: Session, user_id: str,
                 limit: int = 20, offset: int = 0) -> list[RankingRow]:
        if not db.get(UserRow, user_id):
            raise ValueError(f"User {user_id} not found")
        # Only follow edges that have been approved contribute to the feed —
        # pending requests give the requester nothing to peek at.
        followee_ids = [r[0] for r in db.execute(
            select(FollowRow.followee_id).where(
                FollowRow.follower_id == user_id,
                FollowRow.state == "approved",
            )
        )]
        if not followee_ids:
            return []
        return list(db.execute(
            select(RankingRow)
            .where(RankingRow.user_id.in_(followee_ids))
            .order_by(RankingRow.ranked_at.desc())
            .offset(offset).limit(limit)
        ).scalars())


# ─── Watchlist Service ────────────────────────────────────────────────────────

class WatchlistService:
    def add(self, db: Session, user_id: str, movie_id: str, item_type: str = "catalog") -> WatchlistRow:
        if item_type not in ("catalog", "upcoming"):
            raise ValueError("item_type must be 'catalog' or 'upcoming'")
        existing = db.execute(
            select(WatchlistRow).where(
                WatchlistRow.user_id == user_id,
                WatchlistRow.movie_id == movie_id,
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        row = WatchlistRow(user_id=user_id, movie_id=movie_id, item_type=item_type)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def remove(self, db: Session, user_id: str, movie_id: str) -> None:
        db.execute(
            delete(WatchlistRow).where(
                WatchlistRow.user_id == user_id,
                WatchlistRow.movie_id == movie_id,
            )
        )
        db.commit()

    def get(self, db: Session, user_id: str,
            limit: int = 50, offset: int = 0) -> list[str]:
        rows = db.execute(
            select(WatchlistRow.movie_id)
            .where(WatchlistRow.user_id == user_id)
            .order_by(WatchlistRow.added_at.desc())
            .offset(offset).limit(limit)
        ).all()
        return [r[0] for r in rows]


# ─── Saved-Movies Service ─────────────────────────────────────────────────────

class SavedMovieService:
    def add(self, db: Session, user_id: str, movie_id: str,
            movie_meta: Optional[dict] = None) -> None:
        ensure_movie_exists(db, movie_id, movie_meta)
        existing = db.execute(
            select(SavedRow).where(
                SavedRow.user_id == user_id,
                SavedRow.movie_id == movie_id,
            )
        ).scalar_one_or_none()
        if existing:
            return
        db.add(SavedRow(user_id=user_id, movie_id=movie_id))
        db.commit()

    def remove(self, db: Session, user_id: str, movie_id: str) -> None:
        db.execute(
            delete(SavedRow).where(
                SavedRow.user_id == user_id,
                SavedRow.movie_id == movie_id,
            )
        )
        db.commit()

    def get(self, db: Session, user_id: str,
            limit: int = 50, offset: int = 0) -> list[str]:
        rows = db.execute(
            select(SavedRow.movie_id)
            .where(SavedRow.user_id == user_id)
            .order_by(SavedRow.added_at.desc())
            .offset(offset).limit(limit)
        ).all()
        return [r[0] for r in rows]


# ─── Review Service ───────────────────────────────────────────────────────────

class ReviewService:
    def submit(self, db: Session, user_id: str, movie_id: str, rating: int, text: str,
               movie_meta: Optional[dict] = None) -> ReviewRow:
        if not db.get(UserRow, user_id):
            raise ValueError(f"User {user_id} not found")
        ensure_movie_exists(db, movie_id, movie_meta)
        if not 1 <= rating <= 10:
            raise ValueError("Rating must be between 1 and 10")
        text = (text or "").strip()
        if not text:
            raise ValueError("Review text is required")
        if len(text) > 500:
            raise ValueError("Review text must be 500 characters or less")

        existing = db.execute(
            select(ReviewRow).where(
                ReviewRow.user_id == user_id,
                ReviewRow.movie_id == movie_id,
            )
        ).scalar_one_or_none()
        if existing:
            existing.rating = rating
            existing.text = text
            existing.edited_at = time.time()
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing

        row = ReviewRow(user_id=user_id, movie_id=movie_id, rating=rating, text=text)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def delete(self, db: Session, user_id: str, movie_id: str) -> bool:
        result = db.execute(
            delete(ReviewRow).where(
                ReviewRow.user_id == user_id,
                ReviewRow.movie_id == movie_id,
            )
        )
        db.commit()
        return result.rowcount > 0

    def get_for_user(self, db: Session, user_id: str,
                     limit: int = 50, offset: int = 0) -> list[ReviewRow]:
        return list(db.execute(
            select(ReviewRow)
            .where(ReviewRow.user_id == user_id)
            .order_by(func.coalesce(ReviewRow.edited_at, ReviewRow.created_at).desc())
            .offset(offset).limit(limit)
        ).scalars())

    def get_for_movie(self, db: Session, movie_id: str,
                      limit: int = 50, offset: int = 0) -> list[ReviewRow]:
        return list(db.execute(
            select(ReviewRow)
            .where(ReviewRow.movie_id == movie_id)
            .order_by(func.coalesce(ReviewRow.edited_at, ReviewRow.created_at).desc())
            .offset(offset).limit(limit)
        ).scalars())


# ─── Notification Service ────────────────────────────────────────────────────

class NotificationService:
    """List, mark-read, delete, and create notifications for a user. Auto-emit
    happens inline in other services (e.g. FeedService.follow), keeping
    callers decoupled from notification bookkeeping.

    list_for_user() returns dicts (not rows) because we LEFT JOIN the actor's
    current username/name — that way renaming an actor doesn't leave stale
    text in old notifications.
    """

    @staticmethod
    def _validate_type(type_filter: Optional[str]) -> Optional[str]:
        if type_filter is None:
            return None
        try:
            return NotificationType(type_filter).value
        except ValueError:
            valid = ", ".join(t.value for t in NotificationType)
            raise ValueError(f"Unknown notification type {type_filter!r}; expected one of: {valid}")

    def list_for_user(self, db: Session, user_id: str, *,
                      unread_only: bool = False,
                      type_filter: Optional[str] = None,
                      limit: int = 50, offset: int = 0) -> list[dict]:
        type_value = self._validate_type(type_filter)
        # LEFT JOIN keeps notifications visible even if their actor was deleted.
        actor = UserRow  # alias for readability
        stmt = (
            select(NotificationRow, actor)
            .outerjoin(actor, NotificationRow.actor_id == actor.user_id)
            .where(NotificationRow.user_id == user_id)
        )
        if unread_only:
            stmt = stmt.where(NotificationRow.read == 0)
        if type_value is not None:
            stmt = stmt.where(NotificationRow.type == type_value)
        stmt = stmt.order_by(NotificationRow.created_at.desc()).offset(offset).limit(limit)

        out = []
        for note, actor_row in db.execute(stmt):
            d = note.to_dict()
            d["actor"] = (
                {
                    "user_id":  actor_row.user_id,
                    "username": actor_row.username,
                    "name":     actor_row.name,
                }
                if actor_row else None
            )
            out.append(d)
        return out

    def unread_count(self, db: Session, user_id: str) -> int:
        return db.execute(
            select(func.count()).select_from(NotificationRow)
            .where(NotificationRow.user_id == user_id, NotificationRow.read == 0)
        ).scalar() or 0

    def mark_one_read(self, db: Session, user_id: str, notification_id: int) -> bool:
        row = db.get(NotificationRow, notification_id)
        if not row or row.user_id != user_id:
            return False
        if row.read:
            return True
        row.read = 1
        db.commit()
        return True

    def mark_all_read(self, db: Session, user_id: str) -> int:
        result = db.execute(
            select(NotificationRow)
            .where(NotificationRow.user_id == user_id, NotificationRow.read == 0)
        )
        rows = result.scalars().all()
        for r in rows:
            r.read = 1
        db.commit()
        return len(rows)

    def delete(self, db: Session, user_id: str, notification_id: int) -> bool:
        """Delete one notification. Returns False if not found or not owned."""
        row = db.get(NotificationRow, notification_id)
        if not row or row.user_id != user_id:
            return False
        db.delete(row)
        db.commit()
        return True


# ─── App (DI root) ────────────────────────────────────────────────────────────

class App:
    """Holds the service singletons. They're stateless wrt persistence — all
    state lives in the SQLAlchemy session passed through each call."""

    def __init__(self):
        self.auth                  = AuthService()
        self.ranking_service       = RankingService()
        self.feed_service          = FeedService()
        self.watchlist_service     = WatchlistService()
        self.saved_service         = SavedMovieService()
        self.review_service        = ReviewService()
        self.notification_service  = NotificationService()

    def seed_movies(self, db: Session, movies: list[MovieRow]) -> None:
        for m in movies:
            if not db.get(MovieRow, m.movie_id):
                db.add(m)
        db.commit()
