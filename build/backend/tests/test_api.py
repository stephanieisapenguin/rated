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


def test_request_id_header_round_trip(client):
    """The middleware should accept an inbound X-Request-Id, echo it back,
    and generate one when the client doesn't supply one."""
    # Client supplies one
    r = client.get("/", headers={"X-Request-Id": "test-rid-abc-123"})
    assert r.headers["x-request-id"] == "test-rid-abc-123"

    # Client omits — we mint one (just confirm presence + uuid-ish length)
    r = client.get("/")
    rid = r.headers.get("x-request-id")
    assert rid and len(rid) >= 8


def test_login_is_rate_limited(client):
    """slowapi should 429 after 10 requests/min from the same IP."""
    body = {"id_token": "sub_ratelimit|RL|rl@x.com"}
    # First 10 succeed
    ok = 0
    for _ in range(10):
        if client.post("/auth/login", json=body).status_code == 200:
            ok += 1
    assert ok == 10
    # 11th hits the limit
    r = client.post("/auth/login", json=body)
    assert r.status_code == 429


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


# ─── TMDB proxy ──────────────────────────────────────────────────────────────


def test_tmdb_unconfigured_returns_503(client, monkeypatch):
    """No TMDB_API_KEY → endpoints return 503 with a useful message rather
    than confusing 500s. Cache-stats endpoint stays callable to confirm."""
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    r = client.get("/tmdb/popular")
    assert r.status_code == 503
    assert "TMDB_API_KEY" in r.json()["detail"]

    stats = client.get("/tmdb/cache-stats").json()
    assert stats["configured"] is False


def test_tmdb_popular_with_mocked_fetch(client, monkeypatch):
    """When configured, /tmdb/popular hands TMDB's body straight through."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    import tmdb as tmdb_module

    async def fake_fetch(path, params=None, ttl=None):
        assert path == "/movie/popular"
        assert params == {"page": 1}
        return {"page": 1, "results": [{"id": 42, "title": "Mocked Movie"}]}

    monkeypatch.setattr(tmdb_module, "fetch", fake_fetch)

    r = client.get("/tmdb/popular")
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 1
    assert body["results"][0]["title"] == "Mocked Movie"


def test_tmdb_search_requires_q(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    r = client.get("/tmdb/search", params={"q": ""})
    assert r.status_code == 400
    assert "non-empty" in r.json()["detail"]


def test_tmdb_search_passes_query_through(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    import tmdb as tmdb_module

    seen = {}
    async def fake_fetch(path, params=None, ttl=None):
        seen["path"] = path
        seen["params"] = params
        return {"page": 1, "results": []}
    monkeypatch.setattr(tmdb_module, "fetch", fake_fetch)

    client.get("/tmdb/search", params={"q": "interstellar", "page": 2})
    assert seen["path"] == "/search/movie"
    assert seen["params"] == {"query": "interstellar", "page": 2}


def test_tmdb_movie_detail_uses_long_ttl(client, monkeypatch):
    """Single-movie /tmdb/movie/{id} should pass the 1-hour TTL down."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    import tmdb as tmdb_module

    seen_ttl = {}
    async def fake_fetch(path, params=None, ttl=None):
        seen_ttl["ttl"] = ttl
        return {"id": 42, "title": "x"}
    monkeypatch.setattr(tmdb_module, "fetch", fake_fetch)

    client.get("/tmdb/movie/42")
    assert seen_ttl["ttl"] == tmdb_module.TMDB_DETAIL_TTL  # 3600


