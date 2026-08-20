# Post-review fix wave — inline transaction editor

Branch: worktree-inline-tx-editor-spec. All eight fixes applied to
src/lib/txEditorState.js (the pure brain) and its four UI callers, with the
test file updated as the contract. `pnpm test` and `pnpm build` both green.

## FIX 1 — income+category no longer blindly flips to refund

`editorPatch(f, key, value, ctx = {})` and `inflowType(f, categoryOverride, ctx)`
now take an optional `ctx.catTypeOf(id) => 'income'|'expense'|null`. The
`'category'` branch only retypes income→refund when the picked category
resolves to `'expense'`; an income-typed, unknown, or ctx-absent category
leaves the row as income. `inflowType` mirrors the same rule for the amount
path: refund only fires on a card source OR an EXPENSE-typed current category.

TxEditorRow.jsx builds `catTypeOf = id => (S.categories.find(c => c.id === id) || {}).type || null`
once per render and threads `{ catTypeOf }` through its local `patch` helper
into every `editorPatch` call.

Tests (tests/tx-editor-state.test.js):
- "picking an EXPENSE-typed category on an income flips to refund" (renamed, ctx supplied)
- "picking an INCOME-typed category on an income stays income" (new)
- "picking a category on an income with no ctx (or an unknown category) stays income too" (new)
- "inflow with an EXPENSE-typed category → refund" (renamed, ctx supplied)
- "inflow with an INCOME-typed category stays income, category kept" (new)
- "inflow onto a CARD source → refund regardless of category" (ctx supplied, still refund via onCard)

Live verification (a): set INFLOW=5,000 on a fresh expense row (auto-flipped
to income, CTA read "Record income"), picked category "Salary" (income-typed;
the picker correctly listed only income categories). Row stayed income (CTA
still "Record income", no validation error), saved cleanly, and listed in the
register as an income transaction with category "Salary" and a positive
inflow. PASS.

## FIX 2 — no transfer-direction flip from an amount edit

`editorPatch`'s `'inflow'` branch on a transfer now returns `{ amount }` only
— identical to outflow. Direction is controlled solely by the account cell
and the To/From payee.

Tests updated with the comment "direction never flips from an amount edit —
a re-edit must not reverse a transfer":
- "outflow/inflow on a transfer never touch from/to" (was: "...only swaps direction, never the type")
- "an inflow edit on a transfer leaves from/to untouched" (was the Task-14-era
  cellsFromForm round-trip test asserting the swap; now asserts from/to and
  the outflow/inflow cell split are unchanged by the edit)

Live verification (b): created a transfer via the payee cell's "To/From
Second Account" (Main Checking/a1 → Second Account/a2), set an amount, saved
— register showed "Main Checking → Second Account". Reopened the saved row,
edited the amount again (1,000 → 2,500), saved again — register still showed
"Main Checking → Second Account" (direction unchanged, only the amount
changed, row marked "Edited"). PASS.

## FIX 3 — AmountCell reverts a stale invalid draft on blur

`commit` now takes `fromBlur`. On an invalid/negative `applyCalcExpr` result:
`onBlur={() => commit(true)}` reverts (`setDraft(null)`) so the cell falls
back to showing the real committed value; `onKeyDown` Enter calls
`commit(false)`, which still leaves the draft open for correction (unchanged
behavior). src/ui/tx/inline/AmountCell.jsx.

No unit test exists for this component (it's DOM-only, no Vitest coverage in
this suite); verified live only, per the spec.

Live verification (c): typed `10-50` (evaluates negative) into the OUTFLOW
cell of a fresh row, then clicked into the Memo field (blur, no Enter). The
Outflow cell reverted to its placeholder text ("outflow") — the real, empty
committed value — with no trace of `10-50` or a computed negative number,
confirmed via both an accessibility snapshot and a screenshot. PASS.

## FIX 4 — clearing an amount clears only the amount

`editorPatch` now short-circuits at the top of the shared outflow/inflow
handling: `if ((key === 'outflow' || key === 'inflow') && !String(value).trim()) return { amount: '' };`
— an emptied cell never retypes the row.

Test added: "clearing outflow/inflow clears the amount only, never retypes
the row" — covers an income row's inflow cleared to `''` and to whitespace,
and an expense row's outflow cleared, all yielding exactly `{ amount: '' }`.

## FIX 5 — firstEmptyCell collapsed to its real behavior

```js
export function firstEmptyCell(cells, hideAccount) {
  return (!hideAccount && !cells.account) ? 'account' : 'payee';
}
```
with a comment explaining date is always seeded by txDefaults and
memo/category never take first focus. Test renamed to "is account when shown
and empty, otherwise payee (date is always seeded by txDefaults)"; dropped
the fourth assertion (fully-filled cells still landing on 'payee'), which
exercised the removed dead branches without adding coverage beyond the kept
assertions.

## FIX 6 — sort-rows.test.js header-reachability invariant

tests/sort-rows.test.js's "every sort has exactly one route" describe block:
`HEADER_KEYS` changed from `['date','details','category','account','notes','status','size']`
to `['date','details','category','account','notes','status','outflow','inflow']`
— matching Transactions.jsx's actual COLUMNS (outflow/inflow are now real
SortableHeader entries; the old AMOUNT/'size' header is gone). The reachable-
set test was renamed "leaves size and signed as the only sorts no header can
produce" and its assertions flipped: `reachable.has('size')` is now `false`
(not `true`), `reachable.has('outflow')`/`'inflow'` checks were removed
(they're header keys now, trivially reachable), and the final filter now
equals `['size', 'signed']` instead of `['signed', 'outflow', 'inflow']`.

## FIX 7 — Select popup consumes Escape

src/ui/primitives/Select.jsx: `BaseSelect.Popup` now has
`onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}` — same
contract as Popover.jsx. Base UI still closes the popup; propagation stops
before DrawerProvider's session Escape listener sees it.

## FIX 8 — Shift+N preserves an account scope

src/components/GlobalShortcuts.jsx's `addTx` binding now reads `useLocation()`.
Desktop path: on `/transactions/<id>`, opens seeded with
`{ payWith: 'acc:' + id }` and does not navigate; on `/transactions` exactly,
opens unseeded without navigating; otherwise navigates to `/transactions`
then opens unseeded (unchanged fallback). Phone path is unchanged (never
navigates, always opens unseeded).

## Verification summary

- `pnpm test`: 78 test files, **1079 tests passed** (was previously green
  before this wave; net new/renamed assertions across
  tests/tx-editor-state.test.js and tests/sort-rows.test.js).
- `pnpm build`: green (pre-existing >500kB chunk-size warning only, not an
  error).
- Live verification (a)/(b)/(c): all PASS, via a throwaway Vite harness at
  `.harness-tmp/` (deleted before commit) mounting the real `<App/>` with
  `src/lib/supabase.js` and `src/store/sync.js` stubbed via a Vite `resolveId`
  plugin (fake session + fixture store, no-op sync queue), driven with
  Playwright MCP against `pnpm exec vite --config .harness-tmp/vite.config.mjs`.
  `git status` confirmed clean of harness residue afterward.

One incidental, non-blocking observation from the live pass: `cellsFromForm`
always renders a transfer's amount under the OUTFLOW cell regardless of which
of the two amount cells was typed into, since direction is driven solely by
from/to, not by the outflow/inflow split — expected given FIX 2 and the
existing code comments, noted here only for awareness if a future scenario
expects the transfer amount to visually anchor on INFLOW instead.
