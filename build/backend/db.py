"""
Database engine + session setup.

Defaults to a local SQLite file (rated.db next to this module). Override
DATABASE_URL to point at Postgres (Netlify DB / Neon / RDS / etc).

Usage from FastAPI:
    from fastapi import Depends
    from db import get_db
    from sqlalchemy.orm import Session

    @app.get("/foo")
    def foo(db: Session = Depends(get_db)):
        ...
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


_DEFAULT_SQLITE = f"sqlite:///{Path(__file__).parent / 'rated.db'}"
DATABASE_URL = os.environ.get("DATABASE_URL") or _DEFAULT_SQLITE

# SQLite needs check_same_thread=False because FastAPI may call sessions from
# different threads. Postgres ignores connect_args.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """All ORM models inherit from this."""


def get_db():
    """FastAPI dependency: yields a session, ensures it closes after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Idempotent — safe to call on every startup."""
    # Import models so they register on Base.metadata before create_all.
    from models import (  # noqa: F401
        UserRow, MovieRow, RankingRow, PairwiseRow,
        WatchlistRow, SavedRow, ReviewRow, FollowRow, SessionRow,
    )
    Base.metadata.create_all(bind=engine)
