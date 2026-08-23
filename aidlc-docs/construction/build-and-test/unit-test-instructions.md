# Unit Test Execution — Multi-Plan

## Run
```bash
pnpm test          # vitest run — whole suite
pnpm test tests/plan-scoping.test.js tests/plan-provider.test.js tests/plan-format.test.js tests/plan-format.pbt.test.js tests/plan-shell.test.js   # feature-only
```

## Expected
- **95 test files / 1363 tests, 0 failures** (as of U4 completion; live-verification fixes may add more)
- Feature suites: `plan-scoping` (mappers, stamping symmetry, fetch filters, actions, prefs fold), `plan-provider` (resolveOpenPlan), `plan-format` (42 examples incl. catalogue-consistency vs 0017 CHECK lists), `plan-format.pbt` (P1–P9 fast-check properties, 100 runs each), `plan-shell` (16 pure-logic tests)
- **Equivalence oracle**: `src/lib/calc.decimals.test.js`, `src/lib/calc.mask.test.js`, `tests/amount-input.test.js`, `tests/calc-expr.test.js`, `tests/typed-date.test.js`, `tests/spendingExport.test.js` pass UNMODIFIED — proving migrated rendering is byte-identical

## PBT reproducibility (PBT-08)
On a property failure, fast-check prints the seed and the shrunk counterexample. Re-run deterministically by passing `{ seed }` to the failing `fc.assert` locally. CI (deploy.yml test step) logs the same output. Flaky property failures are investigated, never retried away.

## Fixing failures
1. Read the failing assertion + (for PBT) the shrunk minimal input
2. Decide: implementation bug vs stale expectation — the equivalence-oracle files must NEVER be edited to pass
3. Fix, re-run the single file, then the whole suite
