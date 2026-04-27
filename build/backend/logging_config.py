"""
Structured logging setup.

Output is JSON in production (LOG_FORMAT=json) and human-readable colored
key/value pairs in dev (LOG_FORMAT=console, the default). Every line carries
the request_id bound by the middleware in api.py, so you can grep one
request's full path through the system.

Usage:
    from logging_config import get_logger
    log = get_logger(__name__)
    log.info("ranking.added", user_id=uid, movie_id=mid, score=8)

Sentry hookup is intentionally lazy — when SENTRY_DSN is set,
init_sentry() will configure it. Without the env var, no-op.
"""

from __future__ import annotations

import logging
import os
import sys

import structlog

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.environ.get("LOG_FORMAT", "console").lower()  # "console" | "json"


def configure_logging() -> None:
    """Idempotent — safe to call from app startup."""
    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)

    # Shared processors run on every event regardless of renderer.
    shared = [
        structlog.contextvars.merge_contextvars,  # picks up bound request_id
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        timestamper,
    ]

    if LOG_FORMAT == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(LOG_LEVEL)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Tame uvicorn's default access logging — its own logs go through stdlib
    # logging, so route them through structlog's renderer. Keep INFO+ to avoid
    # double-logging every request.
    logging.basicConfig(
        format="%(message)s",
        level=LOG_LEVEL,
        stream=sys.stdout,
    )


def init_sentry() -> None:
    """Initialize Sentry if SENTRY_DSN is set. No-op otherwise."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    except ImportError:
        get_logger(__name__).warning(
            "sentry.skipped",
            reason="sentry-sdk not installed; add it to requirements.txt to enable",
        )
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("ENVIRONMENT", "development"),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
    )


def get_logger(name: str = "") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
