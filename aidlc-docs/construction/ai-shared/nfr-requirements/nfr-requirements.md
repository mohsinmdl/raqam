# NFR Requirements — AI Features (consolidated, U0–U4)

Traces: requirements NFR-1..7; plan `ai-shared-nfr-requirements-plan.md`
(Q1–Q4 = A, approved 2026-08-24T18:46:00Z).

## Performance / latency budgets (per route, warm)

| Route | Budget (warm) | Mechanism |
| --- | --- | --- |
| /health | ≤300ms | trivial handler |
| /categorize | ≤2s for a 50-tx batch | CPU embeddings, kNN in-process |
| /parse-sms | ≤2s | vLLM guided JSON, short prompt |
| /parse-receipt | ≤10s | VLM single image |
| /digest | ≤5s | vLLM, aggregate-only prompt |

Cold starts: up to ~60s tolerated ONCE per idle period per function; client
timeout = 75s on first call after idle (warming UI beyond 3s), 20s thereafter.
Client debounces suggestion batches (~800ms) and never fires concurrent
duplicate route calls.

## Scalability / capacity

Single-user personal app: peak concurrency ≈ 2 requests. Modal default
autoscaling with `max_containers=1` per function (cost guard — no fan-out),
`scaledown_window` default (~60s idle) so bursts of activity share one warm
container.

## Cost (hard constraints, $30 credit)

- L4 ≈ $0.80/hr billed per second; CPU containers pennies/hr.
- max_containers=1 per function caps worst-case burn at ~2 GPU-hours/day even
  under runaway retry bugs; client has NO automatic retry loops (single
  401-refresh retry only).
- Expected profile: categorize = CPU-only (Q2 units decision: no LLM);
  SMS regex tier means the LLM is touched only for unknown formats; VLM only
  on explicit user action. Estimate: well under $5/month at personal volume.
- Budget alarm: operator checks Modal dashboard; no autonomous spend paths
  (no cron, no background jobs, nothing calls the service unattended).

## Security (Security Baseline — enforced)

- **AuthN**: every non-health route verifies the Supabase JWT locally (JWKS
  cached at container start, HS256 legacy secret fallback); `aud`/`exp`
  validated; no per-request Supabase calls.
- **AuthZ**: possession of a valid session token IS the authorization (single-
  tenant service); user id extracted for rate-limit keying only.
- **Rate limiting**: per-user in-container token bucket (e.g. 30 req/min) —
  guards credit against a leaked token; 429 response.
- **Secrets**: Supabase JWT config in a Modal Secret (`raqam-supabase-jwt`);
  nothing secret in the repo or client bundle.
- **CORS**: allowlist `https://raqam.pages.dev` + `http://localhost:5173`.
- **Transport**: Modal endpoints are HTTPS-only.
- **No retention**: no request bodies logged; no storage APIs used; error
  responses never echo content.

## Reliability / error handling

- Typed error responses (401/408/413/422/429/500) with `{ error }` bodies;
  client maps to AiError kinds; every consumer degrades silently (US-3).
- vLLM guided JSON eliminates malformed-output retries; a schema-invalid model
  result returns 500 (client degrades) rather than retrying on credit.
- No queues, no background work, no partial state — every request atomic.

## Maintainability / testability

- `modal/schemas.py` = contract truth; shared fixtures `modal/fixtures/*.json`
  consumed by pytest AND vitest (contract lockstep).
- pytest: auth unit tests (expired/garbage/valid tokens), route schema tests
  with model calls faked; live smoke script (`modal run modal/smoke.py`) for
  the deployed endpoint.
- Client: vitest + fast-check per PBT config (smsParse registry round-trips,
  aiSuggest validation), mock-endpoint tests for all `mock`-tagged stories.

## Usability

- Warming state distinct from failure everywhere (FR-0.8); all AI affordances
  disappear cleanly when disabled (US-1); notices are quiet/non-blocking
  (DESIGN.md "Trusted Ledger" tone).

## Extension compliance (this stage)

| Extension | Status | Notes |
| --- | --- | --- |
| Security Baseline | Compliant | authN/Z, secrets, CORS, rate limit, no-retention specified above |
| Resiliency Baseline | Disabled | N/A |
| PBT (partial) | Compliant | PBT targets named (smsParse, aiSuggest validators) |
