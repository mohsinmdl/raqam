"""Feature routes require auth (401 anon); the rate-limit bucket returns 429.

All four feature routes (/categorize U1, /parse-sms U2, /parse-receipt U3,
/digest U4) are now implemented — none return the 501 stub any more. Per-route
behaviour is covered by tests/test_categorize.py, tests/test_parse_sms.py,
tests/test_parse_receipt.py and tests/test_digest.py; this module covers the
shared auth + rate-limit envelope.
"""

import json
from pathlib import Path

import pytest

from modal import api
from .conftest import make_hs256_token

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"

# Every auth-gated feature route.
FEATURE_ROUTES = ["/categorize", "/parse-sms", "/parse-receipt", "/digest"]


def _auth_header():
    return {"Authorization": f"Bearer {make_hs256_token()}"}


def _digest_body():
    with open(FIXTURES_DIR / "digest.request.json", encoding="utf-8") as fh:
        return json.load(fh)


@pytest.mark.parametrize("route", FEATURE_ROUTES)
def test_feature_route_401_when_anon(client, route):
    r = client.post(route, json={})
    assert r.status_code == 401


def test_rate_limit_returns_429_after_limit(client, hs256_env, monkeypatch):
    from modal.api import RATE_LIMIT_CAPACITY

    # Drive /digest with a valid payload + a fake generator so authed requests
    # reach the handler and return 200 — isolating the rate-limit behaviour.
    monkeypatch.setattr(
        api, "llm_generate_digest", lambda _p: json.dumps({"headline": "ok", "observations": []})
    )
    body = _digest_body()
    headers = _auth_header()  # single user → single bucket

    statuses = [
        client.post("/digest", json=body, headers=headers).status_code
        for _ in range(RATE_LIMIT_CAPACITY + 5)
    ]
    # The first CAPACITY requests pass auth and reach the handler (200)...
    assert statuses[:RATE_LIMIT_CAPACITY] == [200] * RATE_LIMIT_CAPACITY
    # ...then the bucket is empty and further requests are throttled.
    assert 429 in statuses[RATE_LIMIT_CAPACITY:]
    throttled = client.post("/digest", json=body, headers=headers)
    assert throttled.status_code == 429
    assert throttled.json() == {"error": "rate limit exceeded"}


def test_rate_limit_is_per_user(client, hs256_env, monkeypatch):
    from modal.api import RATE_LIMIT_CAPACITY

    monkeypatch.setattr(
        api, "llm_generate_digest", lambda _p: json.dumps({"headline": "ok", "observations": []})
    )
    body = _digest_body()
    headers_a = {"Authorization": f"Bearer {make_hs256_token(sub='user-a')}"}
    headers_b = {"Authorization": f"Bearer {make_hs256_token(sub='user-b')}"}

    # Exhaust user A.
    for _ in range(RATE_LIMIT_CAPACITY + 1):
        client.post("/digest", json=body, headers=headers_a)
    assert client.post("/digest", json=body, headers=headers_a).status_code == 429

    # User B has an untouched bucket → reaches the handler (200).
    assert client.post("/digest", json=body, headers=headers_b).status_code == 200
