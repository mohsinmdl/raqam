# U3 plan-formatting — Business Logic Model

## A1: Number rendering
```
num(n, decimals):
  a = |n|; digits = decimals ? 2 : 0
  intPart, fracPart = split(a fixed to digits)      // no locale API — own grouping
  grouped = grouping == '3'      ? insert group char every 3 from the right
            grouping == '3-then-2' ? rightmost 3, then every 2 (lakh)
  out = grouped + (digits ? decimal + fracPart : '')
```
Sign handling stays in money/moneySigned exactly as today (U+2212 for negative, '+' only in signed). Rationale for hand-rolled grouping: Intl can't produce `123 456-78` or `123,456/78`, and lakh needs `en-IN` — one 10-line algorithm beats three locale hacks, and it's the PBT target anyway.

## A2: Money rendering
```
money(n, masked, decimals):
  body = num(|n|, decimals)
  withSym = placement=='before' ? symbol + body
          : placement=='after'  ? body + symbol
          : body
  s = (n<0 ? '−' : '') + withSym
  return masked ? maskDigits(s) : s          // mask composes AFTER, as today
```
`moneyCompact`: en-PK compact digits (M/B/K scale — unchanged), then symbol per placement; sign as above.

## A3: Date rendering
`date(iso)`: take `iso.slice(0,10)` → y/m/d → assemble per catalogue `{order, sep}` with 2-digit day/month, 4-digit year. Pure string work; no Date object (naive-local strings stay naive).

## A4: Amount parsing (Q4=A)
```
parseAmount(text):
  s = trim(text); reject empty / illegal chars (digits, group, decimal, '.', minus)
  strip group chars (incl. U+00A0 ≡ ' ')
  candidates for decimal mark: plan decimal AND '.'
  choose the LAST occurrence among candidates as the decimal point IFF
    it has 1–2 trailing digits OR is string-final (mid-typing)
  else: dots/plan-decimals in grouping positions were already stripped as
    grouping only when group char == that char; otherwise reject ambiguous
  return Number or null
Deterministic tie-rules (documented + tested):
  'dot-comma' plan: '1.234' → 1234 (dot is this plan's GROUP char);
                    '12,5' → 12.5; '12.5' → 12.5 (dot not in a group position)
  '123,456/78' plan: '/' decimal, ',' group; '.' still accepted as decimal
```
Keypad decimal key emits plan `decimal`; `calcExpr` tokenizer normalizes via `parseAmount` at the boundary, internal arithmetic unchanged.

## A5: Typed dates (order-aware)
`parseTypedDate(text, today, order='DMY')`: existing algorithm, with the 2-3-part branch reading parts per `order` (`MDY`: m,d[,y]; `DMY` current behavior; `YMD` only via the existing 4-digit-first ISO branch — a YMD-format plan still types ISO-style, matching its display). 4-digit-first ISO input remains universally accepted.

## A6: Equivalence guarantee (US-1/13/14 zero-change AC)
`makeFormatter(PLAN_DEFAULTS)` must reproduce today's output byte-for-byte: `money ≡ fmtPKR` current behavior with `placement:'none'`… **note**: today's `fmtPKR` always prefixes `'Rs '` — but the migrated default is `placement:'none'`? **Resolution**: today's UI shows `Rs 425,000` — "Don't show" would CHANGE rendering. The YNAB screenshot default "Don't show" was for a NEW plan. To honor US-1/FR-6.4 (zero visual change), the migrated default plan must render `Rs ` prefix ⇒ **default `currency_placement` for the migrated plan should be `before` with symbol `'Rs '`**, not `none`. ⚠ This contradicts 0017's backfill default (`'none'`) — flagged as a **required U1 amendment**: change backfill + column default to `'before'` (New Plan modal may still default its UI selection per YNAB). Migration not yet applied anywhere, so the fix is a file edit, not a new migration.
Equivalence tests then assert: `money ≡ fmtPKR`, `num ≡ fmtNum`, `moneyCompact ≡ fmtPKRCompact`, `date('…') ≡ 'DD/MM/YYYY'` rendering, against the current implementations' outputs (oracle tests, PBT-05-style though only advisory).

## PBT-01 — Testable Properties (MANDATORY table)

| # | Property | Category | Generator |
|---|---|---|---|
| P1 | `parseAmount(num(x, d)) === round2(x)` for every number format × decimals | Round-trip (PBT-02) | `arbAmount` (bigint-ish ints ±1e12, plus 2-dp decimals), `arbNumberFormat` |
| P2 | `parseTypedDate(date(iso), today, order)` returns `iso.slice(0,10)` for every date format | Round-trip (PBT-02) | `arbDate` (1900–2999, valid days incl. leap), `arbDateFormat` |
| P3 | `num` output contains only digits + that format's group/decimal chars; digit count invariant vs input | Invariant (PBT-03) | `arbAmount × arbNumberFormat` |
| P4 | grouping never alters digits: strip non-digits from `num(x,0)` = `String(|round(x)|)` | Invariant (PBT-03) | same |
| P5 | lakh grouping: rightmost group 3, all others 2 | Invariant (PBT-03) | `arbAmount` |
| P6 | `maskDigits(money(x))` preserves length and non-digit chars | Invariant (PBT-03) | `arbAmount × arbSettings` |
| P7 | `money` with placement none/before/after differ only by the symbol affix | Invariant (PBT-03) | `arbAmount × arbSettings` |
| P8 | defaults-equivalence: engine(PLAN_DEFAULTS-with-before) ≡ legacy fmtPKR/fmtNum/fmtPKRCompact | Oracle (advisory) | `arbAmount` |
| P9 | plan-scoping partition (hosted here per U2 L7): scoped(p) ∩ scoped(q≠p) = ∅, union = all | Invariant (PBT-03) | `arbStoreRows` |

Generators (PBT-07): centralized in `tests/gen/planArbs.js` — domain-constrained (`arbAmount` includes 0, ±1, boundary magnitudes, 2-dp cents; `arbDate` includes leap days, month ends; `arbSettings` = full 8×3×7 cross), reused across suites. Shrinking + seed logging per PBT-08 (vitest reporter prints fast-check seed on failure; CI logs it).

## No properties identified for
Wrapper delegation modules (`format.js useMoney`) — thin binding, example-based tests only (rationale: no algorithmic content).
