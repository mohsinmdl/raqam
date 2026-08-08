# Envelope budget, Phase 1 — foundation + plan table

**Date:** 2026-08-08 · **Status:** Approved design (pending spec review) · **Branch:** `worktree-budget-redesign` (off `main`)
**Design reference:** `2026-08-08-ynab-budget-reference.md` (captured tokens, category tree, behavioral inventory) — visual values live there, not here.

## Context

Raqam's Budgets screen is a flat list of standing monthly limits. The goal (decomposed into 4 phases) is a YNAB-faithful envelope model: money assigned per category per month, positive Available carrying forward, and **Ready to Assign (RTA)** = inflows − assigned. Phase 1 builds the data model, the envelope math, category groups + the YNAB category adoption, and the plan table that replaces the `/budget` index. Phases 2–4 (money-moving popovers + calculator; inspector sidebar; views/filters/activity) build on it. Targets are deferred indefinitely.

## Decisions locked in brainstorming

- **Full envelope model** replaces standing limits (old `budgets` data/collection untouched for now; only its UI is replaced — Dashboard keeps consuming it as a known transitional inconsistency).
- **RTA inflows = income transactions** (type `income`, not pending, occurred — `monthMetrics` rules). Refunds return to their category; transfers neutral; adjustments outside budget math.
- **Cards = category activity** directly (no card-payment envelopes in v1).
- **YNAB-faithful rollover:** positive Available carries; overspend resets to 0 and reduces next month's RTA.
- Income categories are ungrouped and never appear on the plan table.
- Category adoption + budget import are **explicit, idempotent, user-triggered** banner actions, not automatic migrations.

## 1. Server migration — `supabase/migrations/0011_envelope.sql`

- `category_groups`: `user_id uuid default auth.uid() references auth.users on delete cascade`, `id text`, `name text not null`, `sort_order int not null default 99`, `created_at`; PK `(user_id, id)`. RLS: the standard four own-row policies (copy the `0001_init.sql:202` block form).
- `categories`: `add column group_id text` + `foreign key (user_id, group_id) references category_groups (user_id, id) on delete set null`.
- `assignments`: `user_id`, `id text` (surrogate — avoids generalizing sync's snapshots-only composite-key branch), `category_id text not null`, `month text check (month ~ '^\d{4}-\d{2}$')`, `amount bigint not null default 0`, `created_at`; PK `(user_id, id)`; unique `(user_id, category_id, month)`; FK `(user_id, category_id) → categories on delete cascade`. RLS same four policies.
- `audit_log` CHECK constraint widened to include `'assignment'` and `'categoryGroup'` entity types (constraint currently at `0005_budgets_screen.sql:11`).
- Deploy note: the user applies this to their Supabase project (same flow as prior migrations) before the feature ships.

## 2. Store + sync

- `freshStore()` (`src/store/seed.js`) gains `categoryGroups: []` and `assignments: []`.
- `sync.js` COLLECTIONS: `categoryGroups` inserted **before** `categories` (categories now FK-reference groups), `assignments` after `categories`. Standard `toRow/fromRow` (snake_case mapping); both use default `conflictKey 'user_id,id'`. Extend `tests/sync-recurring.test.js`'s ordering assertion: categoryGroups before categories, assignments after categories.
- Category `toRow/fromRow` gains `group_id ↔ groupId`.

## 3. Envelope math — `src/lib/envelope.js` (new, pure)

One memoizable fold, computed for all months `earliest data month → viewed month` in a single pass (transactions bucketed by month once):

```
activity(cat, m)  = −Σ txBudgetImpact(t) for t in month m, t.category === cat        // reuses calc.js's rule
carryIn(cat, m)   = max(0, available(cat, m−1))                                       // overspend does not carry
available(cat, m) = carryIn(cat, m) + assigned(cat, m) + activity(cat, m)
income(m)         = Σ income tx (not pending, occurred) in m                          // monthMetrics rule
overspend(m)      = Σ over cats of max(0, −available(cat, m))
RTA(m)            = RTA(m−1) + income(m) − assignedTotal(m) − overspend(m−1)
```

Exported: `envelopeFor(store, month, now)` → `{ rows: Map<catId, {assigned, activity, available, carryIn}>, groupTotals, rta, income, assignedTotal }`. Also `assignedFor(store, catId, month)`. Future-month assignments do **not** reduce the viewed month's RTA in v1 (YNAB's "Assigned in Future" line — deferred; noted here deliberately).

