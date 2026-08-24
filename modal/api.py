"""FastAPI application for the ``raqam-ai`` service.

This module builds the ASGI ``app`` that Modal serves (see ``modal/app.py``). It
imports **only** FastAPI/Pydantic-level code — no ``modal`` SDK and no model
libraries (``vllm``, ``sentence-transformers``) — so pytest can import it and
drive it through Starlette's ``TestClient`` with no Modal account and no model
downloads.

What it wires (U0):

* **CORS** — allowlist of exactly ``https://raqam.pages.dev`` and
  ``http://localhost:5173``.
* **Rate limiting** — a per-user in-process token bucket (30 req/min → ``429``).
  ``max_containers=1`` on the ``api`` function makes this local bucket globally
  correct.
* **Structured request logging** — one line per request with method, path,
  status, duration_ms and a short sha256 of the user id. Request/response
  **bodies are never logged** (NFR no-retention).
* ``GET /health`` (no auth) → ``{ok, version}``.
* The four feature routes (``/categorize``, ``/parse-sms``, ``/parse-receipt``,
  ``/digest``) require auth and return ``501 {"error": "not implemented"}``.
  U1–U4 replace those bodies; the auth/rate-limit/CORS envelope stays.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# Dual-context imports: as a package (``modal.api``) under pytest, or as
# top-level modules when Modal runs a script from inside the ``modal/`` dir.
try:
    from . import auth
    from .schemas import HealthResponse
except ImportError:  # pragma: no cover - exercised only in the Modal script context
    import auth  # type: ignore
    from schemas import HealthResponse  # type: ignore

# Version reported by /health — kept in step with fixtures/health.response.json.
VERSION = "0.1.0"

ALLOWED_ORIGINS = [
    "https://raqam.pages.dev",
    "http://localhost:5173",
]

# Rate limit: 30 requests / minute / user (token bucket).
RATE_LIMIT_CAPACITY = 30
RATE_LIMIT_WINDOW_SECONDS = 60.0
RATE_LIMIT_REFILL_PER_SECOND = RATE_LIMIT_CAPACITY / RATE_LIMIT_WINDOW_SECONDS

logger = logging.getLogger("raqam_ai")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)


def _hash_user(user_id: Optional[str]) -> str:
    """Short, non-reversible tag for a user id (for log correlation only)."""
    if not user_id:
        return "-"
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]


# --------------------------------------------------------------------------- #
# Token-bucket rate limiter (in-process; correct because max_containers=1).
# --------------------------------------------------------------------------- #
class _TokenBucketLimiter:
    def __init__(
        self,
        capacity: int = RATE_LIMIT_CAPACITY,
        refill_per_second: float = RATE_LIMIT_REFILL_PER_SECOND,
    ) -> None:
        self.capacity = capacity
        self.refill_per_second = refill_per_second
        # user_id -> (tokens, last_refill_monotonic)
        self._buckets: dict[str, tuple[float, float]] = {}

    def allow(self, user_id: str) -> bool:
        now = time.monotonic()
        tokens, last = self._buckets.get(user_id, (float(self.capacity), now))
        tokens = min(self.capacity, tokens + (now - last) * self.refill_per_second)
        if tokens >= 1.0:
            self._buckets[user_id] = (tokens - 1.0, now)
            return True
        self._buckets[user_id] = (tokens, now)
        return False

    def reset(self) -> None:
        self._buckets.clear()


rate_limiter = _TokenBucketLimiter()


def reset_rate_limiter() -> None:
    """Test hook — clear all per-user buckets."""
    rate_limiter.reset()


# --------------------------------------------------------------------------- #
# Auth + rate-limit dependency for feature routes.
# --------------------------------------------------------------------------- #
def authed_user(
    request: Request,
    user_id: str = Depends(auth.require_user),
) -> str:
    """Resolve the user (401 on failure), apply the rate limit (429), and stash
    the id on ``request.state`` for the logging middleware."""
    request.state.user_id = user_id
    if not rate_limiter.allow(user_id):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
    return user_id


# --------------------------------------------------------------------------- #
# App factory
# --------------------------------------------------------------------------- #
def create_app() -> FastAPI:
    app = FastAPI(title="raqam-ai", version=VERSION)

    @app.exception_handler(StarletteHTTPException)
    async def _error_body(request: Request, exc: StarletteHTTPException):
        """Render every HTTP error as the shared ``{"error": string}`` contract
        body — never echoing request content."""
        detail = exc.detail
        message = detail if isinstance(detail, str) else "request failed"
        return JSONResponse(status_code=exc.status_code, content={"error": message})

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            user_tag = _hash_user(getattr(request.state, "user_id", None))
            # Single structured line. NO request/response body — ever.
            logger.info(
                'method=%s path=%s status=%s duration_ms=%.1f user=%s',
                request.method,
                request.url.path,
                status,
                duration_ms,
                user_tag,
            )

    # CORS added last → outermost, so headers apply to every response (incl. errors).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # ----- routes ----------------------------------------------------------- #
    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(ok=True, version=VERSION)

    # Feature routes — auth-gated, rate-limited, stubbed 501 until U1–U4 land.
    # NOTE: request bodies are intentionally NOT parsed here. Later units add the
    # typed request models from ``schemas.py`` (and, for /parse-receipt, the
    # multipart ``image`` field) when they implement the handler.
    _NOT_IMPLEMENTED = 501

    @app.post("/categorize")
    async def categorize(user_id: str = Depends(authed_user)):
        raise HTTPException(status_code=_NOT_IMPLEMENTED, detail="not implemented")

    @app.post("/parse-sms")
    async def parse_sms(user_id: str = Depends(authed_user)):
        raise HTTPException(status_code=_NOT_IMPLEMENTED, detail="not implemented")

    @app.post("/parse-receipt")
    async def parse_receipt(user_id: str = Depends(authed_user)):
        raise HTTPException(status_code=_NOT_IMPLEMENTED, detail="not implemented")

    @app.post("/digest")
    async def digest(user_id: str = Depends(authed_user)):
        raise HTTPException(status_code=_NOT_IMPLEMENTED, detail="not implemented")

    return app


app = create_app()
