# Integration & Contract Test Instructions — AI Features (Cycle 2)

The client↔service boundary is a JSON contract. The integration strategy is
**contract lockstep via shared fixtures** (no live services needed) plus the
in-app mock-tagged flow tests, and a live smoke pass at deploy (separate file).

## Contract lockstep (already automated)
`modal/fixtures/*.json` is the single contract source, imported by BOTH:
- Python: `modal/tests/test_contract.py` + each route test validates the fixture
  against the Pydantic model.
- Client: each `*.test.js` imports the same fixture and asserts its
  builders/parsers produce/consume that exact shape.

**Run**: `pnpm test` + `modal/.venv/bin/python -m pytest modal/tests` — if a
route's request/response shape drifts on one side, its fixture assertion fails on
that side. Change a contract only by editing the fixture; both suites move
together.

## Cross-unit interaction scenarios (mock-tagged, automated)
| Scenario | Where verified |
|---|---|
| U1 suggestion → apply → **existing** `setTransactionsCategory` (row leaves needs-category) | `suggestions.wiring.test.jsx` |
| U1 3rd accept → **existing** `upsertPayee` rule → payee excluded from targets | `suggestions.wiring.test.jsx` |
| U2 tier-1 → `openers.addTx` seed; miss → `ai.parseSms` → seed; fail → `{notes}` | `pasteSms.wiring.test.js` |
| U3 VLM → seed → **U1 categorize** category fold (inline-validated) | `receiptScan.wiring.test.js` |
| U4 selectors → `buildDigestPayload` (aggregates only) → `ai.digest` render | `insights.wiring.test.jsx` |
| U0 gate: every AI surface hidden when `useAI().enabled` false | each wiring test |

## Manual integration (local, endpoint mocked or live)
1. `pnpm dev`; sign in. 2. With `VITE_AI_ENDPOINT` unset → confirm NO AI UI
   anywhere (US-1). 3. Set it to a deployed/`modal serve` URL, enable the toggle
   → chips, Paste SMS, Scan receipt, Generate insights appear. 4. Kill the
   endpoint → confirm every surface degrades silently to the pre-AI behavior
   (US-3): chips vanish, paste/scan fall back to an editor with the raw input,
   digest shows a retry, core flows untouched.

## Cleanup
None — the service is stateless; no test data is written anywhere (no ledger
writes, no Supabase rows, no Modal storage).
