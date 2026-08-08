# Envelope budget, Phase 4 — filter views, activity drill-down, recent moves

**Date:** 2026-08-09 · **Status:** Approved design (pending spec review) · **Branch:** `worktree-budget-phase4` (off main, after #52)
**Visual reference:** live-captured from app.ynab.com on 2026-08-09 — filter pill bar, Views menu, Manage Views modal, New Custom View modal, Activity modal, Recent Moves panel (structures + tokens below). Plus the user's original screenshots #86, #87, #96, #97.

## Context

Phases 1–3 shipped the envelope model, the money-moving popovers, and the inspector sidebar. Phase 4 is the last envelope phase: the filter/view bar above the table, the Activity drill-down, and the global Recent Moves panel.

## Captured YNAB reference (live DOM, 2026-08-09)

**Filter pill bar** — a `<ul>` of pills, 25px tall, radius 5, 12px/500, padding `3px 12px`. Selected: tinted fill + 1.5px solid accent border. The Overspent pill carries a **red tint even when unselected** and a **count prefix** ("1 Overspent"). Trailing pill = Views Menu (⋯), opening a menu with **Manage Views** / **New View**.

**Filter semantics, verified by clicking each pill against known data:**
| Pill | Rows shown | Verified |
| --- | --- | --- |
| All | all 22 active categories | ✔ |
| Overspent | available < 0 | 1 row (Phone & Internet, −6,000) |
| Underfunded | needs money for target **or** overspending | same 1 row — identical to Overspent with no targets |
| Overfunded | assigned beyond target | 0 rows (needs targets) |
| Money Available | available > 0 | 13 rows |
| Snoozed | snoozed categories | 0 rows (YNAB-only feature) |

**Custom View** = a **named, hand-picked set of categories** — not a rule. The New Custom View modal is: "Choose a set of categories to include in this custom view", a **View Name** field (placeholder "Keep 'em short & sweet!"), then every active category as a checkbox under its group heading.

**Manage Views modal** — title "Manage Views", one draggable row per custom view (drag handle titled "Reorder View"), then **New View** and **Done** buttons. Built-in pills are not listed — only custom views are reorderable.

**Activity modal** — header "Activity", subheader = the category name, table `Account · Date · Payee · Memo · Amount`, single **Close** button. Read-only.

**Recent Moves panel** — `h2` "Recent Moves", a segmented control **All / Moved / Assigned**, then rows grouped by date with both an absolute date ("08 Aug 2026") and a relative label ("Yesterday", "3 days ago"). Row text: "〈Person〉 assigned **300,000.00** to 〈category chip: name + "Aug 2026"〉" or "〈Person〉 moved **2,700.00** from 〈chip〉 to 〈chip〉", each with an avatar initial.

## Scope decisions

- **Ship three built-in pills: All · Overspent · Money Available.** Underfunded and Overfunded are target-dependent — verified live that without targets "Underfunded" returns exactly the same rows as "Overspent", so shipping it would be a duplicate pill that lies about its meaning. Snoozed has no Raqam equivalent. All three are deferred to a future targets phase.
- **Custom views persist in device-local prefs, NOT a synced table** — `prefs` is already the device-local store (`raqam.prefs.u.<uid>`), and adding a synced collection would mean a migration the user must apply before the feature works at all. The stored shape deliberately mirrors what a future `budget_views` table would hold (`{ id, name, categoryIds[], sortOrder }`) so promoting it to sync later is a store/sync change with no UI rewrite. Flagged as an explicit tradeoff: views won't follow the user across devices yet.
- **Overspent pill shows a count and a red tint when non-zero**, matching YNAB; Money Available shows no count (YNAB doesn't).
- **Filtering hides category rows but keeps their groups** when at least one child matches; a group with no matching child is hidden entirely. Group totals continue to show the **true group totals**, not filtered subtotals — the numbers must never change meaning based on a view. An empty result renders an explicit empty state, never a blank table.
- **The filter never changes what any action does.** Selection, Auto-Assign, and the inspector all continue to operate on what is actually selected; selecting rows, then switching filters, does not silently widen or narrow a pending action. Selection is pruned to still-visible categories when the filter changes (a hidden selected row would let a user act on rows they cannot see).
- **Activity modal is read-only** and lists the category's transactions for the displayed month only. No inline editing (that lives on the Transactions screen).
- **Recent Moves is global and read-only**, built from the existing audit log — the per-category clock popover from Phase 2 stays as-is. Undo/redo remain Cmd+Z/Cmd+Shift+Z; the panel does not add its own undo buttons.

## 1. Pure module — `src/lib/planViews.js` (new, unit-tested)

```js
// BUILTIN_VIEWS: frozen [{ id: 'all'|'overspent'|'available', label, match(row)|null }]
// countFor(id, env, catIds) -> number         // pills' badge (0 = no badge)
// filterCategories(view, cats, env) -> cats'  // built-in predicate or custom id set
// visibleSections(sections, view, env) -> sections'  // drops empty groups, keeps totals
// normalizeViews(raw) -> views[]              // repairs prefs: drops unknown cat ids,
//                                             // de-dupes, sorts by sortOrder, caps name length
// reorderViews(views, fromId, toId) -> views' // pure drag-drop reorder, resequences sortOrder
```
`normalizeViews` is the trust boundary for prefs — localStorage is user-editable and survives category deletion, so every read repairs the data rather than assuming it.

## 2. Recent-moves parsing — `src/lib/moves.js` (new, unit-tested)

Extracted and generalized from Phase 2's per-category `MovesPopover` (which currently parses the audit log inline):
```js
// recentMoves(S, { days = 34, kind = 'all' | 'moved' | 'assigned' }) ->
//   [{ dateKey, dateLabel, relLabel, rows: [{ id, at, who, verb, amount, from, to, month }] }]
```
Groups by calendar day, newest first; `relLabel` is "Today" / "Yesterday" / "N days ago". `from`/`to` resolve `'rta'` to "Ready to Assign" and category ids to names (falling back to a muted "(deleted category)" rather than a blank chip). The 34-day window matches YNAB's tooltip ("Previous 34 days of assigning and moving money").

## 3. UI — new components under `src/ui/plan/`

- **`FilterPills.jsx`** — the pill row: built-ins, then custom views in `sortOrder`, then the ⋯ Views menu (Manage Views / New View). Pills are real buttons with `aria-pressed`; the bar is a `role="tablist"`-free plain list (they filter content, they aren't tabs). Tokens: 25px, radius 5, 12px/500, `3px 12px`; selected = `var(--soft)` fill + 1.5px `var(--accent)` border; Overspent non-zero = `var(--neg-soft)` fill + `var(--neg)` text.
- **`ViewEditorModal.jsx`** — create/edit a custom view: name field (placeholder "Keep 'em short & sweet!", max 40 chars, required) + grouped category checkboxes with a "select all in group" affordance. Save disabled until a name and ≥1 category exist.
- **`ManageViewsModal.jsx`** — list of custom views with **keyboard-accessible reordering**: a drag handle for pointer users (HTML5 drag-and-drop, no library) **plus** ↑/↓ buttons, because drag-only reordering is unusable by keyboard and touch. Rename and delete per row (delete behind a confirm naming the view). Buttons: New View · Done.
- **`ActivityModal.jsx`** — "Activity" + category name; table Account · Date · Payee · Memo · Amount for that category in the displayed month, sorted newest first; totals row equal to the row's ACTIVITY figure; Close. Empty state when the category has no transactions that month.
- **`RecentMovesModal.jsx`** — "Recent Moves", segmented All / Moved / Assigned, date-grouped rows with avatar initial and category chips carrying the month, matching the captured copy ("〈who〉 assigned 〈amt〉 to 〈chip〉").

## 4. Screen wiring — `src/screens/Plan.jsx`

- `prefs.planViews` (array) and `prefs.planViewId` (active pill, default `'all'`) via the existing `setPrefs`.
- Pill bar renders above the table; `sections` are passed through `visibleSections` before rendering.
- The ACTIVITY cell becomes a button opening `ActivityModal` (it already carries `data-noselect`, so row-selection is unaffected).
- A **Recent Moves** button next to the existing view toggle opens `RecentMovesModal`.
- When the active view changes, prune `selected` to the still-visible categories.

## Out of scope (future phases)

Targets (and with them Underfunded/Overfunded), snoozing, category drag-and-drop reordering in the table itself, cross-device sync of custom views, editing transactions from the Activity modal, undo buttons inside Recent Moves.

## Verification

- **Unit:** `planViews.js` — each built-in predicate at boundary values (available exactly 0 belongs to neither Overspent nor Money Available), custom-view filtering, `visibleSections` dropping empty groups while preserving group totals, `normalizeViews` repairing deleted category ids / duplicates / missing sortOrder / over-long names, `reorderViews` for first↔last and no-op moves. `moves.js` — day grouping across a month boundary, relative labels, kind filtering, `'rta'` and deleted-category name resolution, the 34-day cutoff.
- **Live (Playwright, real data):** each pill's row set matches the predicate computed from the table's own numbers; the Overspent badge equals the number of red pills; group totals stay identical between All and a filter; creating a view, reordering it (both drag and ↑/↓), renaming and deleting it all persist across a reload; selecting rows then switching views leaves no hidden row selected; the Activity modal's rows sum to the row's ACTIVITY figure; Recent Moves matches the audit log and its All/Moved/Assigned counts partition correctly.