def test_tmdb_upstream_errors_propagate(client, monkeypatch):
    """If TMDB itself returns 404, we return 404 with TMDB's error body."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    import tmdb as tmdb_module
    import httpx

    async def fake_fetch(path, params=None, ttl=None):
        # Fabricate a 404 response object the way httpx would.
        req = httpx.Request("GET", "https://api.themoviedb.org" + path)
        resp = httpx.Response(404,
                              json={"status_message": "The resource you requested could not be found."},
                              request=req)
        raise httpx.HTTPStatusError("404 Not Found", request=req, response=resp)

    monkeypatch.setattr(tmdb_module, "fetch", fake_fetch)
    r = client.get("/tmdb/movie/999999")
    assert r.status_code == 404
    detail = r.json()["detail"]
    # detail is forwarded as the TMDB JSON body
    assert isinstance(detail, dict) and "status_message" in detail


# ─── User stats ──────────────────────────────────────────────────────────────


def test_user_stats_for_seeded_user(client):
    """cinephile99 has 4 seeded rankings: m-002(10), m-001(9), m-004(9), m-003(8).
    avg = 9.0, top genre = action (Dark Knight + Whiplash isn't action — actually
    Whiplash is Drama and TDK is Action, so Action=1, Sci-Fi=1, Thriller=1, Drama=1)."""
    cine = client.get("/users/by-username/cinephile99").json()
    s = client.get(f"/users/{cine['user_id']}/stats").json()
    assert s["user_id"] == cine["user_id"]
    assert s["ranking_count"] == 4
    assert s["avg_score"] == 9.0
    assert s["review_count"] == 0
    assert s["follower_count"] == 0
    assert s["following_count"] == 0
    # Top genres covers the 4 ranked movies — 4 distinct genres each appearing once.
    assert {g["genre"] for g in s["top_genres"]} == {
        "Sci-Fi", "Thriller", "Action", "Drama",
    }
    # Recent rankings list capped at 10, ordered by ranked_at desc
    assert len(s["recent_rankings"]) == 4
    assert all("score" in r and "movie" in r for r in s["recent_rankings"])


def test_user_stats_404_for_unknown_user(client):
    assert client.get("/users/no-such-user/stats").status_code == 404


def test_user_stats_for_user_with_no_rankings(client):
    """A freshly-created user with nothing yet — every count zero, avg_score 0.0."""
    user_id = _login(client, sub="empty", name="Empty", email="e@x.com")
    s = client.get(f"/users/{user_id}/stats").json()
    assert s["ranking_count"] == 0
    assert s["review_count"] == 0
    assert s["avg_score"] == 0.0
    assert s["top_genres"] == []
    assert s["recent_rankings"] == []


# ─── Notifications ───────────────────────────────────────────────────────────


def test_follow_emits_notification_on_followee(client):
    """When me follows cinephile99, cinephile99 sees a notification with the
    actor object populated."""
    me = _login_full(client, sub="me", name="Me", email="me@x.com")
    me_id = me["user_id"]
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    client.post("/auth/username", params={"session_token": me["session_token"]},
                json={"username": "meeee"})

    n0 = client.get(f"/users/{cine_id}/notifications").json()
    assert n0["unread_count"] == 0 and n0["items"] == []

    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    n1 = client.get(f"/users/{cine_id}/notifications").json()
    assert n1["unread_count"] == 1
    assert len(n1["items"]) == 1
    note = n1["items"][0]
    assert note["type"] == "follow"
    assert note["actor_id"] == me_id
    assert note["read"] is False
    # New shape: actor object joined in at read time, no baked-in body.
    assert note["actor"] == {"user_id": me_id, "username": "meeee", "name": "Me"}


def test_notification_actor_reflects_current_username(client):
    """Renaming the actor changes what /notifications returns — proof
    that we're not storing the username in the notification row."""
    me = _login_full(client, sub="rename", name="Rename", email="r@x.com")
    me_id = me["user_id"]
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]

    client.post("/auth/username", params={"session_token": me["session_token"]},
                json={"username": "before"})
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    note = client.get(f"/users/{cine_id}/notifications").json()["items"][0]
    assert note["actor"]["username"] == "before"

    # Unfollow + rename + refollow — but actually, rename doesn't even need
    # a re-emit. Re-list the same notification → actor JOIN reflects the new name.
    # Force a username change directly via the same flow:
    client.post("/auth/username", params={"session_token": me["session_token"]},
                json={"username": "after"})
    note2 = client.get(f"/users/{cine_id}/notifications").json()["items"][0]
    assert note2["actor"]["username"] == "after"


