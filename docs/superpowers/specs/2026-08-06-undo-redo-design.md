# Undo/redo — design

Date: 2026-08-06 · Owner-approved via brainstorming (scope, persistence, UI
surface, and the full design each confirmed explicitly).

## Purpose

One undo/redo stack covering **every user action** — transactions, recurring
rules, accounts, cards, budgets, categories — reachable from **header ↶ ↷
buttons and keyboard shortcuts**, living for the **session only** (cleared on
reload). The owner asked for undo across transaction and recurring actions;
the wider scope was chosen deliberately because it is *less* code and has no
per-action bookkeeping to forget.

## Why this shape is cheap here

Three properties of the existing architecture do most of the work:

1. **Single funnel.** Every user mutation goes through `applyData(fn)`
   (`src/store/StoreProvider.jsx:153`), which dispatches `{type:'data', fn}`.
   One wrapper captures everything.
2. **System mutations already bypass the funnel.** Month rollover uses raw
   `dispatch` (`StoreProvider.jsx:123` and the hydrate path at `:68`); legacy
   import and hydrate use `replaceData`. Wrapping only `applyData` therefore
   excludes them *structurally* — no tags, no flags. Cmd+Z can never remove a
   month's opening snapshot.
3. **Pure actions share structure.** Actions return `{...data}` with only the
   changed collections replaced, so a stack of 50 snapshot references is a
   stack of 50 spines, not 50 copies.

Sync needs no changes: restoring an older snapshot produces ordinary diffs —
undo of a create becomes a delete, undo of a delete re-inserts the identical
row (same id), and the write-behind queue pushes them like any other change.

## Components

### `src/store/undo.js` (new, pure)

```js
CAP = 50
emptyStacks()                 -> { past: [], future: [] }
record(stacks, snapshot)      -> stacks'   // push past, clear future, cap
undoStep(stacks, current)     -> { stacks', snapshot } | null
redoStep(stacks, current)     -> { stacks', snapshot } | null
undoLabel(stacks) / redoLabel(stacks)     // from entry.label
```

Entries are `{ snapshot, label }`. The label is harvested for free: after an
action's `fn` runs, any audit rows it prepended (`newData.audit[0]` vs the
pre-action head) already carry a human summary ("Deleted expense of 5000");
that summary becomes the entry label shown in tooltips. Fallback: "last
change". No call-site changes anywhere.

### `StoreProvider` integration

`applyData` becomes: capture `prev`, run `fn`, if the result is a **different
reference** (actions no-op by returning the same store) record `prev` on the
stack with the harvested label, then dispatch. `undo()`/`redo()` swap the
current data with the popped snapshot **except the audit array** (below) and
dispatch via the existing `replaceData` path. Stacks live in a ref (they are
not render state); a small `useState` version counter refreshes the header
buttons.

Exposed on the store context: `undo, redo, canUndo, canRedo, undoLabel,
redoLabel`.

### The audit trail stays append-only — the one subtle rule

The server's `audit_log` is append-only (`sync.js`: `appendOnly: true`,
`skipFetch: true` — the differ computes adds only). Restoring an old audit
array locally would silently diverge from the server and erase rows already
pushed. So:

```
restored = { ...pastSnapshot, audit: current.audit }
audit gets a NEW row prepended:
  makeAudit({ entityType: 'app', entityId: 'undo', action: 'undo',
              summary: 'Undid: ' + entry.label })
```

History reads "created X, then undid it" — never "nothing happened".
`audit.length` is monotonically non-decreasing through any undo/redo sequence
(tested as an invariant).

**Migration `0010_undo_audit.sql`**: widen the audit CHECKs — `action` gains
`'undo', 'redo'`; `entity_type` gains `'app'` (current CHECK allows only
transaction/account/card/category/budget/recurring). Owner applies it in the
SQL editor, same flow as 0009. Ships in the same PR, and the PR description
flags that the migration must run before the feature is used, else audit rows
for undo are rejected by the DB (sync would retry-fail on those rows only).

### UI

- **Header** (`src/components/Header.jsx`, beside Show/Hide amounts): two
  icon buttons ↶ ↷, greyed/disabled when their stack is empty,
  `title`/`aria-label` = "Undo: Deleted transaction" / "Redo: …".
- **Keyboard** (listener in Header, since it is always mounted):
  Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z and Ctrl+Y = redo. Suppressed when
  focus is in `input`/`textarea`/`select`/`contentEditable` (native text
  undo wins) and **while a drawer is open** (`useDrawer().drawer` truthy) —
  undoing the store beneath a half-edited form would leave the drawer editing
  a ghost.

### Out of scope / untouched

- View state (filters, range, sort, density, selection, month) — not data;
  undo never changes it. Selection is id-keyed, so an undone delete simply
  reappears unselected.
- Reload clears the stacks (session-only, owner's choice). Multi-device
  staleness is therefore structurally avoided.
- Prefs changes (theme, masking, density) do not pass through `applyData`
  and are not undoable.
- No toast changes.

## Failure modes

- **Sync failure while pushing a restore**: identical to any action's sync
  failure; the existing queue retries. Undo introduces no new failure class.
- **Undo with empty stack / redo after a new action**: no-ops; a new user
  action clears the redo stack (standard editor semantics).
- **Migration not yet applied**: only the `undo`/`redo` audit rows are
  rejected by the DB CHECK; data restores still sync. Flagged in the PR as a
  must-run-first step.

## Testing (pure, per project norms)

`tests/undo.test.js`:
- record caps at 50, drops oldest, clears future.
- undo/redo round-trip returns the exact same object references (structural
  sharing preserved, not deep-cloned).
- no-op actions (same reference back) record nothing.
- audit monotonicity: through arbitrary undo/redo sequences `audit.length`
  never decreases and gains one row per undo/redo.
- labels: harvested from the audit head; fallback when an action writes no
  audit.
- undo of a bulk delete restores all rows in one step (bulk actions are one
  `applyData` call, hence one entry).

Existing suite (336) stays green. `no-inline-components` guard applies to any
new Header subcomponents.
