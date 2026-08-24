# Infrastructure Design — AI Features (consolidated, U0–U4)

Provider: **Modal.com** (user's workspace, $30 credit). One Modal app named
**`raqam-ai`**; units add routes/functions to it, never new apps.

## Modal resources

| Resource | Name | Purpose |
| --- | --- | --- |
| App | `raqam-ai` | All functions + the web endpoint |
| Function `api` | CPU, 2 vCPU / 2 GB, `max_containers=1` | FastAPI ASGI: auth, CORS, rate limit, /health, /categorize (embeddings in-process) |
| Function `llm` | L4 GPU, `max_containers=1` | vLLM Qwen3-4B-Instruct; `.remote()` from api (/parse-sms, /digest) |
| Function `vlm` | L4 GPU, `max_containers=1`, own image | vLLM Qwen2.5-VL-7B-Instruct; `.remote()` (/parse-receipt) |
| Volume | `raqam-ai-models` | HF weights cache; first boot downloads, later colds read from volume |
| Secret | `raqam-supabase-jwt` | `SUPABASE_JWKS_URL` (and/or `SUPABASE_JWT_SECRET` legacy), `SUPABASE_URL` |

Scaledown: default (~60s idle) on all functions; cold-start budget per NFR
(≤60s worst case, warming UI client-side).

## Request path

Browser (raqam.pages.dev / localhost:5173)
→ HTTPS → Modal web endpoint (`https://<workspace>--raqam-ai-api.modal.run`)
→ CORS check (allowlist exactly: `https://raqam.pages.dev`, `http://localhost:5173`)
→ JWT verify (JWKS cached at container start; HS256 fallback via Secret)
→ per-user token bucket (30 req/min → 429)
→ route handler → (optional) `llm.remote()` / `vlm.remote()` → JSON response.

No API gateway, no LB, no queues — Modal's endpoint IS the ingress; every
request is atomic (no async jobs, no state).

## Security placement

- Secrets only in Modal Secrets; repo and client bundle carry none.
- `VITE_AI_ENDPOINT` is public-class config (like the Supabase anon URL).
- Logs: structured single-line per request — route, status, ms, sha256(user
  id) prefix — request/response bodies NEVER logged (NFR no-retention).
- Rate limit lives in `api` (in-process; max_containers=1 makes a local bucket
  globally correct).

## Cost controls (infrastructure-level)

- `max_containers=1` everywhere; GPU functions scale to zero.
- Volume avoids re-download bandwidth on every cold start.
- No schedules, no keep-warm, no cron — the service runs ONLY on user action.

## Dev story

- Client work: mock endpoint in tests; real endpoint from `.env.local`
  (`VITE_AI_ENDPOINT`) when wanted.
- Service work: `modal serve modal/app.py` → ephemeral hot-reload URL; point
  `.env.local` at it. Single deployed environment otherwise (plan Q2=A).
