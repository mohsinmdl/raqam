# raqam-ai — Modal service

The AI backend for Raqam: a single Modal app (`raqam-ai`) serving a FastAPI
endpoint for `/health`, `/categorize`, `/parse-sms`, `/parse-receipt`, and
`/digest`. U0 ships the **skeleton** — auth, CORS, rate limiting, `/health`, and
all four feature routes stubbed to HTTP 501. Later units (U1–U4) implement the
route bodies and add the GPU functions.

Privacy stance: request/response bodies are **never** logged or stored; auth is
verified locally (no per-request Supabase call); the service runs only on user
action (no cron, no keep-warm).

## Layout

| File | Purpose |
| --- | --- |
| `schemas.py` | Pydantic v2 contract models — the server-side source of truth |
| `auth.py` | Supabase JWT verification (JWKS RS256/ES256 + HS256 legacy) |
| `api.py` | FastAPI `app`: CORS, rate limit, logging, routes (imports no Modal/model libs) |
| `app.py` | Modal wiring: app, pinned image, volume, secret, CPU `api` function |
| `smoke.py` | `modal run` deploy-time PASS/FAIL matrix against the live endpoint |
| `fixtures/*.json` | Shared request/response contract examples (pytest + client vitest) |
| `tests/` | pytest suite (no Modal account, no model downloads) |

## Run the tests (no Modal account, no models)

```bash
python -m venv modal/.venv && source modal/.venv/bin/activate
pip install -r modal/requirements-dev.txt
python -m pytest modal/tests -q            # from the repo root
```

The suite covers the auth matrix (HS256 + JWKS/RS256, expired/garbage/missing),
`/health`, CORS headers, the 501 stubs, the rate-limit bucket, and validates
every `fixtures/*.json` against its Pydantic model (contract lockstep).

## Operator runsheet (deploys are manual — you hold the Modal credentials)

### One-time setup

```bash
pipx install modal            # or: pip install modal
modal setup                   # browser auth into your workspace

# Supabase JWT config (values from Supabase dashboard → Settings → API).
# Provide SUPABASE_JWKS_URL (modern asymmetric signing) and/or the legacy
# SUPABASE_JWT_SECRET (HS256). Both may be set; the token's alg selects the path.
modal secret create raqam-supabase-jwt \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json \
  SUPABASE_JWT_SECRET=<legacy JWT secret, if the project still uses HS256>
```

The `raqam-ai-models` Volume is created automatically on first deploy
(`create_if_missing=True`); it stays empty until the U2/U3 GPU functions land.

### Deploy / update (on every merge that touches `modal/`)

```bash
modal deploy modal/app.py     # prints the stable endpoint URL
```

Endpoint URL shape: `https://<workspace>--raqam-ai-api.modal.run`.

### Smoke the deployment

```bash
export RAQAM_AI_ENDPOINT=https://<workspace>--raqam-ai-api.modal.run
export RAQAM_AI_TEST_TOKEN=<a valid Supabase session JWT>   # optional
modal run modal/smoke.py
```

Expected matrix (U0): `/health` 200 · anon route 401 · garbage token 401 ·
authed route 501 (until U1–U4) · rate-limit burst 429. Without a test token the
authed rows report SKIP rather than FAIL.

### Service-side development (no touch to the deployed app)

```bash
modal serve modal/app.py      # ephemeral hot-reload URL
# point .env.local at it: VITE_AI_ENDPOINT=<ephemeral url>
```

### Client wiring

```bash
# .env.local (dev) and Cloudflare Pages env (prod build):
VITE_AI_ENDPOINT=https://<workspace>--raqam-ai-api.modal.run
```

Then enable the per-user in-app "AI features" toggle.

### Rollback layers (fastest → most complete)

1. Toggle "AI features" off in-app (per user; client degrades silently).
2. Unset `VITE_AI_ENDPOINT` and rebuild Pages (client behaves as unconfigured).
3. `modal app stop raqam-ai` (takes the whole service offline).

## Cost guardrails

`max_containers=1` on every function; GPU functions (added later) scale to zero;
no schedules or keep-warm. The `$30` credit is monitored via the Modal
dashboard — there are no autonomous spend paths.

## Version pinning

The image `pip_install(...)` list in `app.py` is the lockfile — exact versions,
bumped only as a deliberate diff. `requirements-dev.txt` mirrors those libraries
(unpinned) for the local test environment.
