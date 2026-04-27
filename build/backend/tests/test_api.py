"""
End-to-end smoke tests covering every state-mutating endpoint plus the
restart-persistence guarantee. If something here fails, the wire-up
between FastAPI → SQLAlchemy → SQLite is broken.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_health(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "rated-api"
    assert body["status"] == "ok"
    assert body["movies_seeded"] == 5
    assert body["users_registered"] == 8


def test_healthz_db_ping(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


def test_seeded_movies(client):
    r = client.get("/movies")
    assert r.status_code == 200
    titles = {m["title"] for m in r.json()}
    assert titles == {"Interstellar", "Parasite", "The Dark Knight", "Whiplash", "RRR"}


def test_top_movies(client):
    """/movies/top must register before /movies/{movie_id} so 'top' isn't
    interpreted as a movie_id. Regression test for that route ordering."""
    r = client.get("/movies/top")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) > 0
    assert "movie" in body[0] and "avg_score" in body[0]


def _login(client, sub="alice", name="Alice", email="alice@test.com"):
    """Returns just user_id for callers that don't need the token."""
    return _login_full(client, sub, name, email)["user_id"]


def _login_full(client, sub="alice", name="Alice", email="alice@test.com"):
    """Returns the full login response — user_id + session_token."""
    r = client.post("/auth/login", json={"id_token": f"sub_{sub}|{name}|{email}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "session_token" in body and len(body["session_token"]) >= 32
    assert "expires_at" in body and body["expires_at"] > 0
    return body


def test_login_creates_user_and_persists(client):
    user_id = _login(client)
    r = client.get(f"/users/{user_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Alice"


def test_login_returns_secure_session_token(client):
    """Tokens must be opaque urlsafe random — not deterministic."""
    a = _login_full(client, sub="a", name="A", email="a@x.com")["session_token"]
    b = _login_full(client, sub="b", name="B", email="b@x.com")["session_token"]
    assert a != b
    # Old impl was sha256 hex (64 chars, [0-9a-f]) — new impl is base64url.
    assert any(c in a for c in "-_") or any(c.isupper() for c in a), \
        "looks like the old sha256 token format — should be secrets.token_urlsafe"


def test_username_claim_requires_session(client):
    # No token → 401
    r = client.post("/auth/username", json={"username": "alice"})
    assert r.status_code == 401
    # Garbage token → 401
    r = client.post(
        "/auth/username",
        params={"session_token": "not-a-real-token"},
        json={"username": "alice"},
    )
    assert r.status_code == 401


def test_username_claim_flow(client):
    token = _login_full(client)["session_token"]
    # Available?
    r = client.get("/auth/username/check/alice")
    assert r.status_code == 200 and r.json()["available"] is True
    # Claim with real session token
    r = client.post(
        "/auth/username",
        params={"session_token": token},
        json={"username": "alice"},
    )
    assert r.status_code == 200 and r.json()["ok"] is True
    # Lookup by username
    r = client.get("/users/by-username/alice")
    assert r.status_code == 200 and r.json()["username"] == "alice"
    # Now unavailable for someone else
    r = client.get("/auth/username/check/alice")
    assert r.json()["available"] is False


def test_logout_revokes_session(client):
    token = _login_full(client)["session_token"]
    # Token works initially
    r = client.post(
        "/auth/username",
        params={"session_token": token},
        json={"username": "alice"},
    )
    assert r.status_code == 200
    # Log out
    r = client.post("/auth/logout", params={"session_token": token})
    assert r.status_code == 200 and r.json() == {"ok": True, "revoked": True}
    # Same token now rejected
    r = client.post(
        "/auth/username",
        params={"session_token": token},
        json={"username": "alicia"},
    )
    assert r.status_code == 401


def test_logout_idempotent_on_unknown_token(client):
    r = client.post("/auth/logout", params={"session_token": "never-existed"})
    assert r.status_code == 200 and r.json() == {"ok": True, "revoked": False}


def test_username_validation_rejects_bad_input(client):
    _login(client)
    for bad in ("ab", "Alice", "admin", "no spaces", "way_too_long_username_here"):
        r = client.get(f"/auth/username/check/{bad}")
        assert r.status_code == 200
        assert r.json()["available"] is False, f"{bad!r} should be invalid"


def test_ranking_round_trip(client):
    user_id = _login(client)
    r = client.post(f"/users/{user_id}/rankings", json={"movie_id": "m-001", "score": 9})
    assert r.status_code == 200
    rankings = client.get(f"/users/{user_id}/rankings").json()
    assert len(rankings) == 1
    assert rankings[0]["movie"]["movie_id"] == "m-001"
    assert rankings[0]["score"] == 9


def test_ranking_replaces_existing(client):
    user_id = _login(client)
    client.post(f"/users/{user_id}/rankings", json={"movie_id": "m-001", "score": 5})
    client.post(f"/users/{user_id}/rankings", json={"movie_id": "m-001", "score": 10})
    rankings = client.get(f"/users/{user_id}/rankings").json()
    assert len(rankings) == 1
    assert rankings[0]["score"] == 10


def test_ranking_score_bounds(client):
    user_id = _login(client)
    for bad in (0, 11, -1, 100):
        r = client.post(f"/users/{user_id}/rankings", json={"movie_id": "m-001", "score": bad})
        assert r.status_code == 400, f"score={bad} should be rejected"


def test_follow_and_feed(client):
    me = _login(client, sub="me", name="Me", email="me@x.com")
    cine = client.get("/users/by-username/cinephile99").json()
    r = client.post(f"/users/{me}/follow", json={"followee_id": cine["user_id"]})
    assert r.status_code == 200

    feed = client.get(f"/users/{me}/feed").json()
    assert len(feed) > 0
    assert all(item["user"]["username"] == "cinephile99" for item in feed)

    # Unfollow drops the feed back to empty.
    client.delete(f"/users/{me}/follow/{cine['user_id']}")
    assert client.get(f"/users/{me}/feed").json() == []


def test_no_self_follow(client):
    me = _login(client)
    r = client.post(f"/users/{me}/follow", json={"followee_id": me})
    assert r.status_code == 400


def test_saved_round_trip(client):
    user_id = _login(client)
    client.post(f"/users/{user_id}/saved", json={"movie_id": "m-002"})
    client.post(f"/users/{user_id}/saved", json={"movie_id": "m-003"})
    saved = client.get(f"/users/{user_id}/saved").json()
    assert set(saved) == {"m-002", "m-003"}
    client.delete(f"/users/{user_id}/saved/m-002")
    assert client.get(f"/users/{user_id}/saved").json() == ["m-003"]


def test_review_upsert_stamps_edited_at(client):
    user_id = _login(client)
    r = client.post(
        f"/users/{user_id}/reviews",
        json={"movie_id": "m-001", "rating": 8, "text": "Great"},
    )
    first = r.json()
    assert first["edited"] is False

    r = client.post(
        f"/users/{user_id}/reviews",
        json={"movie_id": "m-001", "rating": 10, "text": "Even better on rewatch"},
    )
    second = r.json()
    assert second["edited"] is True
    assert second["rating"] == 10
    assert second["created_at"] == first["created_at"]  # preserved


def test_review_validation(client):
    user_id = _login(client)
    too_long = "x" * 501
    bad_inputs = [
        {"movie_id": "m-001", "rating": 0,  "text": "ok"},
        {"movie_id": "m-001", "rating": 11, "text": "ok"},
        {"movie_id": "m-001", "rating": 5,  "text": ""},
        {"movie_id": "m-001", "rating": 5,  "text": too_long},
        {"movie_id": "m-XXX", "rating": 5,  "text": "ok"},
    ]
    for body in bad_inputs:
        r = client.post(f"/users/{user_id}/reviews", json=body)
        assert r.status_code == 400, f"{body!r} should fail validation"


# ─── List endpoints ──────────────────────────────────────────────────────────


def test_list_users_default_returns_seeded(client):
    users = client.get("/users").json()
    assert len(users) == 8
    assert {u["username"] for u in users} >= {"cinephile99", "filmfreak", "maya"}


def test_list_users_search_by_username(client):
    users = client.get("/users", params={"q": "cine"}).json()
    assert len(users) == 1
    assert users[0]["username"] == "cinephile99"


def test_list_users_search_by_name(client):
    users = client.get("/users", params={"q": "freak"}).json()
    assert len(users) == 1 and users[0]["name"] == "Film Freak"


def test_list_users_limit(client):
    users = client.get("/users", params={"limit": 3}).json()
    assert len(users) == 3


def test_list_movies_search(client):
    r = client.get("/movies", params={"q": "stell"}).json()
    assert len(r) == 1 and r[0]["movie_id"] == "m-001"


def test_list_movies_genre_filter(client):
    r = client.get("/movies", params={"genre": "Action"}).json()
    titles = {m["title"] for m in r}
    assert titles == {"The Dark Knight", "RRR"}


def test_movie_stats(client):
    # Seeded m-001 rankings: cinephile99(9), filmfreak(9), maya(9),
    # jasonk(10), lina(8), carlos(7) → avg 8.67, count 6.
    s = client.get("/movies/m-001/stats").json()
    assert s["movie_id"] == "m-001"
    assert s["ranking_count"] == 6
    assert s["avg_score"] == 8.67
    assert s["review_count"] == 0


def test_movie_stats_404(client):
    assert client.get("/movies/m-XXX/stats").status_code == 404


def test_movie_rankings_listing(client):
    rows = client.get("/movies/m-002/rankings").json()
    # Seeded m-002: cinephile99(10), filmfreak(8), reeltalks(10),
    # maya(9), josh(8), lina(9) → 6 rankings.
    assert len(rows) == 6
    # Sorted by score desc — first must be a 10
    assert rows[0]["score"] == 10
    assert all(r["movie"]["movie_id"] == "m-002" for r in rows)


def test_followers_and_following_lists(client):
    me = _login(client, sub="me", name="Me", email="me@x.com")
    cine = client.get("/users/by-username/cinephile99").json()
    client.post(f"/users/{me}/follow", json={"followee_id": cine["user_id"]})

    following = client.get(f"/users/{me}/following").json()
    assert len(following) == 1
    assert following[0]["username"] == "cinephile99"

    followers = client.get(f"/users/{cine['user_id']}/followers").json()
    assert len(followers) == 1
    assert followers[0]["user_id"] == me

    # me has no followers; cine follows nobody.
    assert client.get(f"/users/{me}/followers").json() == []
    assert client.get(f"/users/{cine['user_id']}/following").json() == []


def test_followers_404_for_unknown_user(client):
    assert client.get("/users/no-such-user/followers").status_code == 404
    assert client.get("/users/no-such-user/following").status_code == 404


def test_persistence_across_restart(tmp_path, monkeypatch):
    """Mutate, drop the FastAPI process, create a new TestClient pointed at
    the same SQLite file → data is still there."""
    db_path = tmp_path / "persist.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    import importlib
    for mod in ("db", "models", "rated_backend", "api"):
        if mod in sys.modules:
            importlib.reload(sys.modules[mod])
        else:
            importlib.import_module(mod)

    from fastapi.testclient import TestClient
    import api

    # First "boot": login + rate.
    with TestClient(api.app) as c1:
        login = c1.post(
            "/auth/login",
            json={"id_token": "sub_persist|Persisted|p@x.com"},
        ).json()
        user_id = login["user_id"]
        c1.post(f"/users/{user_id}/rankings", json={"movie_id": "m-005", "score": 7})

    # Second "boot": brand new TestClient against the same DB file.
    for mod in ("db", "models", "rated_backend", "api"):
        importlib.reload(sys.modules[mod])
    import api as api2

    with TestClient(api2.app) as c2:
        rankings = c2.get(f"/users/{user_id}/rankings").json()
        assert len(rankings) == 1
        assert rankings[0]["movie"]["movie_id"] == "m-005"
        assert rankings[0]["score"] == 7
