# U0 ai-foundation — Code Summary

Generated via subagent-driven development (parallel service + client streams,
sharing `modal/fixtures/*.json` as the contract). Stories US-1..US-4.

## Service (`modal/` — new Python package)
- `schemas.py` — Pydantic v2 contract models for every route + shared error body (the truth later units implement against).
- `auth.py` — Supabase JWT verify: JWKS (RS256/ES256, cached) + HS256 fallback; validates sig/exp/aud=authenticated/sub; FastAPI `require_user` dependency → 401.
- `api.py` — FastAPI app (imports cleanly WITHOUT the Modal SDK or model libs, so pytest runs offline): CORS allowlist (pages.dev + localhost), per-user token-bucket rate limit (30/min → 429), `GET /health`, four feature routes auth-gated → **501** (U1–U4 fill them), content-free structured logging.
- `app.py` — Modal wiring: app `raqam-ai`, pinned image, `raqam-ai-models` volume + `raqam-supabase-jwt` secret, CPU `api` ASGI function (max_containers=1). GPU `llm`/`vlm` deferred to U2/U3.
- `smoke.py` — `modal run` PASS/FAIL matrix (health/anon-401/garbage-401/authed-501/rate-429) for deploy-time verification.
- `tests/` — pytest: health+CORS, auth matrix (HS256 + JWKS keypair), 501 stubs, rate-limit, and fixture round-trips. **41 passed**, runs without Modal creds.
- `README.md`, `requirements-dev.txt`, `.gitignore`.

## Client (`src/` — new files + one in-place edit)
- `src/lib/ai.js` — sole network path: `aiConfigured()`, `authedFetch` (token attach, AbortController timeout 20s/75s-cold, one 401→refresh→retry), typed helpers, `AiError{kind}`; tolerates null supabase; imports only supabase.js.
- `src/lib/aiWarming.js` — pure clock-injected warming state machine (>3s → warming).
- `src/ui/ai/useAI.js` — `{ enabled, available, warming, ...calls }`; `enabled = prefs.aiEnabled && aiConfigured()`.
- `src/components/UserMenu.jsx` (edit) — "AI features" toggle row (App-lock row pattern, `data-testid="ai-features-toggle"`), `setPrefs({ aiEnabled })`, inert "Unavailable" row when unconfigured.
- `.env.example` — `VITE_AI_ENDPOINT` (public-class config; app works fully unset).
- Tests: `ai.test.js` (11), `aiWarming.test.js` (6).

## Verification (evidence)
- Service: `python -m pytest modal/tests` → **41 passed**; `import modal.api` clean without SDK.
- Client: new-file vitest → **17 passed**; `pnpm build` → built OK.
- Full worktree suite: **99 files / 1415 tests passed** (real count for this leaf worktree; the main checkout's larger number counts nested sibling worktrees).

## Story rollup
- US-1 toggle → useAI + UserMenu ✓
- US-2 warming → aiWarming + useAI ✓
- US-3 degradation → AiError kinds + throw-through wrappers ✓
- US-4 auth-only → auth.py + api.py gate + ai.js token/retry ✓ (live 401/501/429 proof deferred to deploy-time `modal run smoke.py`)

## Deferred to deploy (operator, per deployment-architecture.md)
`modal deploy modal/app.py` → `modal run modal/smoke.py` (proves US-4 live parts) → set `VITE_AI_ENDPOINT`. Not blocking U1–U4, which build against the contract + mocks.
