# Code Generation Plan — U0 ai-foundation

**This plan is the single source of truth for U0 Code Generation.**

## Unit context
- **Stories**: US-1 (toggle), US-2 (warming), US-3 (degradation), US-4 (auth-only)
- **Depends on**: nothing (first unit). **Blocks**: U1–U4.
- **Interfaces delivered**: full route contracts in `modal/schemas.py` (all
  routes, even those stubbed 501); client `ai.js` API; `useAI()` hook; toggle.
- **No database entities.** No store/reducer changes anywhere in this unit.
- **Design inputs**: components/methods/services/dependency docs (ai-features),
  ai-shared NFR + infrastructure docs.
- Workspace root: `/Users/dev/projects/raqam/.claude/worktrees/ai-features`
  (brownfield — modify existing files in place; new files where noted).

## Generation steps

### Service (Python — new `modal/` package)
- [x] **Step 1 — `modal/schemas.py`**: Pydantic v2 models for ALL route
  requests/responses per component-methods contract (categorize, parse-sms,
  parse-receipt, digest, health, error body). This file is the contract truth
  consumed by every later unit. *(US-4 groundwork)*
- [x] **Step 2 — `modal/auth.py`**: JWT verification — JWKS fetched+cached at
  container start (`SUPABASE_JWKS_URL`), HS256 fallback (`SUPABASE_JWT_SECRET`);
  validates signature/exp/aud; FastAPI dependency yielding user id; 401 on any
  failure. Pure-python verify helpers separated for pytest. *(US-4)*
- [x] **Step 3 — `modal/app.py`**: Modal app `raqam-ai`; pinned-version image;
  volume `raqam-ai-models` + secret `raqam-supabase-jwt` mounts; CPU `api`
  function (max_containers=1) exposing FastAPI ASGI: CORS allowlist, per-user
  token bucket (30/min → 429), `GET /health` → `{ok, version}`, and the four
  feature routes registered but returning **501** (U1/U2/U3/U4 fill them).
  Structured content-free request logging. *(US-4; FR-0.1/0.2)*
- [x] **Step 4 — `modal/smoke.py`**: `modal run` script — /health 200, anon
  feature-route 401, bad-token 401, authed 501 (until units land), rate-limit
  429 probe. Prints a PASS/FAIL matrix. *(US-4 live proof)*
- [x] **Step 5 — `modal/fixtures/*.json`**: request/response examples per route
  + error shapes, lifted from component-methods; consumed by pytest AND vitest
  (contract lockstep).
- [x] **Step 6 — `modal/tests/`**: pytest — auth matrix (valid/expired/garbage/
  missing; JWKS and HS256 paths), health, 501 stubs, schema round-trips against
  fixtures, rate-limit bucket. FastAPI TestClient; no network, no models.
- [x] **Step 7 — `modal/README.md`**: operator runsheet (from
  deployment-architecture.md): setup, secret create, deploy, smoke, client env
  wiring, rollback layers.

### Client (JS — new files + two in-place edits)
- [x] **Step 8 — `src/lib/ai.js`**: `aiConfigured()`, `authedFetch` (token from
  `supabase.auth.getSession()`, AbortController timeout 20s/75s-cold, single
  401 → `refreshSession()` → retry), typed helpers (categorize/parseSms/
  parseReceipt/digest/health), `AiError{kind: 'cold'|'auth'|'unavailable'|
  'bad-response'}` (501 → 'unavailable'). Mirrors sync.js conventions. *(US-3/4)*
- [x] **Step 9 — `src/lib/ai.test.js`**: vitest with mocked fetch + supabase —
  config detection, token attach, 401-refresh-retry-once, second-401 → auth
  error, timeout → cold kind, 501 mapping, fixture-shape validation of helper
  payloads. *(US-3/US-4 unit tags)*
- [x] **Step 10 — `src/ui/ai/useAI.js` + `src/lib/aiWarming.js`**: pure warming
  state machine (call-tracked, >3s → warming, settle clears) in `aiWarming.js`
  with vitest coverage; `useAI()` composes prefs.aiEnabled + aiConfigured +
  warming + wrapped calls. *(US-1/US-2)*
- [x] **Step 11 — UserMenu toggle row** (modify
  `src/components/UserMenu.jsx` in place): "AI features" toggle following the
  App-lock row pattern; persists via `setPrefs({ aiEnabled })` (existing
  per-user fall-through — no prefs plumbing changes); shows "unavailable" note
  when `!aiConfigured()`; `data-testid="ai-features-toggle"`. *(US-1)*
- [x] **Step 12 — config + docs + verification**: add `VITE_AI_ENDPOINT` to
  `.env.example` (comment: public-class config); write
  `aidlc-docs/construction/ai-foundation/code/code-summary.md`; run full
  `pnpm test` + `pnpm build` (suite green, build green); pytest green locally
  (`python -m pytest modal/tests` — no Modal account needed).

## Story rollup
- US-1 → Steps 10, 11 · US-2 → Step 10 · US-3 → Steps 8, 9, 10 ·
  US-4 → Steps 2, 3, 4, 6, 8, 9 (live parts via smoke at deploy time)
- [x] US-1 implemented · [x] US-2 implemented · [x] US-3 implemented ·
  [x] US-4 implemented (client+service code; live proof deferred to deploy)

## Execution notes
- Subagent-driven execution (established convention) with in-place edits only;
  no store/actions/sync changes; every new interactive element carries
  data-testid.
- Python tests must be runnable WITHOUT Modal credentials (pure FastAPI
  TestClient); only smoke.py needs the deployed app.