def test_repeat_follow_does_not_double_notify(client):
    """Following the same person twice creates one notification, not two."""
    me_id = _login(client, sub="dup", name="Dup", email="d@x.com")
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]

    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})  # idempotent

    items = client.get(f"/users/{cine_id}/notifications").json()["items"]
    assert len(items) == 1


def test_mark_one_notification_read(client):
    me_id = _login(client, sub="m1", name="M", email="m1@x.com")
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    note_id = client.get(f"/users/{cine_id}/notifications").json()["items"][0]["id"]
    r = client.post(f"/users/{cine_id}/notifications/{note_id}/read")
    assert r.status_code == 200

    after = client.get(f"/users/{cine_id}/notifications").json()
    assert after["unread_count"] == 0
    assert after["items"][0]["read"] is True


def test_mark_all_notifications_read(client):
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    # Three different users follow cine → three notifications
    for sub in ("a1", "a2", "a3"):
        uid = _login(client, sub=sub, name=sub, email=f"{sub}@x.com")
        client.post(f"/users/{uid}/follow", json={"followee_id": cine_id})

    assert client.get(f"/users/{cine_id}/notifications").json()["unread_count"] == 3

    r = client.post(f"/users/{cine_id}/notifications/mark-all-read")
    assert r.status_code == 200 and r.json()["marked_read"] == 3
    assert client.get(f"/users/{cine_id}/notifications").json()["unread_count"] == 0


def test_unread_only_filter(client):
    me_id = _login(client, sub="uo", name="UO", email="uo@x.com")
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    # mark it read
    note_id = client.get(f"/users/{cine_id}/notifications").json()["items"][0]["id"]
    client.post(f"/users/{cine_id}/notifications/{note_id}/read")

    # unread_only should return nothing now
    assert client.get(f"/users/{cine_id}/notifications", params={"unread_only": True}).json()["items"] == []
    # but full list still has the read item
    assert len(client.get(f"/users/{cine_id}/notifications").json()["items"]) == 1


def test_notifications_404_for_unknown_user(client):
    assert client.get("/users/no-such-user/notifications").status_code == 404
    assert client.post("/users/no-such-user/notifications/mark-all-read").status_code == 404


def test_notification_type_filter(client):
    """?type=follow returns only follow notifications. ?type=bogus → 400."""
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    me_id = _login(client, sub="tf", name="TF", email="tf@x.com")
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    follows = client.get(f"/users/{cine_id}/notifications", params={"type": "follow"}).json()
    assert len(follows["items"]) == 1
    assert follows["items"][0]["type"] == "follow"

    # Filter that matches no rows → empty list, not error
    nothing = client.get(f"/users/{cine_id}/notifications", params={"type": "review"}).json()
    assert nothing["items"] == []

    # Bogus type → 400 with a helpful message
    bad = client.get(f"/users/{cine_id}/notifications", params={"type": "bogus"})
    assert bad.status_code == 400
    assert "bogus" in bad.json()["detail"]


def test_notification_delete(client):
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    me_id = _login(client, sub="del", name="Del", email="del@x.com")
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})

    note_id = client.get(f"/users/{cine_id}/notifications").json()["items"][0]["id"]
    r = client.delete(f"/users/{cine_id}/notifications/{note_id}")
    assert r.status_code == 200 and r.json() == {"ok": True}

    # Gone for good
    after = client.get(f"/users/{cine_id}/notifications").json()
    assert after["items"] == []
    assert after["unread_count"] == 0

    # Second delete on same id → 404
    assert client.delete(f"/users/{cine_id}/notifications/{note_id}").status_code == 404


