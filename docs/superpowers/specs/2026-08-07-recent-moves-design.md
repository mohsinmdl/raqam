# Recent Moves — design

Date: 2026-08-07 · Owner-approved via brainstorming (history depth, undo-row
handling, filter vocabulary, row behaviour, and the four design sections each
confirmed explicitly).

## Purpose

A history panel beside the undo/redo buttons, listing what you have changed,
grouped by day — *Today*, *Yesterday*, *3 days ago* — and surviving reloads.
It answers "what did I do?"; the ↶ button beside it answers "undo it".

Every mutating action already writes an audit row carrying a human summary
("Deleted adjustment of 3200"), a timestamp and an entity type. The panel is
mostly a presenter over data that exists. The work is fetching it back.

## 1. Fetching history — where the risk is

`audit` is currently `skipFetch: true` in `src/store/sync.js`, so `fetchAll`
sets `store.audit = []` and history dies with the session. Three things change.

**`fromRow` must become a real mapper.** It is currently `r => r`, commented
"never fetched". Fetched rows arrive snake_case (`entity_type`, `entity_id`);
locally created rows are camelCase (`entityType`). Left as a passthrough the
panel would meet two shapes — and worse, `toRow` applied to a snake_case row
would read `undefined` for every camelCase field and push a corrupt duplicate.
The new `fromRow` mirrors `toRow` exactly:

```js
fromRow: r => ({
  id: r.id, entityType: r.entity_type, entityId: r.entity_id,
  action: r.action, summary: r.summary || '',
  before: r.before ?? null, after: r.after ?? null, at: r.at,
})
```

**The fetch is bounded.** `fetchAll` currently issues the same
`.select('*')` for every collection. Collections gain an optional
`fetchQuery` hook; `audit` uses
`q => q.order('at', { ascending: false }).limit(300)`.
300 covers the owner's 342 rows meaningfully while keeping a years-old ledger
from loading its whole history at startup. Newest-first also matches the local
convention every action follows (`makeAudit` rows are prepended), so
`audit[0]` stays the newest row — which `labelFor` in `src/lib/undo.js`
depends on.

**The baseline ordering becomes load-bearing.** `diffStores` counts a row
absent from the baseline as an *add*. `StoreProvider.jsx:79` calls `fetchAll()`
and `:88` passes that same store as `initialBaseline`, so fetched rows are in
the baseline and are never re-pushed. That is correct today by construction,
but it is now something the feature *relies* on rather than merely benefits
from, so a test pins it: diffing a hydrated store against itself must produce
no audit writes.

Undo is unaffected: `restore()` carries `currentData.audit` across, which is
simply a longer array now. `appendOnly: true` still forces `deletes = []`, so
nothing can remove server rows.

## 2. `src/lib/moves.js` — pure, testable

```js
MOVE_FILTERS                       // [{id:'all'|'money'|'plans'|'setup', label}]
filterMoves(audit, filterId)       // drops undo/redo, applies the filter
groupMovesByDay(rows, now)         // -> [{ day, dayLabel, relLabel, rows }]
moveCount(audit, filterId)         // for chip counts
```

- **undo/redo are excluded always.** 100 of the owner's 342 rows are undo or
  redo; they describe navigation, not change, and arrive in pairs that cancel.
  They remain in the database — the audit trail stays complete.
- **Chips map entity types**: Money = `transaction`; Plans = `recurring`,
  `budget`; Setup = `account`, `category`, `card`. An unrecognised future
  entity type falls under All only, never silently into a named chip.
- **Grouping** is by `at.slice(0,10)`, newest day first, rows newest-first
  within a day. `relLabel` is Today / Yesterday / N days ago, computed from an
  injected `now` (the project's convention — no clock reads inside).

## 3. `src/components/RecentMoves.jsx`

A button beside ↶ ↷ opening a popover: title, chip row with counts, and a
scrolling day-grouped list. Rows are **read-only** — no hover state, no cursor
change. Audit rows outlive what they describe (49 of the owner's rows are
deletes), so a click that sometimes lands nowhere is worse than no click.

Closes on outside mousedown and Escape, following `RowMenu`'s existing
pattern rather than inventing a second one. Components at module scope, per
`tests/no-inline-components.test.js`. Empty states for "no history yet" and
for a filter that matches nothing.

## 4. Out of scope

No click-through to the affected row, no before/after expansion, no
undo-from-history, no search, no pagination beyond the 300-row fetch, no
grouping by entity. Each is a real feature; none is needed to answer "what did
I do lately?".

## Failure modes

- **Fetch fails**: `fetchAll` already throws on any collection error and the
  hydrate path shows the existing error screen. Audit joins that behaviour —
  no new failure class, but it does mean a broken audit query now blocks
  loading, where before it could not. Bounded query, single table, existing
  `own select` RLS policy — the risk is acceptable and stated rather than
  hidden.
- **A row with a missing or malformed `at`**: grouping skips it rather than
  producing an `Invalid Date` heading.
- **More than 300 rows**: the oldest are simply absent. The panel says so in
  its footer rather than implying the list is complete.

## Testing

`tests/moves.test.js` (pure): undo/redo always excluded; each chip's entity
mapping including an unknown type; day grouping and boundaries (today,
yesterday, N days ago, across a month boundary); newest-first within a day;
malformed `at` skipped; counts match filtered rows.

`tests/audit-fetch.test.js` (pure): `fromRow` round-trips with `toRow`;
a store hydrated with audit rows diffs against itself to zero audit writes —
the baseline property above; `appendOnly` still yields no deletes when local
audit is shorter than the baseline.

Existing 403 tests stay green.
