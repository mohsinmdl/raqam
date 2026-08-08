# Envelope budget, Phase 3 — inspector sidebar

**Date:** 2026-08-09 · **Status:** Approved design (pending spec review) · **Branch:** `worktree-budget-phase3` (off main, after #51)
**Visual reference:** live-captured from app.ynab.com on 2026-08-09 (no-selection / single-select / multi-select inspector states, structure + tokens below), plus the user's screenshots #94/#95 from the original brainstorm.

## Context

Phases 1–2 shipped the envelope model and the money-moving popovers. Phase 3 adds YNAB's right-hand **inspector**: a sidebar on the Plan screen that reacts to category-row selection — month summary when nothing is selected, a category card (Available breakdown, Auto-Assign shortcuts, Notes) for a single selection, and scoped totals + bulk Auto-Assign for multi-selection.

## Captured YNAB reference (live DOM, 2026-08-09)

**No selection** → cards: *August's Summary* (Left Over from Last Month · Assigned in August · Activity · **Available**), *Cost to Be Me* (targets), *Auto-Assign*, *Assigned in Future Months*, *For You* (content).

**Single category** (⚡️ Utilities) →
- `h1` category name + pencil (edit) button
- Card **Available Balance**: the Available pill big, then `Cash Left Over From Last Month 0.00 · Assigned This Month +25,000.00 · Cash Spending −24,100.00 · Credit Spending 0.00`
- Card **Target**: "Create Target" CTA
- Card **Auto-Assign**: 6 buttons, each `label … amount` — Assigned Last Month · Spent Last Month · Average Assigned · Average Spent · Reset Available Amount · Reset Assigned Amount
- **Notes**: "Enter a note..." click-to-edit paragraph

**Multi (2 selected)** →
- `h2` "2 Categories Selected" + muted line listing names ("⚡️ Utilities, 🛒 Groceries")
- Card **August's Summary** scoped to the selection (Left Over · Assigned in August · Activity · **Available**)
- Card **Auto-Assign**: 7 buttons — **Underfunded** first, then the same six with plural "Amounts"

**Tokens:** sidebar ~413px, bg `#F8F6F2`; cards are collapsible (`card-roll-up` header buttons); Auto-Assign buttons 32px tall, radius 8, bg `rgba(199,196,189,.2)`, 14px, label left / amount right (bold).

## Scope decisions

- **Targets are still out of scope** (Auto tab stays disabled) → no *Cost to Be Me*, no *Target* card, no *Create Target*. **Underfunded** is redefined without targets as "total needed to bring negative Availables back to zero" (cover-overspending semantics) — shown only in multi-select, like YNAB.
- **Cards are plain category activity** (Phase 1 decision) → the single-select breakdown shows one **Spending This Month** line (= activity), not YNAB's Cash/Credit split.
- **Notes bind to the existing `categories.description` field** — already synced (`sync.js` categories collection), no migration. The Categories screen's description field and the inspector Notes edit the same value.
- **No pencil/edit button in v1** (category rename lives on the Categories screen) — deferred.
- *For You* and *Assigned in Future Months* cards: dropped (content marketing / not meaningful until future-month assigning is a first-class flow; assignments to future months already work via the month switcher, and the summary card is the priority).

## 1. Selection model — `src/screens/Plan.jsx`

Screen-local state `selected: Set<categoryId>` (not persisted, not synced).

- New leading **checkbox column** in `ROW_COLS` (YNAB order: checkbox · category · assigned · activity · available). Header row gets a **check-all** checkbox (checked = all active cats selected, indeterminate = some).
- Group-row checkbox selects/deselects that group's active categories.
- Category-row checkbox toggles membership (multi-select).
- **Clicking the row background or name** (not the assigned editor, activity, available pill, or checkbox) selects that category alone — replacing the selection; clicking the selected row's background again clears it. Ctrl/Cmd-click toggles (same convention as the transactions table).
- `Escape` clears the selection (only when no popover is open — existing popover dismissal wins).
- Collapsing a group does not change the selection.

## 2. Layout

Plan becomes a two-column grid at wide widths: `maxWidth` 1180 → **1280**, `gridTemplateColumns: 'minmax(0, 1fr) 320px'`, gap 16, inspector in the right column, sticky (`position: sticky; top: 16px; align-self: start`). Below **1100px** the grid collapses to one column and the inspector renders after the table (source order: table first).

## 3. Inspector component — `src/ui/plan/Inspector.jsx` (new directory, starts the Plan split)

Module-scope components; props `{ S, env, month, money, applyData, selected, prevEnv, trailing }` (all derived data computed in Plan and passed down — the inspector renders, it does not fold).

Shared card shell: `background: var(--surface); border: 1px solid var(--border); borderRadius: 12` (the table's idiom, not YNAB's flat panel — Raqam theme wins over YNAB chrome). Card header = collapsible button (chevron ▸/▾, local `useState`), 13.5px/700. Auto-Assign row buttons: 32px, radius 8, `background: var(--elev)`, hover `var(--soft)`, label left 13px, amount right `tnum` 600.

### 3a. No selection — "<Month>'s Summary"

| Line | Source |
| --- | --- |
| Left Over from Last Month | Σ `carryIn` over active expense cats (from `env.rows`) |
| Assigned in <Month> | `env.assignedTotal` |
| Activity | Σ `activity` over active cats |
| **Available** | Σ `available` over active cats (bold, sign-colored) |

Plus the **Auto-Assign** card scoped to *all* active categories (same actions as multi-select, below).

### 3b. Single selection

- `h1`-style header: category name (15px/700).
- **Available Balance** card: the Available amount as a large pill (reuse the table pill's tone logic: green/red/beige), then three `tnum` lines that sum to it exactly: `Left Over from Last Month` (carryIn) · `Assigned This Month` (assigned, signed `+`) · `Spending This Month` (activity). The identity `carryIn + assigned + activity = available` holds by the envelope fold (clamp note: carryIn is already the clamped value used by the fold, so the lines always sum).
- **Auto-Assign** card, 6 rows (each shows the amount it would produce; disabled when it is 0 or a no-op):
  | Action | Amount shown | On click (one `applyData`) |
  | --- | --- | --- |
  | Assigned Last Month | assigned(cat, m−1) | set this month's assigned to it via `moveAssigned` delta from/to RTA |
  | Spent Last Month | −activity(cat, m−1), floored at 0 | same delta mechanics, target = spent figure |
  | Average Assigned | mean assigned over the previous 3 months | same |
  | Average Spent | mean of −activity over the previous 3 months, floored at 0 | same |
  | Reset Available Amount | current available | `moveAssigned(cat → rta, available)` when positive; when negative it is a cover-from-RTA (`rta → cat`) |
  | Reset Assigned Amount | current assigned | `moveAssigned(cat → rta, assigned)` (reverse direction when negative) |
  All six resolve to **`moveAssigned` deltas** (never raw `setAssigned`) so every click is one undo step and one audit `move` row, consistent with Phase 2.
- **Notes** card: muted "Enter a note..." paragraph; click swaps to a textarea (autofocus) bound to `category.description`; commit on blur or Cmd/Ctrl-Enter through the new `setCategoryNote` action; Escape cancels.

### 3c. Multi selection

- Header: "N Categories Selected" + one muted line of names (comma-joined, ellipsized).
- **Summary card** — same four lines as 3a but summed over the selection only.
- **Auto-Assign card** — **Underfunded** first: `Σ max(0, −available)` over the selection; click covers each overspent category from RTA (chained `moveAssigned` calls in ONE `applyData` → one undo step, one audit row per move). Then the six actions from 3b in plural, each applied per selected category with the same chaining. Buttons disabled at amount 0.

## 4. Math helpers — `src/lib/inspector.js` (new, pure, unit-tested)

```js
// trailingMonths(month, n) → ['2026-07', '2026-06', '2026-05'] for n=3
// assignedIn(S, catId, month) → Math.round from S.assignments
// activityIn(env) is read from an envelopeFor fold — the screen memoizes
//   envelopeFor for each trailing month (3 folds + prev, acceptable; the
//   prevRta perf item stays on the ledger)
// averages: mean over the previous 3 calendar months, rounded; months with
//   no data count as 0 (assumption — flagged for review)
// underfundedFor(env, catIds) → Σ max(0, −available)
// autoAssignPlan(env, prevEnvs, catIds, kind) → [{from, to, amount}] —
//   returns the moveAssigned arg list; the screen chains them in one applyData
```

`autoAssignPlan` is where every action's delta math lives (target − currentAssigned → signed delta → from/to orientation), so it is testable without the store.

## 5. Store action — `src/store/actions.js`

```js
// setCategoryNote(data, { id, note }) → categories map-replace, audit
// { entityType: 'category', action: 'update', summary: 'Updated note for <name>' }
```
No-op (same reference) when the note is unchanged. `description` flows through the existing categories sync mapping untouched.

## Out of scope (later phases)

Targets/Cost to Be Me/Create Target, *For You*, *Assigned in Future Months* card, pencil edit-in-inspector, drag-to-multi-select, Recent-Moves restyle (P4), filter pills & Manage Views (P4), activity hyperlink modal (P4).

## Verification

- **Unit:** `tests/inspector.test.js` — trailingMonths edges (year boundary), averages incl. empty months, underfunded sums, `autoAssignPlan` for all six kinds × (positive/negative/zero current), reset orientations; `setCategoryNote` no-op-by-reference + audit shape; full suite green; `npx vite build` clean.
- **Live (Playwright, real data):** no-selection summary lines equal the table's totals exactly; select Utilities → breakdown lines sum to the pill; check two categories → summary equals the sum of both rows; Auto-Assign "Assigned Last Month" applies and Cmd+Z reverts in one step; Underfunded covers a red pill and RTA drops by the same amount; notes edit round-trips through a reload (sync push + pull); selection clears on Escape; layout collapses to one column at 1000px without horizontal scroll.
