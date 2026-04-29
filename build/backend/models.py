"""
SQLAlchemy ORM models. Mirror the dataclass-style domain types from the
original rated_backend.py but live in actual tables.

Naming: every row class ends in `Row` to keep them visually distinct from the
domain types (User, Movie, Ranking) that the API returns.
"""

from __future__ import annotations

import time

from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from db import Base


class UserRow(Base):
    __tablename__ = "users"

    user_id     = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    email       = Column(String, nullable=True)
    avatar_url  = Column(String, nullable=True)
    google_sub  = Column(String, nullable=True, unique=True, index=True)
    username    = Column(String, nullable=True, unique=True, index=True)
    # Private accounts route new follows to a pending state (see FollowRow).
    # Existing followers are unaffected when a user flips this on.
    is_private  = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at  = Column(Float, nullable=False, default=lambda: time.time())

    def to_dict(self):
        return {
            "user_id":          self.user_id,
            "name":             self.name,
            "email":            self.email,
            "avatar_url":       self.avatar_url,
            "username":         self.username,
            "is_private":       bool(self.is_private),
            "follower_count":   0,  # filled in by service when needed
            "following_count":  0,
        }


class MovieRow(Base):
    __tablename__ = "movies"

    movie_id    = Column(String, primary_key=True)
    title       = Column(String, nullable=False)
    genre       = Column(String, nullable=True)
    poster_url  = Column(String, nullable=True)
    year        = Column(Integer, nullable=True)

    def to_dict(self):
        return {
            "movie_id":   self.movie_id,
            "title":      self.title,
            "genre":      self.genre,
            "poster_url": self.poster_url,
            "year":       self.year,
        }


class RankingRow(Base):
    """A user's 1-10 rating of a movie. One row per (user, movie) — re-rating
    replaces the existing row in the service layer."""
    __tablename__ = "rankings"
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_rankings_user_movie"),)

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    movie_id    = Column(String, ForeignKey("movies.movie_id"), nullable=False, index=True)
    score       = Column(Integer, nullable=False)
    ranked_at   = Column(Float, nullable=False, default=lambda: time.time())

    user  = relationship("UserRow")
    movie = relationship("MovieRow")

    def to_dict(self):
        return {
            "user":      self.user.to_dict() if self.user else None,
            "movie":     self.movie.to_dict() if self.movie else None,
            "score":     self.score,
            "ranked_at": self.ranked_at,
        }


class PairwiseRow(Base):
    """User chose winner over loser in a head-to-head comparison."""
    __tablename__ = "pairwise"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(String, nullable=False, index=True)
    winner_movie_id = Column(String, nullable=False)
    loser_movie_id  = Column(String, nullable=False)
    timestamp       = Column(Float, nullable=False, default=lambda: time.time())


class WatchlistRow(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_watchlist_user_movie"),)

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    movie_id   = Column(String, ForeignKey("movies.movie_id"), nullable=False)
    item_type  = Column(String, nullable=False, default="catalog")  # catalog | upcoming
    added_at   = Column(Float, nullable=False, default=lambda: time.time())


class SavedRow(Base):
    __tablename__ = "saved"
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_saved_user_movie"),)

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    movie_id   = Column(String, ForeignKey("movies.movie_id"), nullable=False)
    added_at   = Column(Float, nullable=False, default=lambda: time.time())


class ReviewRow(Base):
    """One review per (user, movie). Re-submitting upserts."""
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_reviews_user_movie"),)

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    movie_id    = Column(String, ForeignKey("movies.movie_id"), nullable=False, index=True)
    rating      = Column(Integer, nullable=False)
    text        = Column(Text, nullable=False)
    created_at  = Column(Float, nullable=False, default=lambda: time.time())
    edited_at   = Column(Float, nullable=True)

    def to_dict(self):
        return {
            "user_id":    self.user_id,
            "movie_id":   self.movie_id,
            "rating":     self.rating,
            "text":       self.text,
            "created_at": self.created_at,
            "edited_at":  self.edited_at,
            "edited":     self.edited_at is not None,
        }


class FollowRow(Base):
    """Edge: follower_id follows followee_id.
    state is "approved" for normal follows and "pending" when the followee
    is private and hasn't accepted yet. Only "approved" rows count toward
    follower_count / following_count / feed."""
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "followee_id", name="uq_follow_edge"),
        Index("ix_follows_follower", "follower_id"),
        Index("ix_follows_followee", "followee_id"),
        Index("ix_follows_followee_state", "followee_id", "state"),
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    follower_id  = Column(String, ForeignKey("users.user_id"), nullable=False)
    followee_id  = Column(String, ForeignKey("users.user_id"), nullable=False)
    state        = Column(String, nullable=False, default="approved", server_default="approved")
    created_at   = Column(Float, nullable=False, default=lambda: time.time())


