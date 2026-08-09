import asyncio
import pytest
from app.db import UserDB, MovieDB, RankingsDB
from app.models import Movie, User
from app.services import AuthService, RankingService, FeedService


@pytest.fixture
def dbs():
    user_db = UserDB()
    movie_db = MovieDB()
    rankings_db = RankingsDB()
    movie_db.seed([
        Movie("m1", "Inception", "Sci-Fi", year=2010),
        Movie("m2", "Parasite", "Thriller", year=2019),
    ])
    return user_db, movie_db, rankings_db


@pytest.fixture
def users(dbs):
    user_db, _, _ = dbs
    auth = AuthService(user_db)
    alice = asyncio.run(auth.google_login("sub_a|Alice|alice@x.com"))
    bob = asyncio.run(auth.google_login("sub_b|Bob|bob@x.com"))
    return alice, bob


def test_google_login_upsert(dbs):
    user_db, _, _ = dbs
    auth = AuthService(user_db)
    u1 = asyncio.run(auth.google_login("sub|Alice|alice@x.com"))
    u2 = asyncio.run(auth.google_login("sub|Alice|alice@x.com"))
    assert u1.user_id == u2.user_id


def test_add_ranking_and_average(dbs, users):
    user_db, movie_db, rankings_db = dbs
    alice, bob = users
    svc = RankingService(rankings_db, movie_db, user_db)
    asyncio.run(svc.add_ranking(alice.user_id, "m1", 9))
    asyncio.run(svc.add_ranking(bob.user_id, "m1", 7))
    assert svc.average_score("m1") == 8.0


def test_ranking_upsert(dbs, users):
    user_db, movie_db, rankings_db = dbs
    alice, _ = users
    svc = RankingService(rankings_db, movie_db, user_db)
    asyncio.run(svc.add_ranking(alice.user_id, "m1", 5))
    asyncio.run(svc.add_ranking(alice.user_id, "m1", 9))
    # only one ranking should exist, average should reflect updated score
    assert svc.average_score("m1") == 9.0
    assert len(rankings_db.user_rankings(alice.user_id)) == 1


def test_top_movies_ordering(dbs, users):
    user_db, movie_db, rankings_db = dbs
    alice, bob = users
    svc = RankingService(rankings_db, movie_db, user_db)
    asyncio.run(svc.add_ranking(alice.user_id, "m1", 6))
    asyncio.run(svc.add_ranking(alice.user_id, "m2", 10))
    top = svc.top_movies(2)
    assert top[0]["movie"]["movie_id"] == "m2"


def test_pairwise_win_rate(dbs, users):
    user_db, movie_db, rankings_db = dbs
    alice, bob = users
    svc = RankingService(rankings_db, movie_db, user_db)
    asyncio.run(svc.record_pairwise(alice.user_id, "m2", "m1"))
    asyncio.run(svc.record_pairwise(bob.user_id, "m2", "m1"))
    assert svc.pairwise_win_rate("m2") == 1.0
    assert svc.pairwise_win_rate("m1") == 0.0


def test_feed_follows_only_followed_users(dbs, users):
    user_db, movie_db, rankings_db = dbs
    alice, bob = users
    rsvc = RankingService(rankings_db, movie_db, user_db)
    fsvc = FeedService(rankings_db, user_db)

    asyncio.run(rsvc.add_ranking(bob.user_id, "m1", 8))
    fsvc.follow(alice.user_id, bob.user_id)

    feed = fsvc.get_feed(alice.user_id)
    assert len(feed) == 1
    assert feed[0]["movie_id"] == "m1"

    fsvc.unfollow(alice.user_id, bob.user_id)
    assert fsvc.get_feed(alice.user_id) == []


def test_concurrent_ranking_writes(dbs, users):
    """Concurrent upserts on the same (user, movie) must not corrupt the cache."""
    user_db, movie_db, rankings_db = dbs
    alice, _ = users
    svc = RankingService(rankings_db, movie_db, user_db)

    async def run():
        await asyncio.gather(
            svc.add_ranking(alice.user_id, "m1", 7),
            svc.add_ranking(alice.user_id, "m1", 9),
        )

    asyncio.run(run())
    avg = svc.average_score("m1")
    assert avg in (7.0, 9.0)  # one write wins, cache must not be corrupted
    assert rankings_db._score_cache["m1"][1] == 1  # exactly one entry
