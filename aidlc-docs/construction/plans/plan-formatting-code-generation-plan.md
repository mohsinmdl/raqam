# U3 plan-formatting — Code Generation Plan

**Single source of truth for U3 generation.** Design inputs: `aidlc-docs/construction/plan-formatting/functional-design/*` (approved, incl. 0017 placement amendment). Stories owned: US-5, US-13, US-14, US-15.

## Steps

- [x] **Step 1 — Engine** (create `src/lib/planFormat.js`): pure `makeFormatter(settings)` per A1–A5 (num/money/moneySigned/moneyCompact/date/parseAmount/typedDateOrder + exposed group/decimal/symbol/placement); `setActiveFormat`/`activeFormat` singleton with legacy-equivalent default binding (PKR/before/comma-dot/DD-MM-YYYY per BR-U3-2); unknown-settings defensive fallback.
- [x] **Step 2 — Catalogues** (create `src/lib/planFormatOptions.js`): decorate seed.js `PLAN_*` keys with `{group, decimal, grouping}` / `{order, sep}` / placement labels+examples; full ISO 4217 `CURRENCIES` list (code, name) + curated `SYMBOLS` map with fallback `symbolFor(code)`; catalogue-consistency exports for the singleton-source test. *(US-5)*
- [x] **Step 3 — Wrapper rewiring** (modify `src/lib/calc.js`, `src/lib/format.js`, `src/lib/dates.js`, `src/lib/amountInput.js`): `fmtNum`/`fmtPKR`/`fmtSigned`/`fmtPKRCompact` delegate to `activeFormat()` (signatures unchanged); new `fmtDate(iso)` export; `parseTypedDate(text, today, order?)` order-aware (default from active format); `amountInput` group/decimal from active format (caret logic untouched); locate current numeric-date render sites (grep `dd/mm`, `getDate`… in register DateCell/registerColumns/exports/reports) and route them through `fmtDate`. *(US-13, US-14)*
- [x] **Step 4 — Input surfaces** (modify keypad decimal key + `src/lib/calcExpr.js` boundary + `src/lib/util.js parseAmt` if needed): plan-separator-aware parsing per BR-U3-6, internal arithmetic unchanged. *(US-15)*
- [x] **Step 5 — PlanProvider binding** (modify `src/store/PlanProvider.jsx`): `setActiveFormat(openPlan settings)` at boot alongside `setActivePlanId`.
- [x] **Step 6 — PBT + example tests** (create `tests/gen/planArbs.js`, `tests/plan-format.pbt.test.js`, `tests/plan-format.test.js`; add `fast-check` devDependency): P1–P9 from the PBT-01 table (P9 scoping partition), catalogue-consistency test (seed keys ≡ options ≡ documented 0017 CHECK lists), legacy-oracle equivalence (P8) BEFORE deleting any legacy code path, example fixtures per format, mask/lakh/negative examples. Seed logging on failure (PBT-08).
- [x] **Step 7 — Verify**: `pnpm test` all green (fix ripples in existing formatting tests — calc.decimals/calc.mask etc. must still pass unchanged, proving equivalence); `pnpm build` passes.
- [x] **Step 8 — Docs summary**: `aidlc-docs/construction/plan-formatting/code/plan-formatting-summary.md`.
- [x] **Step 9 — Story checkboxes**: US-5/13/14/15 implemented; aidlc-state.md updated.

## Execution approach
Steps 1–7 delegated to a subagent in this worktree (SDD convention) with the FD artifacts as spec; parent verifies independently and runs the gate.

## Contracts honored
- Equivalence: existing formatting tests must pass UNMODIFIED (they are the oracle) except where they directly construct Intl expectations that remain identical anyway.
- No component imports `planFormat` directly; wrappers only (BR-U3-2).
- fast-check is the only new dependency (NFR/tech-stack decision, PBT-09).
