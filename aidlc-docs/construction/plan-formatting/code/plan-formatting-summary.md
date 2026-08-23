# U3 plan-formatting — Code Generation Summary

Verification: `pnpm test` = 94 files / 1347 tests passing (up from 92/1295; oracle formatting tests — calc.decimals, calc.mask, amount-input, calc-expr, keypad-state, typed-date, spendingExport — pass UNMODIFIED); `pnpm build` succeeds. fast-check 4.9.0 is the only new dependency (PBT-09).

## Created
- `src/lib/planFormat.js` — pure `makeFormatter` (A1–A5: hand-rolled 3/lakh grouping, legacy-mirroring rounding, placement + U+2212 + mask-last composition, compact tail, pure-string `date`, deterministic dual-separator `parseAmount`, `typedDateOrder`); `setActiveFormat`/`activeFormat` singleton defaulting to exported `LEGACY_SETTINGS` (PKR/before/comma-dot/DD/MM/YYYY); canonical `maskDigits` moved here (calc.js re-exports — breaks an import cycle)
- `src/lib/planFormatOptions.js` — decorated catalogues over seed.js keys, ~45-symbol map + `symbolFor(code, placement)` fallback, 155-code ISO-4217 `CURRENCIES`
- `tests/gen/planArbs.js`, `tests/plan-format.pbt.test.js` (P1–P9 + NBSP property, seeds logged), `tests/plan-format.test.js` (42 examples incl. catalogue-consistency against the 0017 CHECK lists)

## Modified
- `src/lib/calc.js` (formatters delegate, signatures unchanged; new `fmtDate`; friendly labels untouched), `src/lib/dates.js` (order-aware `parseTypedDate`, `datePlaceholder()`), `src/lib/amountInput.js` (plan separators; caret logic intact), `src/lib/util.js` (`parseAmt` strict-first + legacy fallback), `src/lib/calcExpr.js` (boundary-only normalization; operators keep arithmetic meaning in every plan), `src/lib/keypadState.js` (`displayOf` plan grouping), `src/store/PlanProvider.jsx` (binds `setActiveFormat` at boot)

## Numeric date sites routed through `fmtDate`
`src/ui/tx/inline/DateCell.jsx` (value + placeholder), `src/screens/Plan.jsx` (MovesPopover), `src/lib/spendingExport.js` (CSV). Full grep found no others; friendly labels stay per BR-U3-5.

## Deviations (accepted)
- No keypad decimal key exists today (integer-PKR keypad) — BR-U3-6's key rule is vacuous; formatter exposes `decimal` for the future.
- `PLAN_DEFAULTS` keeps `'none'` (modal default) vs engine `LEGACY_SETTINGS` `'before'` — relationship pinned by a test.
- calcExpr now rejects interior-space operands under comma-dot (previously parseFloat read `'5 000'` as 5) — unpinned edge, strictly safer.

## Stories
US-5 ✅ US-13 ✅ US-14 ✅ US-15 ✅

## Handoffs to U4
Settings UI data ready in `planFormatOptions.js` (labels are worked examples; `PLACEMENTS.example(sym)`); modal passes chosen settings into `createPlan`; formatter binds on the post-create reload (no live rebinding, BR-U2-1). Plus U2's standing items: replace `NoPlansYet`, `system:true` dispatches, `pendingSeed` before `switchPlan`, resetAll/legacy-import fresh-id fix.
