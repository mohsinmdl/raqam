"""Auth matrix — HS256 legacy path and JWKS (RS256) path.

Exercised both through the pure ``verify_token`` helper and end-to-end through a
feature route via the FastAPI dependency.
"""

import time

import jwt
import pytest

from modal import auth
from modal.auth import AuthError, verify_token

from .conftest import (
    AUDIENCE,
    HS256_SECRET,
    _FakeJWKSClient,
    make_hs256_token,
    make_rs256_token,
)

FEATURE_ROUTE = "/digest"


# --------------------------------------------------------------------------- #
# Pure verify_token — HS256
# --------------------------------------------------------------------------- #
def test_verify_hs256_valid_returns_sub():
    token = make_hs256_token(sub="abc")
    assert verify_token(token, hs256_secret=HS256_SECRET) == "abc"


def test_verify_hs256_expired_raises():
    token = make_hs256_token(exp_delta=-10)
    with pytest.raises(AuthError):
        verify_token(token, hs256_secret=HS256_SECRET)


def test_verify_hs256_wrong_secret_raises():
    token = make_hs256_token()
    with pytest.raises(AuthError):
        verify_token(token, hs256_secret="the-wrong-secret")


def test_verify_hs256_wrong_audience_raises():
    token = make_hs256_token(aud="some-other-aud")
    with pytest.raises(AuthError):
        verify_token(token, hs256_secret=HS256_SECRET)


def test_verify_garbage_raises():
    with pytest.raises(AuthError):
        verify_token("not.a.jwt", hs256_secret=HS256_SECRET)


def test_verify_hs256_without_secret_raises():
    token = make_hs256_token()
    with pytest.raises(AuthError):
        verify_token(token, hs256_secret=None)


# --------------------------------------------------------------------------- #
# Pure verify_token — RS256 / JWKS
# --------------------------------------------------------------------------- #
def test_verify_rs256_valid_returns_sub(rsa_keypair):
    private_key, public_key = rsa_keypair
    token = make_rs256_token(private_key, sub="rsa-user")
    client = _FakeJWKSClient(public_key)
    assert verify_token(token, jwks_client=client) == "rsa-user"


def test_verify_rs256_expired_raises(rsa_keypair):
    private_key, public_key = rsa_keypair
    token = make_rs256_token(private_key, exp_delta=-10)
    client = _FakeJWKSClient(public_key)
    with pytest.raises(AuthError):
        verify_token(token, jwks_client=client)


def test_verify_rs256_wrong_key_raises(rsa_keypair):
    private_key, _ = rsa_keypair
    from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

    other_public = _rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()
    token = make_rs256_token(private_key)
    client = _FakeJWKSClient(other_public)
    with pytest.raises(AuthError):
        verify_token(token, jwks_client=client)


def test_verify_rs256_without_jwks_raises(rsa_keypair):
    private_key, _ = rsa_keypair
    token = make_rs256_token(private_key)
    with pytest.raises(AuthError):
        verify_token(token, jwks_client=None)


# --------------------------------------------------------------------------- #
# End-to-end through the FastAPI dependency (HS256)
# --------------------------------------------------------------------------- #
def test_route_missing_auth_401(client):
    r = client.post(FEATURE_ROUTE, json={})
    assert r.status_code == 401
    assert r.json() == {"error": "invalid or expired token"}


def test_route_garbage_token_401(client, hs256_env):
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
    assert r.json() == {"error": "invalid or expired token"}


def test_route_non_bearer_scheme_401(client, hs256_env):
    token = make_hs256_token()
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": f"Basic {token}"})
    assert r.status_code == 401


def test_route_expired_token_401(client, hs256_env):
    token = make_hs256_token(exp_delta=-10)
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_route_valid_hs256_passes_auth_reaches_501(client, hs256_env):
    token = make_hs256_token()
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": f"Bearer {token}"})
    # Auth succeeded → handler reached → 501 stub (not 401).
    assert r.status_code == 501


# --------------------------------------------------------------------------- #
# End-to-end through the FastAPI dependency (JWKS/RS256)
# --------------------------------------------------------------------------- #
def test_route_valid_rs256_via_jwks_reaches_501(client, jwks_env):
    private_key, _ = jwks_env
    token = make_rs256_token(private_key)
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 501


def test_route_rs256_expired_via_jwks_401(client, jwks_env):
    private_key, _ = jwks_env
    token = make_rs256_token(private_key, exp_delta=-10)
    r = client.post(FEATURE_ROUTE, json={}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
