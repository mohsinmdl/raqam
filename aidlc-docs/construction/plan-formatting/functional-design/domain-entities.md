# U3 plan-formatting — Domain Entities

## Settings (input) — from the open plan (U1 keys, U2 store shape)
```js
{ currency: 'PKR', currencyPlacement: 'before'|'after'|'none',
  numberFormat: 'comma-dot'|…|'lakh', dateFormat: 'DD/MM/YYYY'|… }
```

## NUMBER_FORMATS catalogue (`src/lib/planFormatOptions.js`; keys re-exported from seed.js PLAN_NUMBER_FORMATS — one source)
```js
{ key, label /* the example itself, YNAB-style */, group, decimal, grouping }
// comma-dot     → group ','  decimal '.'  grouping '3'
// dot-comma     → group '.'  decimal ','  grouping '3'
// space-dot     → group ' '  decimal '.'  grouping '3'   (U+00A0 renders, plain space parses too)
// apostrophe-dot→ group '\'' decimal '.'  grouping '3'
// space-dash    → group ' '  decimal '-'  grouping '3'
// space-comma   → group ' '  decimal ','  grouping '3'
// comma-slash   → group ','  decimal '/'  grouping '3'
// lakh          → group ','  decimal '.'  grouping '3-then-2' (1,23,456.78)
```

## DATE_FORMATS catalogue
```js
{ key /* the pattern */, order: 'YMD'|'DMY'|'MDY', sep: '/'|'-'|'.' }
// derived mechanically from the key (e.g. 'DD.MM.YYYY' → DMY, '.')
```

## PLACEMENTS catalogue
```js
{ key: 'before'|'after'|'none', label, example(symbol) }  // Before amount (Rs123,456.78) …
```

## CURRENCY catalogue (`CURRENCIES`)
Full ISO 4217 active list `{ code, name, symbol? }` (label rendered "Pakistan Rupee–PKR"). Symbol map curated for common currencies (Rs, $, €, £, ¥, ₹, ₺, ₽, ﷼, ₦, R, RM, ৳, ₩, ₫, ฿, …); `symbolFor(code) = map[code] ?? code + ' '`-style fallback (code + space when used as prefix, space + code as suffix). Static data module — no runtime lookup cost.

## Formatter (output of `makeFormatter(settings)`) — all pure
```js
{ money(n, masked?, decimals?)      // symbol placement + sign (U+2212) + num
  moneySigned(n, masked?, decimals?)// '+'/'−' prefix variant
  moneyCompact(n)                   // M/B tail via en-PK compact digits, re-symbolized
  num(n, decimals?)                 // no symbol
  date(iso)                        // numeric date per dateFormat (Q2=A: numeric sites only)
  parseAmount(text) → number|null   // inverse of num (Q4=A dual-separator rules)
  typedDateOrder                    // 'DMY'|'MDY'|'YMD' for parseTypedDate
  group, decimal, symbol, placement // exposed for keypads/inputs
}
```

## Singleton binding (`src/lib/planFormat.js`)
`setActiveFormat(settings)` / `activeFormat()` — bound by PlanProvider at boot (U2 L1 step 4), rebound only via reload (BR-U2-1). Default binding = PLAN_DEFAULTS so tests and pre-bind renders behave like today.

## Wrapper rewiring map (call sites unchanged)
| Existing export | Becomes |
|---|---|
| `calc.js fmtNum(n, decimals)` | `activeFormat().num(n, decimals)` |
| `calc.js fmtPKR(n, masked, decimals)` | `activeFormat().money(…)` |
| `calc.js fmtSigned(n, masked, decimals)` | `activeFormat().moneySigned(…)` |
| `calc.js fmtPKRCompact(n)` | `activeFormat().moneyCompact(n)` |
| `format.js useMoney()` | unchanged signature; delegates to the wrappers above |
| numeric register/picker/export date rendering | new `fmtDate(iso)` wrapper → `activeFormat().date(iso)` (code-gen locates the current `dd/mm/yyyy` sites) |
| `dates.js parseTypedDate(text, today)` | gains order param defaulting to `activeFormat().typedDateOrder` |
| `amountInput.js formatAmountInput/…` | separator-aware via `activeFormat().{group,decimal}` (caret logic unchanged — digit counting is separator-agnostic) |
| `calc.js monthLabel/shortDate/dayLabel/timeLabel/relTime` | **unchanged** (Q2=A friendly labels) |
| `maskDigits` | unchanged; composes over any formatted string |