## 4. Store actions — `src/store/actions.js`

- `setAssigned(data, { categoryId, month, amount })` — upsert/remove (amount 0 removes the row); audited (`entityType: 'assignment'`), one undo step.
- `addCategoryGroup(data, { name })`, `renameCategoryGroup(data, { id, name })`, `deleteCategoryGroup(data, { id })` (its categories fall back to ungrouped→"Other" at render), `setCategoryGroup(data, { categoryId, groupId })`.
- `adoptYnabTree(data)` — idempotent: creates the 4 groups (+ "Other") if missing; for each reference category, match existing by normalized name (strip emoji/punctuation, casefold) → rename to the YNAB display name + set `groupId`; else create it (expense type, icon `circle`, color cycling through the existing seed palette by index). Raqam-only expense categories → "Other". Income categories untouched. Running twice is a no-op.
- `importBudgetsAsAssignments(data, { month })` — for each standing category budget with amount > 0 and no existing assignment that month, create the assignment. Idempotent.

Reference tree (from the reference doc): Recoverable (advances) [Household advance, Roommate advance] · Bills [🏠 Rent/Mortgage, 📱 Phone & Internet, ⚡️ Utilities] · Needs [Cleaning & maintenance, 🤲 Charity & Zakat, 👪 Family support, 🎓 Education, ⛽️ Fuel, 🛒 Groceries, 🚘 Transportation, 🩺 Medical expenses, 😌 Emergency fund] · Wants [Pet care, Food Delivery, 🛍️ Shopping, 🍽️ Dining out, 🍿 Entertainment, 🏝️ Vacation, ❗️ Stuff I forgot to plan for, 🌳 YNAB subscription].

## 5. Plan table — `src/screens/Plan.jsx` (new; becomes the `/budget` index, replacing Budgets.jsx there)

Per the captured tokens (fonts/sizes/colors in the reference doc):

- **Top bar:** month stepper (existing `MonthContext` + header slot), **RTA banner** (amount + "Ready to Assign"; green positive / beige zero / red negative i.e. over-assigned) — display only in P1 — and the progress⟷compact **view toggle** (segmented, persisted `prefs.planView`).
- **Toolbar:** ＋ **Category Group** → caret popover (name input, Cancel/OK — BulkBar MoreMenu popover pattern).
- **Table:** header CATEGORY / ASSIGNED / ACTIVITY / AVAILABLE. Group rows: chevron collapse (device state), checkbox, name 16/600, hover **＋** (add category into group popover: name input), per-group totals. Category rows: checkbox, name, progress bar under the name in progress view ("Spent X of Y" microcopy; fill = spend vs carryIn+assigned, red overflow segment when overspent), ASSIGNED **click-to-edit** (plain number input; commit on Enter/blur, Esc cancels → `setAssigned`), ACTIVITY plain signed number, AVAILABLE pill (green >0 / beige 0 / red <0). Row/checkbox selection state lives now (drives the Phase-3 inspector; no inspector yet).
- **Adoption banner** (until both are done, dismissible): "Organize categories into groups (YNAB set)" → `adoptYnabTree`; "Import budgets as this month's assignments" → `importBudgetsAsAssignments`.
- BudgetHub tabs unchanged (`/budget` index now renders Plan; Categories/Recurring tabs untouched). `Budgets.jsx` stays in-tree for Dashboard's sake but is no longer routed.

## Out of scope (later phases)

Assign popover + RTA breakdown + calculator ops + move/cover popovers (P2) · inspector sidebar (P3) · filter pills/Manage Views/activity popover/Recent-Moves restyle (P4) · targets, card-payment envelopes, future-assignment RTA line (deferred).

## Verification

- **Unit (vitest):** `envelope.js` — carryover chains (positive carries, overspend resets to 0), RTA recursion incl. overspend reducing next month, income rules, group totals; `adoptYnabTree` — renames by normalized match, creates missing, "Other" fallback, income untouched, **idempotent**; `importBudgetsAsAssignments` idempotent; `setAssigned` upsert/remove/audit; group CRUD; sync ordering + row mapping for both new collections. Full suite green; build clean.
- **Playwright (5207, real data):** adoption banner runs end-to-end on the live store; table matches the YNAB reference side-by-side (same tab available for comparison); assigning updates RTA and Available instantly; collapse, view toggle, group/category creation popovers work; month stepping shows carryover.