class SessionRow(Base):
    """A single login. Tokens are opaque urlsafe strings, indexed for O(1)
    lookup. Sessions expire after SESSION_TTL_SECONDS (default 30 days).
    Logout = delete the row."""
    __tablename__ = "sessions"

    token       = Column(String, primary_key=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    created_at  = Column(Float, nullable=False, default=lambda: time.time())
    expires_at  = Column(Float, nullable=False)


class NotificationRow(Base):
    """In-app notification. user_id is the recipient. type is a stable string
    ('follow', 'review', 'rank') so the frontend can render different layouts.
    actor_id + target_id let the UI link to the user/movie that caused it.
    body is a free-text fallback when richer rendering isn't available."""
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False)
    type        = Column(String, nullable=False)        # "follow" | "review" | "rank"
    actor_id    = Column(String, ForeignKey("users.user_id"), nullable=True)
    target_id   = Column(String, nullable=True)         # movie_id or another user_id, by type
    body        = Column(Text, nullable=True)
    read        = Column(Integer, nullable=False, default=0)  # 0 / 1 — sqlite-friendly bool
    created_at  = Column(Float, nullable=False, default=lambda: time.time())

    def to_dict(self):
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "type":       self.type,
            "actor_id":   self.actor_id,
            "target_id":  self.target_id,
            "body":       self.body,
            "read":       bool(self.read),
            "created_at": self.created_at,
        }


class ReportRow(Base):
    """User-submitted moderation report. target_type tells the moderator what
    kind of item was reported ("review", "feed", "user", "comment"); target_id
    is the string id from the frontend (rankings.id, reviews.id, or a mock
    feed item id like 'f-001'). Free-form by design — moderation triage will
    cluster these manually."""
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_reporter", "reporter_id"),
        Index("ix_reports_target_type", "target_type", "target_id"),
    )

    id            = Column(Integer, primary_key=True, autoincrement=True)
    reporter_id   = Column(String, ForeignKey("users.user_id"), nullable=False)
    target_type   = Column(String, nullable=False)
    target_id     = Column(String, nullable=False)
    target_label  = Column(String, nullable=True)
    reason_key    = Column(String, nullable=False)
    reason_label  = Column(String, nullable=True)
    created_at    = Column(Float, nullable=False, default=lambda: time.time())

    def to_dict(self):
        return {
            "id":           self.id,
            "reporter_id":  self.reporter_id,
            "target_type":  self.target_type,
            "target_id":    self.target_id,
            "target_label": self.target_label,
            "reason_key":   self.reason_key,
            "reason_label": self.reason_label,
            "created_at":   self.created_at,
        }


class FeedLikeRow(Base):
    """A like on a feed item. item_id is the string the frontend uses for the
    item (rankings.id, reviews.id, or a mock id like 'f-001'). Composite
    unique on (user_id, item_id) so a user can't double-like."""
    __tablename__ = "feed_likes"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_feed_likes_user_item"),
        Index("ix_feed_likes_item", "item_id"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False)
    item_id     = Column(String, nullable=False)
    created_at  = Column(Float, nullable=False, default=lambda: time.time())


class FeedReplyRow(Base):
    """A public reply to a feed item. Same item_id contract as FeedLikeRow.
    Body is capped to 280 chars at the API layer to match the frontend's
    Twitter-style input."""
    __tablename__ = "feed_replies"
    __table_args__ = (
        Index("ix_feed_replies_item", "item_id", "created_at"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, ForeignKey("users.user_id"), nullable=False)
    item_id     = Column(String, nullable=False)
    body        = Column(Text, nullable=False)
    created_at  = Column(Float, nullable=False, default=lambda: time.time())

    def to_dict(self):
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "item_id":    self.item_id,
            "body":       self.body,
            "created_at": self.created_at,
        }
