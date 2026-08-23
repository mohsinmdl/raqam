# U3 plan-formatting — Business Rules

## BR-U3-1: Defaults equivalence (US-1/13/14)
With the migrated plan's settings (PKR / **before** / comma-dot / DD/MM/YYYY), every formatter output is byte-identical to today's `fmtPKR`/`fmtNum`/`fmtPKRCompact`/dd-mm-yyyy rendering (incl. `'Rs '` with its trailing space as the PKR symbol, U+2212 negatives, compact M/B tail). Enforced by oracle tests against the legacy implementations. **Amendment applied**: 0017's backfill now writes `currency_placement='before'` (column default stays `'none'` for the modal's YNAB-style default).

## BR-U3-2: Purity and binding
`makeFormatter` is pure (settings in → functions out; no store, no React). The singleton (`setActiveFormat`) is bound once per app lifetime by PlanProvider; pre-bind default = the legacy-equivalent settings so nothing can render un-bound differently. Consumers keep importing the existing wrappers — no component imports `planFormat` directly.

## BR-U3-3: Mask composition
`maskDigits` applies after full formatting, for every format (P6). Mask semantics unchanged: digits → '•', symbol/separators/sign survive.

## BR-U3-4: Decimals composition (Q1=A)
The device `decimals` pref selects 0 vs 2 fraction digits; the plan's format supplies the characters. No per-plan decimals setting.

## BR-U3-5: Date scope (Q2=A)
Only numeric date renderings go through `fmt.date`; friendly labels (`monthLabel`, `shortDate`, `dayLabel`, `timeLabel`, `relTime`) and stored strings (naive-local ISO) are untouched. `parseTypedDate` honors the plan's order (`MDY` plans read `3/4` as March 4); 4-digit-first ISO input always accepted.

## BR-U3-6: Parsing determinism (Q4=A)
`parseAmount` accepts the plan decimal AND `.`; grouping chars (incl. NBSP≡space) stripped; ambiguity resolved by the documented last-candidate + 1–2-trailing-digit rule; anything else → null (existing `--neg` invalid ring behavior). Keypad decimal key inserts the plan separator; `calcExpr` normalizes at its tokenizer boundary only.

## BR-U3-7: Catalogue single-source
Keys live in `seed.js` (`PLAN_*`, mirrors 0017 CHECKs, already the createPlan clamp); `planFormatOptions.js` decorates them with group/decimal/order/sep/labels/examples and re-exports. A test asserts catalogue keys === seed keys === (documented) 0017 CHECK lists.

## BR-U3-8: PBT obligations
P1–P9 implemented with centralized generators (`tests/gen/planArbs.js`), fast-check shrinking on, seed logged on failure (PBT-08). Example-based tests still pin: Rs default rendering, one example per number/date format (the catalogue labels double as fixtures), lakh example `12,34,567.89`, mask examples (PBT-10 complement).

## Error scenarios
| Scenario | Rule |
|---|---|
| Unknown settings key reaches makeFormatter | Fall back to legacy-equivalent defaults + console.warn (defensive; CHECKs make it unreachable) |
| parseAmount ambiguous/garbage | null → existing invalid-input UI affordances |
| parseTypedDate impossible date under plan order | null (existing ring) — user can always type ISO |
