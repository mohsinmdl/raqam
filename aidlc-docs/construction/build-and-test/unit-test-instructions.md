# Unit Test Execution — AI Features (Cycle 2)

## Client (vitest)
```bash
pnpm test
```
- **Expected**: **107 test files, 1520 tests, 0 failures** (whole app; the
  cycle-2 additions are among them). Duration ~3–5s.
- Cycle-2 unit/mock test files:
  - `src/lib/ai.test.js`, `src/lib/aiWarming.test.js` (U0)
  - `src/lib/aiSuggest.test.js`, `src/ui/ai/suggestions.wiring.test.jsx` (U1)
  - `src/lib/smsParse.test.js`, `src/ui/ai/pasteSms.wiring.test.js` (U2)
  - `src/lib/receiptSeed.test.js`, `src/ui/ai/receiptScan.wiring.test.js` (U3)
  - `src/lib/digestData.test.js`, `src/ui/ai/insights.wiring.test.jsx` (U4)
- Property-based (fast-check, per the enforced PBT subset): suggestion
  id-integrity, SMS parser round-trips, receipt seed invariants.
- Env: node (no jsdom) — UI assertions use `react-dom/server` per repo
  convention; AI network is mocked via `useAI`/`ai.js` stubs.

## Service (pytest)
```bash
modal/.venv/bin/python -m pytest modal/tests -q
```
- **Expected**: **101 passed** (2 pre-existing benign warnings). No GPU, no model
  download, no Modal account — every model call is an injected fake.
- Files: `test_health_cors.py`, `test_auth.py`, `test_routes.py`,
  `test_contract.py` (U0), `test_categorize.py` (U1), `test_parse_sms.py` (U2),
  `test_parse_receipt.py` (U3), `test_digest.py` (U4).

## On failure
1. Client: read the vitest file:line; the AI modules are pure/mocked, so a
   failure is local. 2. Service: the pure `rank`/`parse_*`/`narrate` functions are
   fully unit-tested with deterministic fakes; fix and rerun. Rerun until green
   before requesting review.
