# Category Targets (Monthly) — design

**Date:** 2026-08-09 · **Status:** Approved design (pending spec review) · **Branch:** `worktree-targets` (off main, after the 4-phase envelope port)
**Visual reference:** captured live from app.ynab.com on 2026-08-09 — the inspector **Target** card, its Weekly/Monthly/Yearly/Custom cadence tabs, the "I need / By / Next month I want to" fields, and the Set-aside-another vs Refill-up-to mode copy. Plus the user's screenshot (Image #118) of the Monthly target editor.

## Context

The 4-phase envelope port (PRs #50–#53) deferred **targets** at every step. Three things wait on them:
- the **Underfunded** and **Overfunded** filter pills (Phase 4 shipped only 3 of YNAB's 6 pills — verified live that without targets "Underfunded" is a duplicate of "Overspent"),
- the Auto-Assign **"Underfunded"** action (currently only covers overspending, `src/lib/inspector.js`),
- the inspector **Target** card (never built; Phase 3 left "Create Target" out of scope).

Today the Plan progress bars fake a goal: each row computes `target = carryIn + assigned`, `spend = max(0, −activity)` and renders "Spent X of Y" where Y is just *assigned money*, not a real target (`src/screens/Plan.jsx`).

A **legacy `budgets` model** predates envelopes — one standing monthly amount per category plus a `rollover` boolean. Its screen (`src/screens/Budgets.jsx`) is orphaned dead code, `/budgets` redirects to `/budget`, and it survives only as data feeding the Plan's one-time "import standing budgets as assignments" banner. A YNAB Monthly target is its natural successor: `amount` = "I need", `rollover:true` ≈ Refill-up-to, `rollover:false` ≈ Set-aside-another.

## Scope (v1)

**Monthly targets only, both modes** (Set-aside-another and Refill-up-to). Weekly / Yearly / Custom cadences and by-date savings math are out of scope; the editor renders their tabs disabled so the shell is future-ready, matching how Phase 2 renders the Auto-Assign "⚡ Auto" tab disabled.

## Decisions locked in brainstorming

- **v1 = Monthly, both modes.** Unlocks the two filter pills, Cost-to-Be-Me, and honest progress bars; imports cleanly from legacy budgets.
- **Target lives inline in the inspector's Target card** (single-category selection), between Available Balance and Auto-Assign — YNAB-faithful and literally "managed on this page itself." No separate modal.
- **The "Excluded from budgets" toggle is added to this same card** (expense-only), writing the existing `categories.excludeFromBudget` field. Turning exclusion **on clears any target** (mirrors how it already auto-clears a legacy budget).
- **Data model = columns on `categories`** (one target per category), same additive pattern as `exclude_from_budget` (0006). No new table.
- **Due-day is stored and displayed but does not change the monthly math in v1** — it is reserved for a later on-track/pacing indicator. Called out so it is not mistaken for a gap.
- **Excluded categories carry no target** and are dropped from Cost-to-Be-Me, Underfunded, and Overfunded — you have declared you don't budget them. Their envelope activity still shows on the Plan table (unchanged; the fold uses `includeExcluded: true`).

## 1. Server migration — `supabase/migrations/0013_targets.sql`

Additive, nullable columns on `public.categories` (mirrors `0006_exclude_from_budget.sql`):

```sql
alter table public.categories add column if not exists target_amount  bigint;
alter table public.categories add column if not exists target_mode    text
  check (target_mode is null or target_mode in ('setaside','refill'));
alter table public.categories add column if not exists target_due_day smallint
  check (target_due_day is null or (target_due_day between 1 and 28));
```

- `target_amount` NULL ⇒ no target. When set, it is a non-negative integer (PKR).
- `target_mode` is NULL exactly when `target_amount` is NULL (enforced client-side; a partial row is never written).
- `target_due_day` NULL ⇒ "Last Day of Month"; 1–28 ⇒ that day. Capped at 28 to avoid month-length ambiguity.
- **Deploy note:** the user applies this to their Supabase project (same flow as prior migrations) before the feature ships. No audit-CHECK change (target edits audit as `entityType:'category', action:'update'`, already permitted).

## 2. Sync mapping — `src/store/sync.js`

Extend the `categories` collection `toRow`/`fromRow` (currently ~lines 52–72):
- `toRow`: `target_amount: r.targetAmount ?? null, target_mode: r.targetMode ?? null, target_due_day: r.targetDueDay ?? null`
- `fromRow` (via the existing `stripNulls`): `targetAmount: r.target_amount ?? undefined, targetMode: r.target_mode || undefined, targetDueDay: (r.target_due_day ?? undefined)`

No differ changes — new columns ride the existing categories diff. Keep the always-defined-boolean phantom-diff discipline: absent target fields serialize as explicit `null`.

## 3. Pure math — `src/lib/targets.js` (new, unit-tested)

Reads the envelope fold row shape from `src/lib/envelope.js`: `env.rows.get(catId)` → `{ assigned, activity, available, carryIn }`.

```js
// hasTarget(cat) -> boolean            // targetAmount is a positive number
// targetNeeded(row, cat) -> number     // this month's shortfall (>= 0)
//   refill:   max(0, targetAmount - available)   // leftover reduces the need
//   setaside: max(0, targetAmount - assigned)    // carryover ignored; another amount each month
// isOverTarget(row, cat) -> boolean
//   refill:   available > targetAmount
//   setaside: assigned  > targetAmount
// costToBeMe(env, cats) -> number       // sum of targetAmount over active, non-excluded, targeted cats
// targetSummary(cat, money) -> string   // "Refill up to Rs 25,000 monthly" / "Set aside Rs 5,000 monthly"
```

- `hasTarget` is false for any category with `excludeFromBudget` true (an excluded category never has a live target — the store also clears it, but the read guard makes the invariant total).
- `available` here is the fold's already-clamped value (`max(0, carryIn) + assigned + activity`), so the refill math uses the same number the AVAILABLE column shows.
- All amounts are integer PKR; results are `Math.round`ed defensively though inputs are already integral.

## 4. Store actions — `src/store/actions.js`

```js
// setTarget(data, { id, amount, mode, dueDay }) -> data'
//   - no-ops (same ref) when the category is missing, excluded, or nothing changed
//   - amount rounded, floored at 0; a 0 amount is treated as clearTarget
//   - writes targetAmount/targetMode/targetDueDay together (never a partial target)
//   - audit: entityType 'category', action 'update', summary 'Set <mode> target for <name>'
// clearTarget(data, { id }) -> data'
//   - no-ops when the category has no target
//   - nulls all three fields; audit summary 'Removed target for <name>'
```

- Both go through `stampUpdate` like every other category mutation, and add the new fields to `CAT_AUDIT_FIELDS` so before/after diffs capture them.
- **`setCategoryExcluded(data, { id, excluded })`** (new, small): flips `excludeFromBudget`; when enabling, clears any legacy budget **and** nulls the three target fields in one reducer/audit step. `upsertCategory`'s existing exclude→clear-budget logic is factored into this helper and extended to also clear the target, so the CategoryForm drawer (via `upsertCategory`) and the inspector Target card (calling `setCategoryExcluded` directly) share one code path and can never diverge.

## 5. Inspector Target card — `src/ui/plan/Inspector.jsx`

New module-scope `TargetCard`, rendered in the single-category branch **between `AvailableCard` and the Auto-Assign card**. Props `{ cat, row, money, applyData }`.

**Three visual states:**
- **No target** (and not excluded): a "Create Target" CTA button → opens the editor.
- **Editing:** the Monthly editor (below).
- **Has target (read):** `targetSummary(...)` as a one-line label + a thin progress line (funded vs target; the shortfall in `var(--neg)` when `targetNeeded > 0`, "Funded" in `var(--pos)` at 0) + a click target to re-open the editor.

**Editor (matches the captured YNAB layout):**
- **Cadence tabs** Weekly / **Monthly** / Yearly / Custom — only Monthly enabled; the others disabled with `title="Coming later"` (same idiom as the disabled Auto tab, `src/screens/Plan.jsx`).
- **"I need"** — an amount input reusing the `applyCalcExpr` calculator idiom from the assign field (typed `+n −n ×n ÷n` and the op glyph), prefilled from the current target.
- **"Next month I want to"** — a mode selector with YNAB's copy:
  - `Set aside another <amt>` — helper: "Use for: bills, subscriptions, saving over time" (default; "Most people choose this")
  - `Refill up to <amt>` — helper: "Use for: gasoline, fun money, dining out. Whatever you don't spend applies toward next month."
- **"By"** — a due-day selector: "Last Day of Month" (default) or a specific day 1–28.
- Footer: **Save Target** (disabled until amount > 0 and a mode is chosen) · **Cancel** · **Delete** (only when a target exists).

**Exclude toggle:** below the target editor (or in the read state), the expense-only **"Exclude from budgets"** switch — the same control and copy as `src/drawers/CategoryForm.jsx:96-114`. It calls a small dedicated store action `setCategoryExcluded(data, { id, excluded })` that flips `excludeFromBudget` and, when enabling, clears any legacy budget **and** target in one reducer/audit step — the same exclude→clear logic `upsertCategory` already performs, factored so both the CategoryForm drawer and this card share it (CategoryForm continues to go through `upsertCategory`, which delegates to the shared helper). When excluded, the Target editor is replaced by a muted "Excluded from budgets — no target" note (an excluded category can't hold a target).

Escape-cancel of the editor uses the same `cancelledRef` teardown-blur guard as `NotesCard`.

## 6. Progress bars — `src/screens/Plan.jsx`

In the progress (non-compact) view, a category **with a target** shows funded-vs-target:
- `goal = targetAmount`; `funded = mode === 'refill' ? available : assigned`; `pct = min(1, max(0, funded / goal))`.
- Label: `targetNeeded > 0` → "Needs Rs N more" (`var(--neg)`), else "Funded" (`var(--pos)`); the bar fills `var(--accent)`/`var(--pos)`.
- A category **without a target** keeps today's behavior exactly (`target = carryIn + assigned`, "Spent X of Y").

## 7. Filters & auto-assign — `src/lib/planViews.js`, `src/lib/inspector.js`

- **`BUILTIN_VIEWS`** gains two entries (restoring YNAB's set to 5 built-ins): **Underfunded** (`match: (cat, env) => !cat.excludeFromBudget && hasTarget(cat) && targetNeeded(env.rows.get(cat.id), cat) > 0`) and **Overfunded** (`hasTarget(cat) && isOverTarget(row, cat)`). Order: All · Overspent · **Underfunded** · **Overfunded** · Money Available. Only Overspent keeps its count badge (unchanged).
- **Auto-Assign "Underfunded"** (`src/lib/inspector.js` `autoAssignPlan`/`autoAssignAmount`, kind `'underfunded'`): amount becomes `Σ targetNeeded` over the selection's targeted, non-excluded categories (falling back to the existing cover-overspending figure for categories that have no target but are overspent, so the action still does something useful for untargeted rows). Each category funds up to its need via `moveAssigned` from RTA, chained in one `applyData`.

## 8. Cost to Be Me — `src/ui/plan/Inspector.jsx`

The no-selection month summary gains a **"Cost to Be Me"** line = `costToBeMe(env, activeCats)` (Σ targets over active non-excluded targeted cats), shown under the existing Summary lines, muted, matching YNAB's placement.

## Out of scope (future)

Weekly/Yearly/Custom cadences and by-date savings math; the due-day on-track/pacing indicator; snoozing; retiring the legacy `budgets` model outright (it stays vestigial, still feeding its existing import banner — optionally the banner can seed a target from a standing budget, but that is a separate, idempotent nicety, not required here).

## Verification

- **Unit (`tests/targets.test.js`):** `targetNeeded` for both modes at over/under/at-target boundaries (refill uses available, setaside uses assigned; both floor at 0); `isOverTarget`; `hasTarget` false when excluded; `costToBeMe` excludes excluded/untargeted/archived cats; `targetSummary` copy. `tests/target-actions.test.js`: `setTarget` writes all three fields + audit, no-ops by reference, 0-amount ⇒ clear, excluded category rejected; `clearTarget` nulls the fields; `setCategoryExcluded` clears budget + target when exclusion flips on and is a no-op turning it off; `upsertCategory` still routes through the shared helper. `tests/plan-views.test.js`: Underfunded/Overfunded predicates and that excluded cats never match. Migration is additive; existing envelope tests unchanged.
- **Live (Playwright, real data):** create a **Refill** target on a category, assign toward it, watch the shortfall drop to "Funded" and the row bar fill; create a **Set-aside** target and confirm the need is `amount − assigned` regardless of carry-in; the **Underfunded** pill lists exactly the targeted cats with a shortfall and the **Overfunded** pill the over-target ones; Auto-Assign "Underfunded" funds to target in one undo step; the **Exclude** toggle in the Target card clears an existing target and drops the category from Cost-to-Be-Me; a target round-trips a reload through Supabase sync. Restore all data afterward.
