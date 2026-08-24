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
* The four feature routes (``/categorize`` U1, ``/parse-sms`` U2,
  ``/parse-receipt`` U3, ``/digest`` U4) — all implemented — require auth and
  share the same auth/rate-limit/CORS envelope. ``/parse-sms`` and ``/digest``
  reuse the single GPU ``llm_generate`` function; ``/parse-receipt`` uses the
  isolated ``vlm_generate``; ``/categorize`` runs embeddings-only on the CPU.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# Dual-context imports: as a package (``modal.api``) under pytest, or as
# top-level modules when Modal runs a script from inside the ``modal/`` dir.
try:
    from . import auth, digest, embed, models_llm, models_vlm
    from .schemas import (
        CategorizeRequest,
        CategorizeResponse,
        DigestRequest,
        DigestResponse,
        HealthResponse,
        ParsedReceipt,
        ParsedSms,
        ParseReceiptResponse,
        ParseSmsRequest,
        ParseSmsResponse,
    )
except ImportError:  # pragma: no cover - exercised only in the Modal script context
    import auth  # type: ignore
    import digest  # type: ignore
    import embed  # type: ignore
    import models_llm  # type: ignore
    import models_vlm  # type: ignore
    from schemas import (  # type: ignore
        CategorizeRequest,
        CategorizeResponse,
        DigestRequest,
        DigestResponse,
        HealthResponse,
        ParsedReceipt,
        ParsedSms,
        ParseReceiptResponse,
        ParseSmsRequest,
        ParseSmsResponse,
    )

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
# LLM tier backend (U2) — the /parse-sms handler runs the pure
# ``models_llm.parse_sms`` with this as the injected ``generate_fn``. It invokes
# the GPU ``llm_generate`` Modal function (app.py) via ``.remote()``. The
# ``modal`` import is LAZY (call-time only), so ``modal.api`` still imports with
# the Modal SDK absent — pytest monkeypatches this function to a fake generator.
# --------------------------------------------------------------------------- #
def llm_generate(prompt: str) -> str:
    import modal  # lazy — only needed in the deployed container, never in tests

    fn = modal.Function.from_name("raqam-ai", "llm_generate")
    return fn.remote(prompt)


# /digest reuses the SAME GPU function, but guides decoding to the digest schema
# (not the SMS one) and allows a longer completion for the narrative. Separate
# shim so its fake stays a plain 1-arg generator in tests, exactly like the SMS
# one — the schema is bound here, not threaded through the pure narrate().
def llm_generate_digest(prompt: str) -> str:
    import modal  # lazy — deployed container only

    fn = modal.Function.from_name("raqam-ai", "llm_generate")
    return fn.remote(prompt, digest.DIGEST_JSON_SCHEMA, 512)


# --------------------------------------------------------------------------- #
# VLM tier backend (U3) — the /parse-receipt handler runs the pure
# ``models_vlm.parse_receipt`` with this as the injected ``generate_fn``. It
# invokes the ISOLATED GPU ``vlm_generate`` Modal function (app.py) via
# ``.remote()`` — a SEPARATE image/container from ``llm_generate`` so the 7B VL
# weights never load on /categorize, /parse-sms, or /digest. The ``modal`` import
# is LAZY (call-time only), so ``modal.api`` still imports with the Modal SDK
# absent — pytest monkeypatches this function to a fake generator. The image
# bytes travel in memory only; nothing is written to disk or storage.
# --------------------------------------------------------------------------- #
def vlm_generate(image_bytes: bytes) -> str:
    import modal  # lazy — only needed in the deployed container, never in tests

    fn = modal.Function.from_name("raqam-ai", "vlm_generate")
    return fn.remote(image_bytes)


# Max receipt upload size — 8 MB. Larger uploads are rejected with 413 before any
# model call. Enforced on the bytes actually read into memory (never streamed to
# disk), so a spoofed Content-Length cannot slip a huge payload through.
MAX_RECEIPT_BYTES = 8 * 1024 * 1024


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

    # Feature routes — auth-gated, rate-limited. All four (U1–U4) are now
    # implemented; each parses its typed request model from ``schemas.py`` (and,
    # for /parse-receipt, the multipart ``image`` field).

    @app.post("/categorize", response_model=CategorizeResponse)
    async def categorize(
        payload: CategorizeRequest,
        user_id: str = Depends(authed_user),
    ) -> CategorizeResponse:
        # U1: embeddings-only kNN, no LLM. rank() is pure; the production
        # embedder (embed.embed_texts) is a lazy singleton that loads the model
        # on first real call — tests monkeypatch it so no weights download.
        suggestions = embed.rank(payload.model_dump(), embed.embed_texts)
        return CategorizeResponse(suggestions=suggestions)

    @app.post(
        "/parse-sms",
        response_model=ParseSmsResponse,
        response_model_exclude_none=True,
    )
    async def parse_sms(
        payload: ParseSmsRequest,
        user_id: str = Depends(authed_user),
    ) -> ParseSmsResponse:
        # U2: LLM tier. parse_sms() is pure; the module-level ``llm_generate``
        # (monkeypatched in tests) calls the GPU llm function remotely. Unread
        # fields are omitted and a junk SMS yields ``{}`` — exclude_none keeps
        # those off the wire (schemas.py contract).
        parsed = models_llm.parse_sms(payload.text, llm_generate)
        return ParseSmsResponse(parsed=ParsedSms(**parsed))

    @app.post(
        "/parse-receipt",
        response_model=ParseReceiptResponse,
        response_model_exclude_none=True,
    )
    async def parse_receipt(
        image: UploadFile = File(...),
        user_id: str = Depends(authed_user),
    ) -> ParseReceiptResponse:
        # U3: VLM tier. The uploaded image is read fully INTO MEMORY (never
        # written to disk, the volume, or any storage — US-15 privacy) and the
        # 8 MB cap is enforced on the bytes actually read, so a huge upload is
        # rejected with 413 before any GPU call. parse_receipt() is pure; the
        # module-level ``vlm_generate`` (monkeypatched in tests) calls the
        # ISOLATED GPU vlm function remotely. Unread fields are omitted and a
        # non-receipt image yields ``{}`` — exclude_none keeps those off the wire.
        image_bytes = await image.read()
        if len(image_bytes) > MAX_RECEIPT_BYTES:
            raise HTTPException(status_code=413, detail="image too large")
        parsed = models_vlm.parse_receipt(image_bytes, vlm_generate)
        return ParseReceiptResponse(parsed=ParsedReceipt(**parsed))

    @app.post("/digest", response_model=DigestResponse)
    async def digest_route(
        payload: DigestRequest,
        user_id: str = Depends(authed_user),
    ) -> DigestResponse:
        # U4: LLM narration. narrate() is pure; it REUSES U2's ``llm_generate``
        # shim (monkeypatched in tests) which calls the shared GPU llm function
        # remotely — NO new GPU function. The client computed every figure and
        # sends only aggregates; the model narrates using those numbers only
        # (FR-4.3) and narrate() always returns a contract-valid response
        # (safe/empty on malformed output).
        result = digest.narrate(payload.model_dump(), llm_generate_digest)
        return DigestResponse(**result)

    return app


app = create_app()
