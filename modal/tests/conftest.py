"""Shared pytest fixtures for the raqam-ai service tests.

Everything here runs WITHOUT a Modal account and WITHOUT downloading models:
the FastAPI app is driven through Starlette's TestClient, and JWTs are minted
locally (HS256 with a test secret; RS256 with a freshly generated keypair).
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from modal import api, auth
from modal.api import app

HS256_SECRET = "test-hs256-secret-value-at-least-32-bytes-long"
AUDIENCE = "authenticated"


# --------------------------------------------------------------------------- #
# Environment isolation + state reset (autouse for every test)
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    for var in ("SUPABASE_JWT_SECRET", "SUPABASE_JWKS_URL", "SUPABASE_URL", "SUPABASE_JWT_AUD"):
        monkeypatch.delenv(var, raising=False)
    auth.reset_jwks_cache()
    api.reset_rate_limiter()
    yield
    auth.reset_jwks_cache()
    api.reset_rate_limiter()


@pytest.fixture
def client():
    return TestClient(app)


# --------------------------------------------------------------------------- #
# HS256 helpers
# --------------------------------------------------------------------------- #
def make_hs256_token(sub="user-123", *, aud=AUDIENCE, exp_delta=3600, secret=HS256_SECRET):
    payload = {"sub": sub, "aud": aud, "exp": int(time.time()) + exp_delta}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def hs256_env(monkeypatch):
    """Configure the app to accept HS256 tokens signed with HS256_SECRET."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", HS256_SECRET)
    return HS256_SECRET


# --------------------------------------------------------------------------- #
# RSA / JWKS helpers
# --------------------------------------------------------------------------- #
class _FakeSigningKey:
    def __init__(self, key):
        self.key = key


class _FakeJWKSClient:
    """Stands in for jwt.PyJWKClient — returns a fixed public key, no network."""

    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(self._public_key)


@pytest.fixture
def rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


def make_rs256_token(private_key, sub="user-rsa", *, aud=AUDIENCE, exp_delta=3600):
    payload = {"sub": sub, "aud": aud, "exp": int(time.time()) + exp_delta}
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "test-kid"})


@pytest.fixture
def jwks_env(monkeypatch, rsa_keypair):
    """Point the app's JWKS resolution at an in-memory public key (no network)."""
    private_key, public_key = rsa_keypair
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://example.test/jwks.json")
    fake_client = _FakeJWKSClient(public_key)
    monkeypatch.setattr(auth, "get_jwks_client", lambda *a, **k: fake_client)
    return private_key, public_key
