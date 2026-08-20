# Wave P2 — information + chrome polish (register craft campaign)

Branch `worktree-register-craft`. One commit:
`Register information polish: running balance, one naming, drawn chevrons, honest copy`

Skipped as already done: `.picker-scroll overflow` (Wave P1 moved it to `.rq-scroll`).

---

## 1. Running balance column

### The seam

`withRunningBalances(rows, openingBalance, sortDir, money)` — **src/lib/txRow.js**,
directly beneath `txGroups` (it consumes txGroups' output, and both deal in
presenter rows; `sortRows.js` is about ordering and had nothing to add).

The one thing a presenter row lacked was its own signed effect on the scoped
account. `amtValue` is a *display* figure built from the all-accounts
perspective, and outflow/inflow drop the sign, so neither can be summed.
`txGroups` already receives `accountId`, so it now threads

```js
acctDelta: accountId ? accountDelta(t, accountId, now) : null
```

onto each posted row. That was the cleanest pure seam: the running balance is
then computed from **the same `accountDelta()` the balance strip sums**, not
from a second reading of the row — which is the only reason the two can be
proved equal. Null off an account-scoped register, where a running balance has
no meaning.

The helper itself walks chronologically whatever the render order: under
date-DESC it reverses, accumulates, reverses back, so the TOP row carries the
latest balance. Rows are copied, never mutated.

### Reconciliation with the header strip — EXACT, and tested as such

`accountBalance(acc, store, month, now)` = `openingOf(acc, snapshots, month)` +
Σ `accountDelta(t, acc.id, now)` over `inMonth(t, month)`. Mirrored exactly:

| accountBalance | the column |
| --- | --- |
| seeds from that month's opening snapshot | `openingOf(acct, S.snapshots, balanceMonth)` |
| `accountDelta` returns 0 for `status: 'pending'` | an uncleared row steps 0 — it **repeats** the balance above it |
| `accountDelta` returns 0 for a future-dated row | future rows are in the SCHEDULED band and never enter the walk |
| sums the whole month | the column only appears when the range **is** that month |

`src/lib/txRow.balance.test.js` asserts the last value equals
`accountBalance()` itself (not a number copied out of it) in both directions —
12 tests, over a fixture with an uncleared row, a signed adjustment, a refund
and a future-dated row.

### Four gates, all of them about truth before width

`balanceEligible` (Transactions.jsx) requires **all** of:

1. account-scoped (`/transactions/:accountId`) — a balance needs an account to
   be the balance *of*;
2. `sort.key === 'date'`, either direction — the column IS the date order;
3. `range.from === range.to === balanceMonth` — the opening snapshot that
   seeds the walk is a per-month figure, so "Latest 3 Months" or "All Dates"
   has no opening balance to start from, and a future month reads the clamped
   `balanceMonth` while the range shows the future one;
4. nothing filtering rows out (`!F.q && listFilter === 'all'`) — a cumulative
   that skips the rows a search hid is not a balance, it is a subtotal wearing
   one's clothes.

Width is decided separately, in the pure helper: `BALANCE_MIN_WIDTH = 1100`,
the highest of the three fold thresholds, so BALANCE folds before MEMO (1000)
and ACCOUNT (900). `visibleColumns(columns, containerWidth, accountScoped,
balanceEligible)` gained the fourth argument; 7 new tests in
`registerColumns.test.js`.

**No discrepancy to report** — the two reconcile exactly, so the sub-item
shipped rather than stopping.

### Presentation

`{ key: 'balance', label: 'BALANCE', width: 120, align: 'right' }`, placed
after INFLOW so it closes the money run; STATUS stays the trailing badge
column. Muted and one step down in size (13.5px, `var(--muted)`, `.tnum`) so it
never competes with OUTFLOW/INFLOW. Formatted through `fmt.money`, so the
app-wide "Hide amounts" toggle masks it like every other row figure.

**Not sortable.** Its whole meaning is "the balance after this row in date
order", which any other sort destroys — a clickable header that then produced a
column of meaningless running totals is worse than no affordance. New
`PlainHeader` (plain text, no button, no `aria-sort`), selected via
`isSortable(c.key)` at the call site; its box matches SortableHeader's 32px
button so the header row height is unchanged.

Two alignment consequences, both handled: scheduled rows render an **empty**
balance cell (nothing has moved yet — a figure there would claim otherwise),
and `TxEditorRow` gained a `showBalance` spacer `<td>` — without it every cell
after BALANCE would have shifted one column left of its header.

---

## 2. Sort model note

The toolbar's accent text button is the only door to the hidden `signed` sort
(rank by effect on the balance — it has no header of its own). **The label
already named the current state with the arrow** (`sortLabel(sort) + ↑/↓`), so
behaviour and label are untouched. Added only the `title`, because a label that
reads as a *state* gives no hint that it is also a *switch*:

