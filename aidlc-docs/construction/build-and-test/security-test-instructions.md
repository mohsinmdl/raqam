# Security Test Instructions — AI Features (Cycle 2)

Security Baseline is enforced this cycle. The new attack surface is one network
service handling financial text; these checks cover it.

## Automated (pytest — already green)
| Check | Test |
|---|---|
| Anonymous request to any feature route → 401 | `test_auth.py`, `test_routes.py` |
| Expired / garbage / wrong-key / missing token → 401 (HS256 + JWKS paths) | `test_auth.py` |
| `aud`/`exp`/`sub` validated | `test_auth.py` |
| CORS allowlist present for an allowed origin | `test_health_cors.py` |
| Per-user rate limit → 429 after the cap; per-user isolation | `test_routes.py` |
| Oversize receipt upload → 413 before any model call | `test_parse_receipt.py` |
| No image/request-body persistence (source scan + fs snapshot) | `test_parse_receipt.py` |

## Manual / review checklist (at deploy)
- [ ] `raqam-supabase-jwt` is a **Modal Secret**; no JWT secret/JWKS in the repo
  or the client bundle (`grep -r SUPABASE_JWT_SECRET src/` → nothing).
- [ ] `VITE_AI_ENDPOINT` is the only new client-visible config (public-class,
  like the anon URL).
- [ ] CORS `allow_origins` = exactly `https://raqam.pages.dev` +
  `http://localhost:5173` (no `*`).
- [ ] Live: `curl -XPOST <endpoint>/parse-sms` with no token → 401; with a valid
  Supabase session token → served (`modal run modal/smoke.py` covers this).
- [ ] Structured logs contain route/status/duration/user-hash only — never
  request/response bodies (privacy / no-retention). Spot-check Modal logs.
- [ ] No transaction/category/receipt data reaches any third party — models are
  self-hosted in the user's Modal workspace; the client posts only to
  `VITE_AI_ENDPOINT`.

## Trust-model checks (product-security)
- [ ] AI never writes: every mutation is a user-confirmed call to an EXISTING
  action (`setTransactionsCategory`, `upsertPayee`, editor save). Confirm no AI
  module imports store reducers/sync (`grep -rn "store/actions\|store/sync"
  src/lib/ai*.js src/lib/aiSuggest.js src/lib/smsParse.js src/lib/receiptSeed.js
  src/lib/digestData.js` → nothing).
- [ ] Digest figures shown in the UI come from the client payload, never model
  text (FR-4.3) — `insights.wiring.test.jsx` asserts it.