def test_notification_delete_only_owner(client):
    """User A can't delete user B's notifications even if they guess the id."""
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    me_id = _login(client, sub="atk", name="A", email="a@x.com")
    client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})
    note_id = client.get(f"/users/{cine_id}/notifications").json()["items"][0]["id"]

    other_id = _login(client, sub="atk2", name="B", email="b@x.com")
    # other tries to delete cine's notification → 404 (looks like "not found")
    assert client.delete(f"/users/{other_id}/notifications/{note_id}").status_code == 404
    # cine still has it
    assert len(client.get(f"/users/{cine_id}/notifications").json()["items"]) == 1


# ─── Privacy + follow-request approvals ──────────────────────────────────────


def test_default_user_is_public(client):
    user_id = _login(client, sub="pub", name="Pub", email="p@x.com")
    assert client.get(f"/users/{user_id}").json()["is_private"] is False


def test_set_privacy_requires_own_session(client):
    me = _login_full(client, sub="own", name="Own", email="o@x.com")
    other = _login_full(client, sub="oth", name="Oth", email="z@x.com")

    # No token → 401
    r = client.post(f"/users/{me['user_id']}/privacy", json={"is_private": True})
    assert r.status_code == 401

    # Other user's token → 403
    r = client.post(
        f"/users/{me['user_id']}/privacy",
        params={"session_token": other["session_token"]},
        json={"is_private": True},
    )
    assert r.status_code == 403

    # Own token → 200
    r = client.post(
        f"/users/{me['user_id']}/privacy",
        params={"session_token": me["session_token"]},
        json={"is_private": True},
    )
    assert r.status_code == 200 and r.json() == {"ok": True, "is_private": True}
    assert client.get(f"/users/{me['user_id']}").json()["is_private"] is True


def test_follow_a_public_user_is_immediate(client):
    me_id = _login(client, sub="pubf", name="P", email="pf@x.com")
    cine_id = client.get("/users/by-username/cinephile99").json()["user_id"]
    r = client.post(f"/users/{me_id}/follow", json={"followee_id": cine_id})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "state": "approved"}
    assert client.get(f"/users/{cine_id}").json()["follower_count"] == 1


def test_follow_a_private_user_is_pending(client):
    me = _login_full(client, sub="prv", name="P", email="prv@x.com")
    me_id = me["user_id"]
    target = _login_full(client, sub="target", name="T", email="t@x.com")
    target_id = target["user_id"]

    client.post(f"/users/{target_id}/privacy",
                params={"session_token": target["session_token"]},
                json={"is_private": True})

    r = client.post(f"/users/{me_id}/follow", json={"followee_id": target_id})
    assert r.json()["state"] == "pending"

    # Counts unchanged: follower_count counts approved-only
    assert client.get(f"/users/{target_id}").json()["follower_count"] == 0
    assert client.get(f"/users/{me_id}").json()["following_count"] == 0

    # Feed empty (pending follow doesn't surface anything)
    assert client.get(f"/users/{me_id}/feed").json() == []

    # T sees the pending request
    requests = client.get(
        f"/users/{target_id}/follow-requests",
        params={"session_token": target["session_token"]},
    ).json()
    assert len(requests) == 1
    assert requests[0]["user_id"] == me_id

    # T approves
    r = client.post(
        f"/users/{target_id}/follow-requests/{me_id}/approve",
        params={"session_token": target["session_token"]},
    )
    assert r.status_code == 200 and r.json()["state"] == "approved"

    # Now counts include the edge
    assert client.get(f"/users/{target_id}").json()["follower_count"] == 1
    assert client.get(f"/users/{me_id}").json()["following_count"] == 1


