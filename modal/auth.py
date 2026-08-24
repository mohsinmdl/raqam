"""Supabase JWT verification for the ``raqam-ai`` service.

Two verification paths, both handled locally (no per-request Supabase call —
design Q5=A, NFR AuthN):

* **JWKS (RS256 / ES256)** — the modern Supabase signing scheme. Public keys are
  fetched once from ``SUPABASE_JWKS_URL`` and cached in-process (PyJWKClient
  caches the key set; the client itself is memoised per URL at first use /
  container start).
* **HS256 legacy** — projects still on the shared ``SUPABASE_JWT_SECRET``.

Every token is checked for a valid signature, ``exp`` (not expired) and ``aud``
(Supabase issues ``aud="authenticated"`` for signed-in users). The verified
``sub`` claim is the user id.

The pure verification entry point is :func:`verify_token`, which takes an
injected HS256 secret and/or a JWKS client so tests can drive it directly with a
locally generated keypair — no network, no Modal, no Supabase. The FastAPI
dependency :func:`require_user` wires it to environment configuration and the
``Authorization: Bearer`` header, returning the user id or raising ``401``.
"""

from __future__ import annotations

import os
from typing import Optional, Protocol

import jwt
from fastapi import Header, HTTPException

# Supabase signs user sessions with this audience.
DEFAULT_AUDIENCE = "authenticated"

# Algorithms accepted on the JWKS (asymmetric) path.
_ASYMMETRIC_ALGS = ("RS256", "ES256")

# Uniform, content-free message for every auth failure (do not leak the reason
# to a caller — it only aids token-guessing and echoes nothing useful).
_AUTH_ERROR_MESSAGE = "invalid or expired token"


class AuthError(Exception):
    """Raised by :func:`verify_token` when a token cannot be trusted."""


class SigningKeyClient(Protocol):
    """Minimal interface satisfied by ``jwt.PyJWKClient`` (and by test fakes).

    ``get_signing_key_from_jwt(token)`` returns an object whose ``.key``
    attribute is the public key to verify the token with.
    """

    def get_signing_key_from_jwt(self, token: str): ...  # pragma: no cover - typing


# --------------------------------------------------------------------------- #
# Pure verification (no FastAPI, no env, fully injectable — this is what tests
# call directly).
# --------------------------------------------------------------------------- #
def verify_token(
    token: str,
    *,
    hs256_secret: Optional[str] = None,
    jwks_client: Optional[SigningKeyClient] = None,
    audience: str = DEFAULT_AUDIENCE,
) -> str:
    """Verify ``token`` and return its ``sub`` (user id).

    The token's own ``alg`` header selects the path: ``HS256`` verifies against
    ``hs256_secret``; ``RS256``/``ES256`` verifies against the key resolved from
    ``jwks_client``. Signature, ``exp`` and ``aud`` are all enforced.

    Raises :class:`AuthError` on any failure (bad signature, expired, wrong
    audience, malformed token, or no key material configured for the token's
    algorithm).
    """
    if not token:
        raise AuthError("missing token")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise AuthError(f"malformed token header: {exc}") from exc

    alg = header.get("alg")

    if alg == "HS256":
        if not hs256_secret:
            raise AuthError("HS256 token but no SUPABASE_JWT_SECRET configured")
        key = hs256_secret
        algorithms = ["HS256"]
    elif alg in _ASYMMETRIC_ALGS:
        if jwks_client is None:
            raise AuthError(f"{alg} token but no JWKS configured")
        try:
            key = jwks_client.get_signing_key_from_jwt(token).key
        except Exception as exc:  # PyJWKClientError, network, etc.
            raise AuthError(f"could not resolve signing key: {exc}") from exc
        algorithms = list(_ASYMMETRIC_ALGS)
    else:
        raise AuthError(f"unsupported alg: {alg!r}")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=audience,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc

    sub = claims.get("sub")
    if not sub or not isinstance(sub, str):
        raise AuthError("token missing sub claim")
    return sub


# --------------------------------------------------------------------------- #
# Environment-backed configuration (memoised JWKS client per URL).
# --------------------------------------------------------------------------- #
_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def get_jwks_client(jwks_url: Optional[str] = None) -> Optional[SigningKeyClient]:
    """Return a cached ``PyJWKClient`` for ``jwks_url`` (default: env).

    The client is built once per URL and reused for the life of the container,
    so the JWKS is fetched lazily at first use and then served from PyJWKClient's
    internal key cache. Returns ``None`` when no JWKS URL is configured.
    """
    url = jwks_url or os.environ.get("SUPABASE_JWKS_URL")
    if not url:
        return None
    client = _jwks_clients.get(url)
    if client is None:
        client = jwt.PyJWKClient(url, cache_keys=True)
        _jwks_clients[url] = client
    return client


def reset_jwks_cache() -> None:
    """Clear the memoised JWKS clients (test hook)."""
    _jwks_clients.clear()


def verify_bearer(token: str) -> str:
    """Verify a bearer ``token`` using environment configuration.

    Reads ``SUPABASE_JWT_SECRET`` (HS256 fallback) and ``SUPABASE_JWKS_URL``
    (asymmetric) from the environment. Raises :class:`AuthError` on failure.
    """
    return verify_token(
        token,
        hs256_secret=os.environ.get("SUPABASE_JWT_SECRET"),
        jwks_client=get_jwks_client(),
        audience=os.environ.get("SUPABASE_JWT_AUD", DEFAULT_AUDIENCE),
    )


# --------------------------------------------------------------------------- #
# FastAPI dependency
# --------------------------------------------------------------------------- #
def require_user(authorization: Optional[str] = Header(default=None)) -> str:
    """FastAPI dependency: return the authenticated user id or raise ``401``.

    Expects an ``Authorization: Bearer <jwt>`` header. Any failure — missing
    header, wrong scheme, or invalid token — yields ``401`` with the shared
    ``{"error": ...}`` body (rendered by the app's exception handler).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail=_AUTH_ERROR_MESSAGE)

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail=_AUTH_ERROR_MESSAGE)

    try:
        return verify_bearer(token.strip())
    except AuthError:
        raise HTTPException(status_code=401, detail=_AUTH_ERROR_MESSAGE)
