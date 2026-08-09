# Plan screen: drag-and-drop for categories and groups

**Date:** 2026-08-09
**Status:** Approved design — ready for implementation plan
**Screen:** Budget / Plan (`src/screens/Plan.jsx`)

## Problem

The Plan screen has no way to reorder categories or groups, or to move
categories between groups, by direct manipulation. Today:

- Category **groups** sort by a real `sortOrder` field, but there is no UI to
  change it.
- **Categories** within a group nearly all carry the default `sortOrder: 99`,
  so in practice they fall back to alphabetical order — there is no meaningful
  hand-set order to preserve, and no UI to set one.
- Moving a category to another group is only possible indirectly (there is a
  `setCategoryGroup` reducer, but no drag affordance).
- There is **no reorder reducer** for either categories or groups.

Users expect YNAB-style direct manipulation: drag to sort, drag to regroup.

## Goals (the confirmed operation set)

- **A.** Reorder **groups** among themselves (drag a group to an exact slot).
- **B.** Reorder **categories** within their own group.
- **C.** Move a category **into a different group** at an exact position.
- **D.** **Multi-select** categories and drag them all at once — into another
  group *or* reordered within their current group.

All four are delivered with **precise insertion** (a drop-indicator line at the
exact landing slot), a **drag ghost** following the cursor, and a dedicated
**drag handle** as the only drag initiator.

## Non-goals

- **Touch / pointer drag.** Desktop mouse only for the first cut (see Approach).
  Revisit touch later if needed.
- Reordering of the synthetic "Other" bucket, or dragging real groups below it.
- Any change to amounts, assignments, budgets, recurring, or transactions —
  drag only changes `groupId` and `sortOrder`.

## Approach

**Native HTML5 drag-and-drop, desktop mouse only.** This reuses the exact
pattern already established in the codebase (`src/ui/plan/ManageViewsModal.jsx`
reorders saved views and builtin pills with native HTML5 DnD: a `draggable`
handle, a ref holding the dragged id, and `onDragOver`/`onDrop` handlers). No
new dependency is added. The known limitation — native HTML5 DnD does not fire
on touchscreens — is accepted for now; a pointer-events implementation would be
higher-risk and is deferred.

### Alternatives considered

- **Pointer-events math (works on touch):** more code, must hand-roll hit
  testing, auto-scroll, and ghost rendering. Rejected for the first cut on
  risk/effort grounds; revisit if touch becomes a requirement.
- **A DnD library (`@dnd-kit` etc.):** adds a dependency to a bundle already
  over the 500 kB warning threshold, and the app already has a working native
  pattern. Rejected.

## Interaction model

- **Drag handle:** a grip icon (`⠿`) on the left of each category row and each
  group row. Visible on row hover, and always visible for rows in the current
  selection. Only the handle is `draggable`. The rest of the row keeps its
  existing behavior untouched (click-to-select, shift/cmd range, the checkbox,
  and the name's rename popover).
- **Precise insertion:** while dragging, a thin indicator line marks the exact
  slot between rows (for categories) or between groups (for groups). Dropping
  onto a **collapsed** group's header drops the category in as its first member;
  the group stays collapsed. A collapsed group can still be reordered by
  dragging its header.
- **Ghost:** a small chip that follows the cursor showing the dragged row's
  name; for a multi-drag it shows a count badge (e.g. "3 categories"). Rendered
  via `setDragImage` on an off-screen styled node.
- **The "Other" bucket** (ungrouped categories, `groupId: null`, always rendered
  last, never a stored group): a valid **drop target for categories** — dropping
  there ungroups them (`groupId` → `null`) — but it is **not draggable** and
  always stays pinned at the bottom. Real groups cannot be dragged below it.
- **Auto-scroll:** dragging near the top/bottom edge of the list auto-scrolls it
  (lightweight implementation).

### Multi-drag semantics

- Grabbing the handle of a row that **is** in the current `selected` set drags
  the **whole selection**. Grabbing a row that is **not** selected drags just
  that one row and leaves the selection alone.
- Dragged categories land **contiguously** at the drop point, in their **current
  visual (top-to-bottom) order**, all adopting the target group.
- A selection may **span multiple groups**; on drop they all collapse together
  into the single drop location.

## Store reducers (new, in `src/store/actions.js`)

Both are **pure reducers** following the codebase contract: `(data, payload) =>
newData`, returning the **same object reference** on a no-op (the store relies
on reference equality for undo/no-op detection — see `actions.js` header and
`StoreProvider` reducer). Both are modeled on the splice-then-renumber pattern
in `src/lib/planViews.js` `reorderViews`. Both mutate only `groupId` and
`sortOrder`, which already flow through the diff-sync queue (`sortOrder` is in
`CAT_AUDIT_FIELDS`; group `sortOrder` is already written by existing actions),
and both are undoable/redoable automatically via `applyData`.

### `moveCategories(data, { ids, groupId, beforeId })`

The single operation behind goals **B + C + D**.

- `ids`: the dragged category ids, in the order they should land.
- `groupId`: the target group id, or `null` to ungroup (drop into "Other").
- `beforeId`: the category id the dragged block should be inserted **before**
  within the target group's ordered member list; `null` means append to the end.
- Behavior: set each dragged category's `groupId` to the target; rebuild the
  target group's ordered member list (current members by `sortOrder` then name,
  minus the dragged ids), insert the dragged ids as a contiguous block before
  `beforeId` (or at the end), then renumber that group's members' `sortOrder`
  `0..n`. Source groups the categories left keep their relative order.
