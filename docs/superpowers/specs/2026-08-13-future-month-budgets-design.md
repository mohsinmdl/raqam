# Future-month budgets — Design Spec

**Date:** 2026-08-13 · **Status:** validated design, PR1 and PR2 implemented
**Request:** "Let users plan budgets up to 3 months ahead on the Plan screen."

## Problem

The Plan screen (`/budget`) can only be edited for the current month — the header stepper that drives it stops at "this month," so there's no way to pre-assign money to next month's envelopes. Users who get paid early, or who like to front-load a big month (holidays, a trip), have nowhere to put that plan.

## Finding: the envelope system is already month-keyed end-to-end

Nothing about the assignment/envelope machinery is current-month-only:

- `assignments` rows are `{category, month, amount}` — a plain per-month fact, no "is this the live month" flag anywhere in the shape.
- `setAssigned` / `moveAssigned` (`src/store/actions.js`) accept whatever `month` they're given; neither validates it against `currentMonth()`.
- Sync (`src/store/sync.js`) round-trips `assignments` to Supabase with no month filtering, and the table's own constraint (`month ~ '^\d{4}-\d{2}$'`) only shapes the string — it has no upper bound.
- `envelopeFor` (`src/lib/envelope.js`) folds forward from the earliest data month to the viewed month, one month at a time. A future month with no transactions and no assignments folds through cleanly: activity is zero, assigned is zero (or whatever was pre-assigned), and RTA carries forward exactly as it would for any other unvisited month.

The one place that clamps to "now" is `monthsFor()` (`src/lib/dates.js`), which builds the contiguous month list the header stepper navigates. It walks back from `currentMonth()` to the earliest month with data and stops — there was never a reason to go past `cur` because nothing consumed a future month. That's the single blocker, and it's a list-building function, not a domain rule.

## Decisions

- **Horizon:** unchanged full past history, plus 3 months ahead. Past behavior (earliest-data-month → now) is untouched; the addition is purely additive at the top end.
- **Where it's steppable:** everywhere the header stepper already appears — Dashboard, `/budget`, Reflect. One list, one component; no separate "future mode" UI.
- **No cross-month "assigning money you don't have" warning in v1.** The forward fold already produces the natural signal: assigning more than RTA allows in a future month pushes RTA negative, exactly as it would for the current month. A dedicated warning can follow later if it turns out to be needed; it isn't required to ship the capability.
- **Future-month balance reads clamp to the current month (user decision, post-PR2 fix).** Opening snapshots only exist up to `currentMonth()`, so account/net-worth balance reads for a future viewed month would fabricate zeros; those reads clamp to `min(viewedMonth, currentMonth())` and show the latest real position instead. The Plan/envelope screen is unaffected — its forward fold is correct by design and keeps reading the real viewed month.
- **Ship as a two-PR stack.**
  - **PR1 (this PR, `feat/future-months-lib`):** the *capability* only — `monthsFor` grows an opt-in `lookahead` option, defaulted to 0. Zero behavior change for every existing caller.
  - **PR2 (activation):** `MonthContext` passes `lookahead: 3`, an `isFuture` flag is derived per month, and the header gets a "Future month" chip mirroring the existing "Closed month" chip.

## Constraint that shaped the design

`src/lib/reports.js` also calls `monthsFor(store)` — the Reflect trend series (`monthlySeries`, `incomeExpenseSeries`, `netWorthSeries`, `ageOfMoney`) all take the tail of that list via `.slice(-window)`. If `monthsFor` grew future months by default, every trend window would silently shift: empty future months would occupy slots at the end of the slice, and real historical months would fall out the front. Trends would look broken (a flat, empty final month) without any of their own code changing.

That's why the lookahead is an **opt-in option with default 0**, not a new default behavior. `reports.js` and `MonthContext` keep calling `monthsFor(store)` with no second argument and get byte-identical output to before this PR. Only a caller that explicitly asks for `{ lookahead: n }` — PR2's `MonthContext`, and the budget stepper it feeds — sees future months.

## Out of scope / verified non-issues

- **`src/screens/Budgets.jsx`** — legacy, unrouted dead code. Not reachable from the app, so not touched.
- **`PlanCategoryPicker`** — takes a `month` prop that is currently unused inside the component. No future-month-specific work needed there.
- **Mobile Spending tab** — uses date ranges (start/end), not the month stepper. Unaffected by this change either way.
- **Month rollover** — `StoreProvider` already dispatches `rolloverMonth` on the real-world month turning over, which slides `currentMonth()` forward and, with it, the whole `monthsFor` window (including any future months already visible). No special-casing needed for "a future month becomes the current month."

## PR1 scope (this PR)

- `src/lib/dates.js`: `monthsFor(store, { lookahead = 0 } = {})` — appends `addMonths(cur, 1) .. addMonths(cur, lookahead)` after the existing past-through-current list, in ascending order. The `MAX_MONTHS = 24` cap continues to bound only the past span; lookahead months are additive on top of it.
- `tests/months-lookahead.test.js`: default call is unchanged (last element is `currentMonth()`), lookahead appends the right months in order, empty-store lookahead, past-span cap + lookahead composing correctly, and `lookahead: 0` matching the default exactly.
- No other file changes. `src/lib/reports.js` and `src/store/MonthContext.jsx` are untouched and keep calling `monthsFor(store)` with one argument.

## PR2 scope (follow-up, not built here)

- `MonthContext` passes `{ lookahead: 3 }` when building its month list.
- An `isFuture` flag (month > `currentMonth()`) threaded alongside the existing `isClosed`-style state.
- A "Future month" chip in the header, styled and positioned like the existing "Closed month" chip.
