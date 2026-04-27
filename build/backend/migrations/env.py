"""Alembic env — wired to read DATABASE_URL from the same place api.py does
and to introspect the ORM models registered on db.Base.metadata."""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Make the backend/ directory importable so `import db, models` works whether
# alembic is run from backend/ or from the repo root.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import db as app_db  # noqa: E402
import models  # noqa: E402,F401  (import side-effects: registers tables)

config = context.config

# Override the URL in alembic.ini with whatever the app uses (env or default).
config.set_main_option("sqlalchemy.url", app_db.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = app_db.Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without connecting (alembic upgrade --sql > out.sql)."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite needs batch mode to ALTER TABLE; harmless on Postgres.
        render_as_batch=app_db.DATABASE_URL.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations against a live engine (the normal path)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=app_db.DATABASE_URL.startswith("sqlite"),
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