- at rest: `Click to sort by effect on your balance — biggest expense first.`
- while active: `Sorted by effect on your balance. Click to go back to newest first.`

---

## 3. Naming / copy

| was | now | where |
| --- | --- | --- |
| `DETAILS` header | `PAYEE` | COLUMNS entry label |
| `Details A–Z` / `Details Z–A` | `Payee A–Z` / `Payee Z–A` | `sortLabel()` |
| `payee` | `Payee` | PayeeCell placeholder |
| `category` | `Category` | CategoryCell + SplitRows |
| `memo` / `outflow` / `inflow` | `Memo` / `Outflow` / `Inflow` | TxEditorRow |
| `account` | `Account` | AccountCell `renderValue` fallback |
| `Choose a category` | `Category` | PlanCategoryPicker default (aria-label follows) |
| `…or widen the date range in the header.` | `…or step to another month with the arrows in the header.` | empty state |
| `Reset filters` | `Reset view` | empty state (it resets search + sort + range) |

**One deliberate extension beyond "COLUMNS entry label only":** `sortLabel()`'s
`details` strings. The sort **key** is untouched (`details` is still the key in
SORT_COLUMNS, view state and the header's altKeys) — only what we *call* it
changed. The toolbar prints that label immediately beside the header it names,
so clicking PAYEE and reading "Details A–Z ↑" beside it was the exact
inconsistency this wave is called "one naming" for. Nothing else in `src/`
prints "Details".

DateCell's placeholder was already the typed-date form (`dd/mm/yyyy`) — left
alone.

---

## 4. Drawn chevrons

One shared component: `Chevron({ size, dir, title })` exported from
**src/ui/icons.jsx** (where the WideIcon/EyeIcon-family inline SVGs live).
1.8px stroke, `currentColor`, `dir` rotates rather than swapping paths
(`down` / `right` / `up` / `left`) so a disclosure has something continuous to
animate. Lifted from DateCell's local one, which was already the right shape.

Replaced the text glyphs at:

- `GroupHead` (Transactions.jsx) — `▾`/`▸` were two *different* glyphs at two
  different optical weights, so the band appeared to change more than its own
  open/closed state when toggled; now one shape rotating;
- `Select` trigger (src/ui/primitives/Select.jsx) — `▾`;
- `DateCell` calendar button — now imports the shared one instead of its local copy;
- `PlanCategoryPicker` adornment — `▾` (this is the register's CATEGORY cell);
- `TxForm` "Show more" — `⌄` plus its hand-rolled `rotate(180deg)`, now `dir="up"`;
- **PayeeCell** had *no* adornment at all. Added one — the cell looked like
  plain free text, which left the To/From transfer list (the only way to make a
  row a transfer) undiscoverable. Pointer-transparent, so the whole field stays
  one click target.

Out of scope, left as text: the calendar's `‹`/`›` month arrows (navigation,
not disclosure) and the ▾/▼/⌄ in Plan, Reflect, Accounts-phone and TxSheet.

---

## 5. Editor vs "No matches"

`list.length === 0 && monthTx.length > 0 && !inlineTx`. While an inline editor
session is open the row being typed IS the subject of the screen; announcing a
dead end under it names a state the user is not in. The `inlineTx` test (not
`inlineTx && !editingId`) matches the table's own render gate.

---

## 6. Chrome

- Sidebar `ACCOUNTS` label 10.5px → **11px**. Note: it lives in
  **src/components/AccountList.jsx:58**, not Sidebar.jsx (Sidebar renders
  `<AccountList/>`).
- `SearchField`: `transition: 'width .18s ease, border-color .15s ease'` →
  `transition: 'border-color .15s ease'`. The expand interaction does depend on
  the width change, so the width still changes — it just arrives in one frame
  instead of animating layout for 180ms (which relaid the whole toolbar row
  every frame, and at wrap widths could reflow it mid-tween). The accent border
  carries the "you're in here now".

### Scheduled rows' STATUS region — verified, NOT fixed

**What I found:** the region is empty on *every* scheduled variant, not just
rules. `Row()` gates the badge on `!scheduled`, i.e. on the row's **position**,
not its data — so a future-dated transaction (`stGlyph: 'S'`), a scheduled rule
(`'S'`) and an **overdue** rule (`'!'`, `--neg`, with a `stTitle`) all render
nothing, and the presenter's badge fields go unread on desktop.

**Why I left it:** it is deliberate and *consistent*. `TxPhoneList.jsx:66`
gates on the identical `!scheduled` with the identical documented rationale
(the warm band + SCHEDULED heading already say what these rows are). Changing
one surface would split the two; changing both is a design decision, not
information polish, and the campaign said "fix only if real".

**The one arguable gap, flagged not fixed:** an overdue rule's only row-level
cue is its red date; its `stTitle` ("This was due and has not been recorded
yet.") is unreachable on desktop. The GroupHead note already carries the count
("N overdue"), so nothing is *hidden* — but if a later wave wants the badge
back, overdue is the case that earns it.

---

## Verification

- `pnpm test` — 87 files, 1219 tests, all passing (19 new: 12 balance, 7 column).
- `pnpm build` — clean.
- Live-checked in a throwaway Vite harness at 1440×900 (auth + `store/sync.js`
  stubbed via an `enforce: 'pre'` `resolveId` plugin; 2 accounts, snapshots
  seeded EMPTY so `rolloverMonth()` derives this month's opening from last
  month's closing exactly as it does for a real user; 16 transactions on the
  scoped account including an uncleared row, a transfer, a signed adjustment, a
  refund and a future-dated row). Driven with Playwright by a subagent.

**14/14 PASS, 0 console errors** (2 benign React Router v7 future-flag warnings):

1. All Accounts register: no BALANCE header; headers read **PAYEE**, not DETAILS.
2. Account-scoped: BALANCE present, sitting between INFLOW and STATUS.
3. **The reconciliation, live:** first recorded row's BALANCE `Rs 329,360` ===
   the strip's Cleared Balance, **exact string equality**. The uncleared row
   leaves the balance flat, and Uncleared −3,200 / Working 326,160 reconcile
   against it. (Both mask toggles unmasked before comparing.)
4. Scheduled rows: BALANCE cell empty.
5. Date-asc: the LAST recorded row's balance === the strip; toggling back to
   desc restores the top-row match.
6. Sorting by OUTFLOW hides BALANCE; clicking DATE brings it back.
7. Toolbar sort text button: label and title correct in both states; BALANCE
   withdraws under the `signed` sort.
8. Typing a search hides BALANCE; clearing it restores.
9. Container 1204px → present; 649px → BALANCE and MEMO both drop; restores.
10. Masked: BALANCE renders `Rs •••,•••`.
11. **Zero ▾ ▸ ⌄ ▼ text glyphs anywhere in the document** (TreeWalker sweep,
    editor open and closed). Drawn SVGs confirmed on GroupHead, DateCell,
    PayeeCell, CategoryCell and AccountCell.
12. Editor open + a no-match search: "No matches for your search" absent.
    Closed: present, with `step to another month with the arrows in the header`
    and a `Reset view` button.
13. Placeholders: `dd/mm/yyyy`, `Payee`, `Category`, `Memo`, `Outflow`,
    `Inflow`; account trigger reads `Account`.
14. Console clean.

### Non-blocking observations from the live check

- The toolbar amounts toggle carries no `aria-label` — **checked, not a
  defect**: `ToolbarAction` renders a real `<button>` with a visible
  `<span>{label}</span>` ("Hide amounts" / "Show amounts", which already flips
  to name the next action) plus the keycap Tooltip via `shortcut`. An
  `aria-label` would only duplicate the visible name.
- The strip's eye (`maskedPosition`) and the toolbar's eye (`masked`) are two
  independent toggles. Pre-existing, app-wide convention: position figures mask
  separately from row figures, and BALANCE follows `masked` because it is a row
  figure. Left alone.
- The `⌗` calculator button in AmountCell is still a text glyph. Not a chevron,
  out of this wave's list; its aria-label is correct.
- `Biggest expense first ↑` — the arrow reports the raw sort direction while the
  label names what you are looking for, so they can read as disagreeing. That
  is the pre-existing `signed` label contract (documented in sortRows.js), not
  something P2 introduced; left for a wave that wants to revisit the arrow.
- The sidebar's ACCOUNTS disclosure already draws its chevron as SVG, but at
  `strokeWidth: 3` rather than the shared component's 1.8. Not in this wave's
  named list; worth folding into `Chevron` next time that file is touched.

### Bug found and fixed while wiring the column

`SplitRows` hard-coded its picker span as `colSpan - 4`, with the last three
`<td>`s meaning outflow / inflow / status. Adding BALANCE grew `colSpan`, so
the picker silently absorbed OUTFLOW and every field after it slid one column
right of its header — the split amount would have sat under INFLOW. The tail is
now counted from `showBalance` (`colSpan - (showBalance ? 5 : 4)` plus a balance
spacer `<td>`). `TxEditorRow` needed the same spacer for the editor row itself.
This kind of miscount fails silently, which is why the comment now says so.

Harness deleted before committing.
