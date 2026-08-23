# U3 plan-formatting — Functional Design Plan

> **Note**: Questions pre-filled with Claude's recommendations (per your convention).

## Scope
Pure format engine (`makeFormatter`), option catalogues with labels/examples, wrapper rewiring of `calc.js`/`format.js`/date helpers, separator-aware amount input, PBT-01 property identification + PBT suites. Owns US-5/13/14/15; contributes to US-1/3/4.

## Clarifying Questions

## Question 1
How do the existing `decimals` device pref (cosmetic `.00` toggle) and plan number formats combine?

A) **Compose**: `decimals` keeps deciding 0 vs 2 fraction digits (device-level, as today); the plan's number format decides the grouping and separator characters those digits render with (`123.456,78` with decimals on, `123.457` off). No new setting

B) Move decimal digits into per-plan settings (new plans column — schema change, YNAB-style per-currency digits)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
Which date displays does the plan `date_format` govern?

A) **Numeric dates only** — register date column, date pickers/typed input, exports, anywhere a `DD/MM/YYYY`-shaped date renders. Friendly composite labels (`monthLabel` "August 2026", `shortDate` "Sun, 23 Aug", relative times) keep their current English wording — exactly YNAB's behavior

B) Everything, including re-deriving friendly labels from the format's day/month/year order

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 3
Currency symbol source for `before`/`after` placements?

A) **Curated symbol map for common currencies** (Rs, $, €, £, ¥, ₹, ₺, ₦, ﷼, R, RM, ৳, …) with **ISO-code fallback** (`USD 1,234.56` → rare codes render as `XYZ 123.45`); "Don't show" ignores it entirely

B) Always the ISO code (even PKR renders "PKR 123.45" — loses Rs parity with today)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 4
Amount PARSING (inputs, keypads, plan-cell calculator) under non-dot decimal separators?

A) **Accept both** the plan's decimal separator and `.` (grouping chars stripped; in `dot-comma` plans a lone `.` between digits is treated as decimal when unambiguous — i.e. `12.5` parses as 12.5, `1.234.567` as grouped); keypad's decimal key inserts the plan's separator; calculator (`calcExpr`) unchanged internally, its tokenizer normalized at the boundary

B) Strict: only the plan's separator parses (typing `.` in a comma-decimal plan is rejected)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist
- [x] Generate `aidlc-docs/construction/plan-formatting/functional-design/business-logic-model.md` (formatter algorithms per key, parse algorithm + ambiguity rules, wrapper rewiring map of every calc.js/format.js/dates.js consumer-facing function)
- [x] Generate `aidlc-docs/construction/plan-formatting/functional-design/business-rules.md` (equivalence-to-today rule for default settings, mask composition, negative signs, compact tail, lakh grouping)
- [x] Generate `aidlc-docs/construction/plan-formatting/functional-design/domain-entities.md` (settings/formatter shapes, option catalogue schema incl. labels + live examples, symbol map)
- [x] **PBT-01 property table** (required — Testable Properties section: round-trips, invariants, generators) embedded in business-logic-model.md
- [x] Validate against US-5/13/14/15 ACs and PBT-02/03/07 (found + fixed: 0017 backfill placement none→before to honor US-1 zero-change; parseTypedDate order-awareness added for MDY plans)