def test_reject_follow_request(client):
    me_id = _login(client, sub="rej1", name="R1", email="r1@x.com")
    target = _login_full(client, sub="rej2", name="R2", email="r2@x.com")
    target_id = target["user_id"]

    client.post(f"/users/{target_id}/privacy",
                params={"session_token": target["session_token"]},
                json={"is_private": True})
    client.post(f"/users/{me_id}/follow", json={"followee_id": target_id})

    r = client.delete(
        f"/users/{target_id}/follow-requests/{me_id}",
        params={"session_token": target["session_token"]},
    )
    assert r.status_code == 200

    # Edge gone — re-following goes back to pending
    assert client.get(
        f"/users/{target_id}/follow-requests",
        params={"session_token": target["session_token"]},
    ).json() == []
    r = client.post(f"/users/{me_id}/follow", json={"followee_id": target_id})
    assert r.json()["state"] == "pending"


def test_follow_requests_self_only(client):
    target = _login_full(client, sub="solo", name="S", email="s@x.com")
    target_id = target["user_id"]
    other = _login_full(client, sub="nosy", name="N", email="n@x.com")

    r = client.get(
        f"/users/{target_id}/follow-requests",
        params={"session_token": other["session_token"]},
    )
    assert r.status_code == 403


def test_existing_followers_unaffected_by_going_private(client):
    """Flipping is_private doesn't retroactively reset approved follows."""
    me_id = _login(client, sub="kept", name="K", email="k@x.com")
    target = _login_full(client, sub="keep", name="K2", email="k2@x.com")
    target_id = target["user_id"]
    client.post(f"/users/{me_id}/follow", json={"followee_id": target_id})
    assert client.get(f"/users/{target_id}").json()["follower_count"] == 1
    client.post(f"/users/{target_id}/privacy",
                params={"session_token": target["session_token"]},
                json={"is_private": True})
    assert client.get(f"/users/{target_id}").json()["follower_count"] == 1


# ─── Pagination ──────────────────────────────────────────────────────────────


def test_users_pagination_offset(client):
    """offset advances the page; limit caps the page size."""
    page1 = client.get("/users", params={"limit": 3, "offset": 0}).json()
    page2 = client.get("/users", params={"limit": 3, "offset": 3}).json()
    page3 = client.get("/users", params={"limit": 3, "offset": 6}).json()
    assert len(page1) == 3
    assert len(page2) == 3
    assert len(page3) == 2  # 8 seeded users → 3 + 3 + 2

    # No overlap between pages
    ids = [{u["user_id"] for u in p} for p in (page1, page2, page3)]
    assert ids[0].isdisjoint(ids[1])
    assert ids[1].isdisjoint(ids[2])

    # Past the end → empty
    assert client.get("/users", params={"limit": 3, "offset": 99}).json() == []


def test_users_pagination_clamps_limit(client):
    """limit > 200 must be clamped, limit <= 0 must default to >= 1."""
    huge = client.get("/users", params={"limit": 100000}).json()
    assert len(huge) <= 200
    # zero/negative limit gets clamped to >=1
    one = client.get("/users", params={"limit": 0}).json()
    assert len(one) >= 1


def test_movies_pagination(client):
    page1 = client.get("/movies", params={"limit": 2, "offset": 0}).json()
    page2 = client.get("/movies", params={"limit": 2, "offset": 2}).json()
    assert len(page1) == 2
    assert len(page2) == 2
    assert {m["movie_id"] for m in page1}.isdisjoint({m["movie_id"] for m in page2})


def test_user_rankings_pagination(client):
    """Seeded cinephile99 has 4 rankings."""
    cine = client.get("/users/by-username/cinephile99").json()
    page1 = client.get(f"/users/{cine['user_id']}/rankings",
                       params={"limit": 2, "offset": 0}).json()
    page2 = client.get(f"/users/{cine['user_id']}/rankings",
                       params={"limit": 2, "offset": 2}).json()
    assert len(page1) == 2 and len(page2) == 2
    # Together they cover all 4 rankings, no duplicates
    movie_ids = [r["movie"]["movie_id"] for r in page1 + page2]
    assert len(movie_ids) == 4 and len(set(movie_ids)) == 4


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
