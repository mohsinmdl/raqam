# Transactions: timestamp-on-create + drag-to-reorder

**Date:** 2026-08-30
**Branch:** `worktree-tx-timestamp-reorder`

## Goal

On the transactions page:

1. A newly added transaction lands **at the top** of today with a **real
   timestamp**, not a fixed noon.
2. **Drag-and-drop** reordering: dropping a row between two neighbors assigns it
   a timestamp **between** them.
3. If the two neighbors span **more than 3 days** (or the drop lands at an edge
   with no room), a **date/time picker** opens instead of guessing a moment.
4. Dropping at the very **top** stamps `now`; if there is no room below `now`,
   the picker opens.

## Key facts that shape the design

- Transaction order is derived **purely from the `date` string, descending**
  (`sync.js` re-sort; `sortRows.SORT_COLUMNS.date.get = r => r.sortAt`, where
  `sortAt = t.date`). There is no separate order index.
- Day-groups read `t.date.slice(0,10)`; budget month reads `slice(0,7)`; the
  running balance walks the date-sorted rows. All lean on the same invariant.
- The DB enforces **minute precision**:
  `0001_init.sql:113` — `date text ... check (date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')`.
  Minute precision has no room to interpolate between closely-entered rows.
- `postTransactionNow` (`actions.js`) already shows the exact shape of a
  one-field date update: set `date`, `stampUpdate`, one audit row, return.
- `usePlanDnd.js` is the reusable native-HTML5-DnD pattern (ghost, edge
  auto-scroll, dispatch-on-drop).
- `WhenField.jsx` already implements the calendar + time popover, but coupled to
  `useDrawer`.

## Chosen approach: seconds precision + drag rewrites `date`

Rejected: minute-only (picker fires constantly for same-minute clusters) and a
separate fractional order index (heavy; divorces order from time, contradicting
the "calculate the time between the two" model).

### 1. Precision + migration

- `supabase/migrations/0019_tx_seconds_precision.sql`: relax the CHECK to
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$`. Backward compatible: existing
  `THH:MM` rows stay valid and keep sorting (a minute string is a prefix of its
  seconds form). **Must be applied to prod before any seconds-precision row
  syncs**, or the sync push 400s (same pending-apply discipline as 0018).
- `dates.js`: add `nowIsoSec()` and pure helpers `toEpochMs`, `fmtIsoSec`,
  `midpointIso`, `dayGapAbs`. Leave `nowIso()` (minute) untouched — many callers
  depend on it.

### 2. New tx on top with a real timestamp

- `buildTx` (`actions.js`): if the user actually picked a time → use `f.time`
  (append `:00`); else if dated today → `nowIsoSec()`; else → `T12:00:00`
  (honest noon for other days, matching `stampFor`).
- A `timeTouched` flag, set by `WhenField` when the user picks a time,
  distinguishes "chose noon" from "left default".

### 3. Drag-to-reorder — pure policy (isolated, testable)

- `src/lib/txReorder.js` — `planDrop({ above, below, now, windowDays: 3 })`
  returns `{ mode:'auto', date }` or `{ mode:'picker', seed }`:
  - both neighbors, same-or-adjacent within ≤3 calendar days, room to the
    second → `auto` midpoint;
  - gap > 3 days, or no integer-second room → `picker` seeded with the midpoint;
  - top drop (no `above`): `now` if `now > below.date` → `auto`, else `picker`;
  - bottom drop (no `below`): `picker` seeded near `above`.
  No DOM. Fully unit-tested (boundaries at exactly 3 vs 4 days, edges, no-room).
- `reorderTransaction(data, { id, date, now })` in `actions.js` — clone of
  `postTransactionNow`: one field, `stampUpdate`, one audit row
  ("Reordered — moved to …"), future-guard (never past `now`). Routed through
  `applyData` so Ctrl-Z reverts in one step.

### 4. Interaction + picker

- `src/ui/tx/useTxDnd.js` — native DnD hook mirroring `usePlanDnd.js`. Enabled
  only when `sort.key==='date' && sort.dir==='desc'`; otherwise handles inert
  with a "Sort by date to reorder" hint.
- Extract `WhenField`'s popover into a reusable `WhenPopover` primitive (decouple
  from `useDrawer`); the add drawer and the drag-picker both use it. On confirm →
  `reorderTransaction`.
- `Transactions.jsx` / `Row`: drag handle + insertion line between rows, reusing
  existing day-group boundaries as drop targets.

### 5. Data flow

drag → `useTxDnd` tracks target gap → drop → `planDrop` decides → `auto`
dispatches `reorderTransaction`, or picker opens seeded → confirm dispatches the
same → reducer rewrites `date` → sync push → list re-derives (row moves; balance,
day-group, budget month recompute — consequences drawn from the date).

### 6. Edges & accepted consequences

- Non-date / ascending sort → DnD off.
- Second-collision → picker.
- Future-guard clamps to `now`.
- A ≤3-day auto-move near a month boundary **can** shift a row's budget month —
  honest and audited, consistent with `postTransactionNow`.

### 7. Testing

- Pure: `txReorder.test.js` (window boundaries, edges, no-room), `dates` helper
  tests (midpoint, epoch round-trip, seconds format, mixed-precision compare).
- `actions`: `reorderTransaction` (date set, audit, future guard, same-date
  no-op), `buildTx` seconds-vs-noon.
- Native DnD: synthetic `DragEvent`s with a shared `DataTransfer` (repo's
  `verifying-native-dnd` approach) + a Playwright pass.
- Regression: existing minute-precision rows still parse/sort/group.

### Staging

Desktop register first (§1–6); phone long-press drag as a fast follow reusing the
same `planDrop` / `reorderTransaction` / `useTxDnd` core.
