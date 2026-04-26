"""
Shared pytest fixtures.

Each test gets a fresh on-disk SQLite file so the seed runs cleanly and
tests don't see each other's data. We point DATABASE_URL at a tempfile
*before* importing api/db so the engine binds to the test DB.
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    """Yields a FastAPI TestClient bound to a throwaway SQLite file."""
    # Make `import api`, `import db`, `import models` resolve from backend/.
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    # Fresh SQLite file per test so seeds are deterministic.
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp.name}"

    # Reload modules in dependency order so they pick up DATABASE_URL.
    for mod_name in ("db", "models", "rated_backend", "api"):
        if mod_name in sys.modules:
            importlib.reload(sys.modules[mod_name])
        else:
            importlib.import_module(mod_name)

    from fastapi.testclient import TestClient
    import api  # noqa: E402

    with TestClient(api.app) as c:  # `with` triggers @app.on_event("startup")
        yield c

    Path(tmp.name).unlink(missing_ok=True)
