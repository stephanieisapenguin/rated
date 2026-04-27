"""
TMDB client + in-process cache.

Why this lives on the backend instead of the frontend:
- the API key is one secret instead of one-per-user (frontend code would have
  to ship it in the bundle, visible in DevTools)
- cache is shared across users; popular/upcoming list refreshes 10× per
  second-of-traffic become a single fetch every 10 minutes
- rate limits no longer follow individual users around

Cache strategy: per-URL dict with absolute expiry timestamps. Single uvicorn
worker (Replit Autoscale default) → no cross-process coordination needed. If
we ever go multi-worker, swap for redis or memcached.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Optional

import httpx

TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_LIST_TTL = 10 * 60          # 10 minutes — popular/upcoming/top-rated/search
TMDB_DETAIL_TTL = 60 * 60        # 1 hour — single-movie /movie/{id}

# url → (data, expires_at)
_cache: dict[str, tuple[Any, float]] = {}
# Lock per cache key so 100 concurrent requests for the same uncached path
# only fetch once. Lock objects are cheap; we never garbage-collect them.
_locks: dict[str, asyncio.Lock] = {}


def _api_key() -> str:
    """Read at call time so changing the env var doesn't require restart."""
    return os.environ.get("TMDB_API_KEY", "").strip()


def is_configured() -> bool:
    return bool(_api_key())


async def fetch(path: str, *, params: Optional[dict] = None,
                ttl: int = TMDB_LIST_TTL) -> dict:
    """GET https://api.themoviedb.org/3{path}, cached.
    Raises HTTPError on non-2xx (caller should map to 502/503)."""
    if not is_configured():
        raise RuntimeError("TMDB_API_KEY not set on the backend")

    # Build a stable cache key including any query params.
    qs = "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
    cache_key = f"{path}?{qs}" if qs else path

    cached = _cache.get(cache_key)
    if cached and cached[1] > time.time():
        return cached[0]

    lock = _locks.setdefault(cache_key, asyncio.Lock())
    async with lock:
        # Double-check after acquiring lock — another waiter may have populated.
        cached = _cache.get(cache_key)
        if cached and cached[1] > time.time():
            return cached[0]

        merged_params = dict(params or {})
        merged_params["api_key"] = _api_key()
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{TMDB_API_BASE}{path}", params=merged_params)
            r.raise_for_status()
            data = r.json()

        _cache[cache_key] = (data, time.time() + ttl)
        return data


def cache_size() -> int:
    """For the cache-stats endpoint / observability."""
    return len(_cache)


def clear_cache() -> int:
    """Wipe the cache — used by tests + a future admin endpoint."""
    n = len(_cache)
    _cache.clear()
    _locks.clear()
    return n
