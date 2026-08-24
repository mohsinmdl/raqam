"""Feature-route stubs return 501 when authed; rate-limit bucket returns 429."""

import pytest

from .conftest import make_hs256_token

FEATURE_ROUTES = ["/categorize", "/parse-sms", "/parse-receipt", "/digest"]


def _auth_header():
    return {"Authorization": f"Bearer {make_hs256_token()}"}


@pytest.mark.parametrize("route", FEATURE_ROUTES)
def test_feature_route_501_when_authed(client, hs256_env, route):
    r = client.post(route, json={}, headers=_auth_header())
    assert r.status_code == 501
    assert r.json() == {"error": "not implemented"}


@pytest.mark.parametrize("route", FEATURE_ROUTES)
def test_feature_route_401_when_anon(client, route):
    r = client.post(route, json={})
    assert r.status_code == 401


def test_rate_limit_returns_429_after_limit(client, hs256_env):
    from modal.api import RATE_LIMIT_CAPACITY

    headers = _auth_header()  # single user → single bucket
    statuses = [
        client.post("/digest", json={}, headers=headers).status_code
        for _ in range(RATE_LIMIT_CAPACITY + 5)
    ]
    # The first CAPACITY requests pass auth and hit the 501 stub...
    assert statuses[:RATE_LIMIT_CAPACITY] == [501] * RATE_LIMIT_CAPACITY
    # ...then the bucket is empty and further requests are throttled.
    assert 429 in statuses[RATE_LIMIT_CAPACITY:]
    throttled = client.post("/digest", json={}, headers=headers)
    assert throttled.status_code == 429
    assert throttled.json() == {"error": "rate limit exceeded"}


def test_rate_limit_is_per_user(client, hs256_env):
    from modal.api import RATE_LIMIT_CAPACITY

    headers_a = {"Authorization": f"Bearer {make_hs256_token(sub='user-a')}"}
    headers_b = {"Authorization": f"Bearer {make_hs256_token(sub='user-b')}"}

    # Exhaust user A.
    for _ in range(RATE_LIMIT_CAPACITY + 1):
        client.post("/digest", json={}, headers=headers_a)
    assert client.post("/digest", json={}, headers=headers_a).status_code == 429

    # User B has an untouched bucket.
    assert client.post("/digest", json={}, headers=headers_b).status_code == 501