- No-op / guard cases return `data` unchanged: unknown `groupId` that is neither
  a real group nor `null`; empty/all-unknown `ids`; a `beforeId` that is one of
  the dragged ids or not a member of the target group is treated as "append"
  rather than an error — but if the resulting `groupId`+order is identical to
  the current state, return the same reference.
- Supersedes `setCategoryGroup` for the DnD path (that reducer stays for any
  existing non-drag callers).

### `reorderCategoryGroup(data, { id, beforeId })`

Goal **A**.

- `id`: the group being moved. `beforeId`: the group to insert before, or `null`
  to append last (but still above the synthetic "Other").
- Behavior: splice `id` out of the `sortOrder`-ordered group list, reinsert
  before `beforeId` (or at the end), renumber all groups' `sortOrder` `0..n`.
- No-op / guard cases return `data`: unknown `id`; `beforeId === id`; the
  synthetic "Other" is never a subject and never a valid landing slot below (it
  is not a stored group, so it simply cannot appear as `id` or `beforeId`); a
  reorder that produces the identical ordering returns the same reference.

## UI wiring

- A small drag-state controller — a `usePlanDnd` hook (new, e.g.
  `src/ui/plan/usePlanDnd.js`) — holds: the drag kind (`'group' | 'category'`),
  the dragged ids, and the current drop target (target group + `beforeId`, or
  group-reorder slot). Keeping this in a hook prevents `Plan.jsx` from bloating.
- `GroupRow` and `CategoryRow` (in `Plan.jsx`) gain: the drag handle with
  `onDragStart` (populates the controller from `selected` per the multi-drag
  rule), and `onDragOver`/`onDrop` on the row and the inter-row gap to compute
  the insertion point and render the indicator line.
- On drop, the controller dispatches `applyData(d => moveCategories(...))` or
  `applyData(d => reorderCategoryGroup(...))`.
- Ghost via `setDragImage` on an off-screen node built from the dragged row(s).

## Testing

- **Unit tests** (Vitest, no jsdom — matching the project norm of testing pure
  reducers directly; see `tests/group-delete.test.js` for the established
  style) for both reducers:
  - `moveCategories`: within-group reorder (B); cross-group move to an exact
    slot (C); multi-drag lands contiguous in given order (D); ungroup to `null`;
    renumber correctness (`sortOrder` becomes `0..n` in the target group);
    no-op identity with `toBe` for unknown group, empty ids, and a move whose
    result equals the current state.
  - `reorderCategoryGroup`: reorder to an exact slot + renumber `0..n`; no-op
    identity with `toBe` for unknown id, `beforeId === id`, and an ordering that
    equals the current state.
- **The DnD UI itself** (handles, indicator line, ghost, auto-scroll, collapsed
  drop) is verified **manually and/or via a Playwright pass**, not unit tests —
  native HTML5 DnD and `setDragImage` are not exercisable under the headless,
  jsdom-free unit setup.

## Explicit assumptions

- **Desktop mouse-only** DnD for the first cut; touch deferred.
- Insertion addressed by `beforeId` (the id to insert before; `null` = append).
- Reordering and moving are ordinary `applyData` edits, hence undoable/redoable
  like every other store change.
