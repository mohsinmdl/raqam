# Plan Screen Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YNAB-style drag-and-drop to the Plan/budget screen so users can reorder category groups, reorder categories within a group, move categories between groups, and drag a multi-selection into another group — all with a precise insertion line and a drag ghost.

**Architecture:** Two new pure reducers in `src/store/actions.js` (`moveCategories`, `reorderCategoryGroup`) do all state changes by mutating only `groupId` and `sortOrder`. A new hook `src/ui/plan/usePlanDnd.js` holds transient drag state and wires native HTML5 DnD events to those reducers. `GroupRow` and `CategoryRow` in `src/screens/Plan.jsx` gain a drag handle, drop-over handlers, and an insertion-line indicator.

**Tech Stack:** React 18, native HTML5 Drag and Drop API (no library), Vitest (no jsdom — pure-function tests only), inline styles with CSS-var tokens.

## Global Constraints

- **Pure reducers, reference-stable no-ops:** every reducer is `(data, payload) => newData` and MUST return the **same `data` object reference** on a no-op — the store detects no-ops / drives undo by reference equality, and tests assert it with `toBe`. (`src/store/actions.js` header; `src/store/StoreProvider.jsx` reducer `next === state.data`.)
- **No new dependencies.** Use the native HTML5 DnD pattern already in `src/ui/plan/ManageViewsModal.jsx`. The bundle is already over Vite's 500 kB warning line; do not add a DnD library.
- **Styling:** inline styles with CSS-var tokens only (`var(--accent)`, `var(--border)`, `var(--soft)`, `var(--surface)`, `var(--muted)`, `var(--text)`), matching surrounding code. No Tailwind / CSS modules.
- **Desktop mouse only.** Native HTML5 DnD does not fire on touch; touch is explicitly out of scope.
- **Only `groupId` + `sortOrder` change.** Never touch amounts, assignments, budgets, recurring, or transactions.
- **Audit discipline:** a category whose `groupId` actually changes gets one move audit row + `stampUpdate` (mirroring `setCategoryGroup`); a category that only shifts `sortOrder` is updated silently (no stamp, no audit) so a drag can't flood the audit log or the "Edited" chips. `sortOrder` is in `CAT_AUDIT_FIELDS` and already syncs.
- **Test command:** `npx vitest run`. **Build command:** `npx vite build`. Both must stay green (baseline: 744 tests pass, build clean).
- **Commit style:** short conventional-commit subjects, e.g. `feat(plan): moveCategories reducer`.

---

### Task 1: `moveCategories` reducer (goals B + C + D)

The single reducer behind within-group reorder, cross-group move, and multi-drag. Given the dragged ids (in landing order), a target group (or `null` to ungroup into "Other"), and a `beforeId` to land in front of, it sets each mover's `groupId` and renumbers the target group's members' `sortOrder` to a contiguous `0..n`.

**Files:**
- Modify: `src/store/actions.js` (add `moveCategories`, placed just after `setCategoryGroup`, ~line 1163)
- Test: `tests/move-categories.test.js` (create)

**Interfaces:**
- Consumes: `makeAudit`, `stampUpdate` (already imported at `src/store/actions.js:5` from `./audit.js`).
- Produces: `export function moveCategories(data, { ids, groupId, beforeId })` → new `data` (or same ref on no-op). `ids`: ordered category-id array. `groupId`: target group id, or `null` to ungroup. `beforeId`: target-group member id to insert before, or `null`/absent/unknown = append to the end of the target group.

- [ ] **Step 1: Write the failing tests**

Create `tests/move-categories.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { moveCategories } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [
    { id: 'g1', name: 'Needs', sortOrder: 0 },
    { id: 'g2', name: 'Wants', sortOrder: 1 },
  ],
  categories: [
    { id: 'a', name: 'A', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 0 },
    { id: 'b', name: 'B', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 1 },
    { id: 'c', name: 'C', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 2 },
    { id: 'x', name: 'X', type: 'expense', status: 'active', groupId: 'g2', sortOrder: 0 },
  ],
  assignments: [], transactions: [], budgets: [], recurring: [], accounts: [], cards: [], snapshots: [], audit: [],
  ...(over || {}),
});

const orderIn = (data, groupId) =>
  data.categories
    .filter(c => (c.groupId ?? null) === groupId)
    .sort((p, q) => (p.sortOrder || 0) - (q.sortOrder || 0) || p.name.localeCompare(q.name))
    .map(c => c.id);

describe('moveCategories — within-group reorder (B)', () => {
  it('moves C to the front of its own group and renumbers 0..n', () => {
    const next = moveCategories(store(), { ids: ['c'], groupId: 'g1', beforeId: 'a' });
    expect(orderIn(next, 'g1')).toEqual(['c', 'a', 'b']);
    expect(next.categories.filter(c => c.groupId === 'g1').map(c => c.sortOrder).sort()).toEqual([0, 1, 2]);
  });
  it('append (beforeId null) puts the mover last', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: 'g1', beforeId: null });
    expect(orderIn(next, 'g1')).toEqual(['b', 'c', 'a']);
  });
});

describe('moveCategories — cross-group move (C)', () => {
  it('moves A into g2 before X and stamps + audits the group change', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: 'g2', beforeId: 'x' });
    expect(orderIn(next, 'g2')).toEqual(['a', 'x']);
    expect(orderIn(next, 'g1')).toEqual(['b', 'c']);
    const moved = next.categories.find(c => c.id === 'a');
    expect(moved.groupId).toBe('g2');
    expect(moved.editCount).toBe(1); // stampUpdate ran on the real move
    expect(next.audit[0]).toMatchObject({ entityType: 'category', entityId: 'a', action: 'update' });
  });
});

describe('moveCategories — multi-drag (D)', () => {
  it('lands multiple ids contiguously in given order at the drop point', () => {
    const next = moveCategories(store(), { ids: ['a', 'c'], groupId: 'g2', beforeId: 'x' });
    expect(orderIn(next, 'g2')).toEqual(['a', 'c', 'x']);
    expect(orderIn(next, 'g1')).toEqual(['b']);
  });
});

describe('moveCategories — ungroup into Other', () => {
  it('groupId:null removes the group membership', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: null, beforeId: null });
    const moved = next.categories.find(c => c.id === 'a');
    expect(moved.groupId).toBeUndefined();
  });
});

describe('moveCategories — pure reorder emits no audit', () => {
  it('reorder within a group adds no audit rows and no edit stamp', () => {
    const next = moveCategories(store(), { ids: ['c'], groupId: 'g1', beforeId: 'a' });
    expect(next.audit).toHaveLength(0);
    expect(next.categories.find(c => c.id === 'c').editCount).toBeUndefined();
  });
});

describe('moveCategories — no-op identity', () => {
  it('unknown target group → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: ['a'], groupId: 'ghost', beforeId: null })).toBe(s);
  });
  it('empty / all-unknown ids → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: [], groupId: 'g1', beforeId: null })).toBe(s);
    expect(moveCategories(s, { ids: ['nope'], groupId: 'g1', beforeId: null })).toBe(s);
  });
  it('dropping in the identical position → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: ['b'], groupId: 'g1', beforeId: 'c' })).toBe(s);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/move-categories.test.js`
Expected: FAIL — `moveCategories is not a function` (export missing).

- [ ] **Step 3: Implement `moveCategories`**

In `src/store/actions.js`, immediately AFTER the `setCategoryGroup` function (which ends ~line 1163), add:

```js
// Drag-and-drop move/reorder of categories (Plan screen). `ids` are the dragged
// category ids in the order they should land; `groupId` is the target group, or
// null to ungroup into the synthetic "Other" bucket; `beforeId` is the
// target-group member to land in front of (null/absent/unknown = append last).
// Only groupId + sortOrder change — no amounts, assignments, or refs are
// touched. The target group's members are renumbered to a contiguous 0..n so
// sortOrder stays clean. A category whose group actually changes is stamped +
// audited (like setCategoryGroup); a pure reorder is silent so a drag can't
// flood the audit log / "Edited" chips. Returns the same `data` reference when
// nothing effectively changes. Members are matched by the movers' own type so a
// drag never disturbs unrelated categories that happen to share the null bucket.
export function moveCategories(data, { ids, groupId, beforeId }) {
  if (groupId != null && !(data.categoryGroups || []).some(g => g.id === groupId)) return data;
  const byId = new Map(data.categories.map(c => [c.id, c]));
  const moving = (ids || []).map(id => byId.get(id)).filter(Boolean);
  if (!moving.length) return data;
  const type = moving[0].type;
  const movingIds = new Set(moving.map(c => c.id));
  const cmp = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  // Surviving members of the target group, in display order, minus the movers.
  const keep = data.categories
    .filter(c => c.type === type && (c.groupId ?? null) === (groupId ?? null) && !movingIds.has(c.id))
    .sort(cmp);
  let at = beforeId ? keep.findIndex(c => c.id === beforeId) : -1;
  if (at < 0) at = keep.length; // append when beforeId is absent / unknown / a mover
  const ordered = [...keep.slice(0, at), ...moving, ...keep.slice(at)];
  const orderById = new Map(ordered.map((c, i) => [c.id, i]));
  const audit = [];
  let changed = false;
  const categories = data.categories.map(c => {
    if (!orderById.has(c.id)) return c;
    const nextOrder = orderById.get(c.id);
    const groupChanged = (c.groupId ?? null) !== (groupId ?? null);
    const orderChanged = (c.sortOrder || 0) !== nextOrder;
    if (!groupChanged && !orderChanged) return c;
    changed = true;
    let nc = { ...c, sortOrder: nextOrder };
    if (groupId == null) delete nc.groupId; else nc.groupId = groupId;
    if (groupChanged) {
      nc = stampUpdate(nc);
      audit.push(makeAudit({
        entityType: 'category', entityId: c.id, action: 'update',
        summary: 'Moved ' + c.name, before: { groupId: c.groupId ?? null }, after: { groupId: groupId ?? null },
      }));
    }
    return nc;
  });
  if (!changed) return data;
  return { ...data, categories, audit: [...audit, ...(data.audit || [])] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/move-categories.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full suite + build**

Run: `npx vitest run && npx vite build`
Expected: all tests pass (now 744 + the new ones); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/actions.js tests/move-categories.test.js
git commit -m "feat(plan): moveCategories reducer for drag reorder/regroup"
```

---

### Task 2: `reorderCategoryGroup` reducer (goal A)

Reorders a category group to an exact slot and renumbers every group's `sortOrder` to `0..n`.

**Files:**
- Modify: `src/store/actions.js` (add right after `moveCategories`)
- Test: `tests/reorder-category-group.test.js` (create)

**Interfaces:**
- Consumes: `makeAudit` (already imported).
- Produces: `export function reorderCategoryGroup(data, { id, beforeId })` → new `data` (or same ref on no-op). `id`: group being moved. `beforeId`: group id to insert before, or `null`/absent/unknown = move to the end (still above the synthetic "Other", which is never a real group).

- [ ] **Step 1: Write the failing tests**

Create `tests/reorder-category-group.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { reorderCategoryGroup } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [
    { id: 'g1', name: 'Needs', sortOrder: 0 },
    { id: 'g2', name: 'Wants', sortOrder: 1 },
    { id: 'g3', name: 'Savings', sortOrder: 2 },
  ],
  categories: [], assignments: [], transactions: [], budgets: [], recurring: [],
  accounts: [], cards: [], snapshots: [], audit: [],
  ...(over || {}),
});

const order = data =>
  [...data.categoryGroups]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
    .map(g => g.id);

describe('reorderCategoryGroup — goal A', () => {
  it('moves g3 before g1 and renumbers 0..n', () => {
    const next = reorderCategoryGroup(store(), { id: 'g3', beforeId: 'g1' });
    expect(order(next)).toEqual(['g3', 'g1', 'g2']);
    expect(next.categoryGroups.map(g => g.sortOrder).sort()).toEqual([0, 1, 2]);
  });
  it('beforeId null moves the group to the end', () => {
    const next = reorderCategoryGroup(store(), { id: 'g1', beforeId: null });
    expect(order(next)).toEqual(['g2', 'g3', 'g1']);
  });
  it('writes one reorder audit row', () => {
    const next = reorderCategoryGroup(store(), { id: 'g3', beforeId: 'g1' });
    expect(next.audit[0]).toMatchObject({ entityType: 'categoryGroup', entityId: 'g3', action: 'update' });
  });
});

describe('reorderCategoryGroup — no-op identity', () => {
  it('id === beforeId → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'g1', beforeId: 'g1' })).toBe(s);
  });
  it('unknown id → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'ghost', beforeId: 'g1' })).toBe(s);
  });
  it('dropping into the identical position → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'g1', beforeId: 'g2' })).toBe(s);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reorder-category-group.test.js`
Expected: FAIL — `reorderCategoryGroup is not a function`.

- [ ] **Step 3: Implement `reorderCategoryGroup`**

In `src/store/actions.js`, immediately after `moveCategories`, add:

```js
// Drag-and-drop reorder of a category group. Lands the group before `beforeId`
// (null/absent/unknown = move to the end) and renumbers every group's sortOrder
// to a contiguous 0..n. The synthetic "Other" bucket is not a stored group, so
// it can never be `id` or `beforeId` and always renders after the real groups.
// Returns the same `data` reference when the resulting order is unchanged.
export function reorderCategoryGroup(data, { id, beforeId }) {
  if (id === beforeId) return data;
  const cmp = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  const sorted = [...(data.categoryGroups || [])].sort(cmp);
  const from = sorted.findIndex(g => g.id === id);
  if (from < 0) return data;
  const before = sorted.map(g => g.id);
  const next = [...sorted];
  const [moved] = next.splice(from, 1);
  let at = beforeId ? next.findIndex(g => g.id === beforeId) : -1;
  if (at < 0) at = next.length;
  next.splice(at, 0, moved);
  if (before.join(' ') === next.map(g => g.id).join(' ')) return data;
  const orderById = new Map(next.map((g, i) => [g.id, i]));
  return {
    ...data,
    categoryGroups: data.categoryGroups.map(g => ({ ...g, sortOrder: orderById.get(g.id) })),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'update', summary: 'Reordered group ' + moved.name }), ...(data.audit || [])],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reorder-category-group.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npx vitest run && npx vite build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/store/actions.js tests/reorder-category-group.test.js
git commit -m "feat(plan): reorderCategoryGroup reducer"
```

---

### Task 3: `usePlanDnd` hook + `dragIdsFor` helper

The transient drag-state controller. It computes which ids a drag carries (single vs. whole selection), tracks the current drop target, renders decisions the rows read to draw the insertion line, and dispatches the Task 1 / Task 2 reducers on drop. The one piece of branching logic — which ids a drag carries — is extracted as a pure helper and unit-tested; the event wiring is verified via build + the manual pass in later tasks.

**Files:**
- Create: `src/ui/plan/usePlanDnd.js`
- Test: `tests/plan-dnd-helpers.test.js` (create)

**Interfaces:**
- Consumes: `moveCategories`, `reorderCategoryGroup` from `../../store/actions.js`; `selected` (`Set<string>`), `visibleCatIdList` (`string[]`, top-to-bottom visible category ids — already computed in `Plan.jsx:1013` as `visibleCatIdList`), and `applyData` (from the store).
- Produces:
  - `export function dragIdsFor(catId, selected, visibleCatIdList)` → `string[]`. If `catId` is in `selected` and `selected.size > 1`, returns all selected ids in visible order (`visibleCatIdList.filter(id => selected.has(id))`); otherwise returns `[catId]`.
  - `export default function usePlanDnd({ selected, visibleCatIdList, applyData })` → `{ drag, target, startCategoryDrag, startGroupDrag, overCategory, overGroupGap, overGroupHeader, drop, endDrag }` where:
    - `drag`: `{ kind: 'category'|'group', ids: string[] } | null`
    - `target`: `{ kind: 'category', groupId: string|null, beforeId: string|null } | { kind: 'group', beforeId: string|null } | null`
    - `startCategoryDrag(e, catId)`, `startGroupDrag(e, groupId)`: set `drag` and `e.dataTransfer.effectAllowed = 'move'`.
    - `overCategory(e, { groupId, beforeId })`: when dragging a category, `e.preventDefault()` and set `target` to that insertion point.
    - `overGroupGap(e, { beforeGroupId })`: when dragging a group, `e.preventDefault()` and set `target` to the group slot.
    - `overGroupHeader(e, { groupId, firstCatId })`: when dragging a category over a group header, `e.preventDefault()` and set `target` to `{ kind:'category', groupId, beforeId: firstCatId ?? null }` (drop at the top of that group; works for collapsed & empty groups).
    - `drop(e)`: dispatch the matching reducer from `drag` + `target`, then clear both.
    - `endDrag()`: clear `drag` + `target` (bound to `onDragEnd`).

- [ ] **Step 1: Write the failing test for `dragIdsFor`**

Create `tests/plan-dnd-helpers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dragIdsFor } from '../src/ui/plan/usePlanDnd.js';

const visible = ['a', 'b', 'c', 'd'];

describe('dragIdsFor', () => {
  it('drags just the row when it is not in the selection', () => {
    expect(dragIdsFor('c', new Set(['a', 'b']), visible)).toEqual(['c']);
  });
  it('drags just the row when it is the only selected one', () => {
    expect(dragIdsFor('c', new Set(['c']), visible)).toEqual(['c']);
  });
  it('drags the whole selection in visible order when the row is selected', () => {
    expect(dragIdsFor('b', new Set(['d', 'b']), visible)).toEqual(['b', 'd']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/plan-dnd-helpers.test.js`
Expected: FAIL — cannot import `dragIdsFor`.

- [ ] **Step 3: Implement the hook + helper**

Create `src/ui/plan/usePlanDnd.js`:

```js
import { useCallback, useState } from 'react';
import { moveCategories, reorderCategoryGroup } from '../../store/actions.js';

// Which ids a category drag carries: the whole current selection (in visible,
// top-to-bottom order) when the grabbed row is part of a multi-selection,
// otherwise just the grabbed row — grabbing an unselected row never disturbs
// the existing selection.
export function dragIdsFor(catId, selected, visibleCatIdList) {
  if (selected.has(catId) && selected.size > 1) return visibleCatIdList.filter(id => selected.has(id));
  return [catId];
}

// Transient drag-state controller for the Plan screen. Holds the active drag
// and the current drop target so rows can draw the insertion line; dispatches
// the pure reducers on drop. Native HTML5 DnD, desktop mouse only.
export default function usePlanDnd({ selected, visibleCatIdList, applyData }) {
  const [drag, setDrag] = useState(null);
  const [target, setTarget] = useState(null);

  const startCategoryDrag = useCallback((e, catId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'category', ids: dragIdsFor(catId, selected, visibleCatIdList) });
  }, [selected, visibleCatIdList]);

  const startGroupDrag = useCallback((e, groupId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'group', ids: [groupId] });
  }, []);

  const overCategory = useCallback((e, { groupId, beforeId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    setTarget({ kind: 'category', groupId, beforeId });
  }, [drag]);

  const overGroupHeader = useCallback((e, { groupId, firstCatId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    setTarget({ kind: 'category', groupId, beforeId: firstCatId ?? null });
  }, [drag]);

  const overGroupGap = useCallback((e, { beforeGroupId }) => {
    if (!drag || drag.kind !== 'group') return;
    e.preventDefault();
    setTarget({ kind: 'group', beforeId: beforeGroupId ?? null });
  }, [drag]);

  const endDrag = useCallback(() => { setDrag(null); setTarget(null); }, []);

  const drop = useCallback(e => {
    e.preventDefault();
    if (drag && target) {
      if (drag.kind === 'category' && target.kind === 'category') {
        const { ids } = drag; const { groupId, beforeId } = target;
        applyData(d => moveCategories(d, { ids, groupId, beforeId }));
      } else if (drag.kind === 'group' && target.kind === 'group') {
        const id = drag.ids[0]; const { beforeId } = target;
        applyData(d => reorderCategoryGroup(d, { id, beforeId }));
      }
    }
    endDrag();
  }, [drag, target, applyData, endDrag]);

  return { drag, target, startCategoryDrag, startGroupDrag, overCategory, overGroupHeader, overGroupGap, drop, endDrag };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/plan-dnd-helpers.test.js`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npx vite build`
Expected: clean (hook compiles; not yet wired in).

- [ ] **Step 6: Commit**

```bash
git add src/ui/plan/usePlanDnd.js tests/plan-dnd-helpers.test.js
git commit -m "feat(plan): usePlanDnd drag-state controller + dragIdsFor"
```

---

### Task 4: Category drag handle, drop indicator, and wiring

Wire `usePlanDnd` into `Plan.jsx`, pass its handlers through `ctx`, give each `CategoryRow` a hover/selected drag handle, and draw the insertion line above the row when it is the current category target. This delivers B, C, and D end-to-end (minus the ghost/auto-scroll polish in Task 6). DnD behavior is verified by build + manual check (no jsdom).

**Files:**
- Modify: `src/screens/Plan.jsx` — construct the hook (~after line 1013 where `visibleCatIdList` exists), add to `ctx` (line 1101), extend the render loop (~line 1177) to pass the section group id, and extend `CategoryRow` (destructure at ~line 745; row root at ~line 831).

**Interfaces:**
- Consumes: `usePlanDnd` default export and its returned handlers (Task 3).
- Produces: `ctx.dnd` (the hook's return value) and a `sectionGroupId` prop on `CategoryRow`.

- [ ] **Step 1: Construct the hook and add it to `ctx`**

In `Plan.jsx`, add the import near the other `src/ui/plan` imports (top of file):

```js
import usePlanDnd from '../ui/plan/usePlanDnd.js';
```

After `visibleCatIdList` is defined (~line 1013), add:

```js
const dnd = usePlanDnd({ selected, visibleCatIdList, applyData });
```

Add `dnd` to the `ctx` object (line 1101):

```js
const ctx = { S, month, applyData, money, moneyS, view: prefs.planView, env, selected, toggleSelect, selectRow, setMany, onOpenActivity: setActivityCat, dnd };
```

- [ ] **Step 2: Pass the section group id into `CategoryRow`**

In the render loop (~line 1182), pass `sectionGroupId={group.id}` (this is `null` for the synthetic "Other" section, and the real group id otherwise — the correct target for a drop, even when a category's own `groupId` is dangling):

```jsx
{!isCollapsed && cats.map(cat => (
  <CategoryRow key={cat.id} cat={cat} row={env.rows.get(cat.id)} sectionGroupId={group.id} ctx={ctx} />
))}
```

- [ ] **Step 3: Wire drag handle + drop indicator into `CategoryRow`**

Change the `CategoryRow` signature (~line 743) to accept `sectionGroupId`:

```jsx
function CategoryRow({ cat, row, sectionGroupId, ctx }) {
```

In its destructure of `ctx` (~line 745), add `dnd`:

```js
const { month, applyData, money, moneyS, view, env, S, selected, toggleSelect, selectRow, onOpenActivity, dnd } = ctx;
```

Compute whether the insertion line shows above this row (place near the top of the component body, after the existing `const` hooks):

```js
const showLineAbove = dnd.target && dnd.target.kind === 'category'
  && (dnd.target.groupId ?? null) === (sectionGroupId ?? null)
  && dnd.target.beforeId === cat.id
  && !dnd.drag?.ids.includes(cat.id);
```

On the row root element (the `<div onClick=...>` at ~line 831), add the drop handlers and the indicator line. Add these props to that `<div>`:

```jsx
onDragOver={e => dnd.overCategory(e, { groupId: sectionGroupId, beforeId: cat.id })}
onDrop={dnd.drop}
```

Add the insertion line as the first child of that row `<div>` (a 2px accent bar; `position: relative` is not needed because it sits in the normal flow at the row's top edge — use a negative-margin absolute bar instead so it doesn't shift layout). Insert this just inside the row div, before `<span aria-hidden="true" />`:

```jsx
{showLineAbove && (
  <div aria-hidden="true" style={{ position: 'absolute', left: 16, right: 16, marginTop: -8, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
)}
```

For the absolute bar to anchor to the row, add `position: 'relative'` to the row root `<div>`'s existing `style` object (it currently has `{ ...ROW_COLS, minHeight: 44, padding: '7px 16px', ... }`). Change it to include `position: 'relative'`.

Add the drag handle. It appears on hover or when the row is selected, sits in the leading `aria-hidden` cell, and is the only draggable element. Replace the existing `<span aria-hidden="true" />` (first grid cell, ~line 835) with:

```jsx
<span
  draggable data-noselect
  onDragStart={e => dnd.startCategoryDrag(e, cat.id)}
  onDragEnd={dnd.endDrag}
  title="Drag to reorder or move"
  aria-label={'Drag ' + cat.name}
  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'var(--muted)', opacity: selected.has(cat.id) ? 0.9 : 0, fontSize: 13, lineHeight: 1 }}
  className="plan-drag-handle"
>⠿</span>
```

The `data-noselect` attribute makes the existing row-click guard (`e.target.closest('... [data-noselect]')` at ~line 833) skip selection when the handle is used. To reveal the handle on row hover, add a CSS rule. Find the existing Plan hover styles (search `hv-text`/`hv-soft` usage; the app ships utility hover classes) — add a scoped rule in the same stylesheet that defines them (`src/index.css` or the file where `.hv-*` live; grep `.hv-soft {`):

```css
.plan-row:hover .plan-drag-handle { opacity: 0.9; }
```

Add the `plan-row` class to the `CategoryRow` root `<div>` (`className="plan-row"`).

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: clean.

- [ ] **Step 5: Manual verification (record result in the commit body)**

Start the app (`npm run dev` or the project's `run` skill), open the Budget/Plan screen, and confirm:
- Hovering a category row reveals a `⠿` handle on the left; selected rows show it persistently.
- Dragging a handle within a group shows a 2px accent line at the insertion point and drops the category there.
- Dragging into another group moves it; dragging into the "Other" section ungroups it.
- Selecting several categories, then dragging one selected handle, moves all of them contiguously.
- Row click / rename popover / checkbox still work (handle drag never triggers selection).

- [ ] **Step 6: Commit**

```bash
git add src/screens/Plan.jsx src/index.css
git commit -m "feat(plan): category drag handle + insertion line (B/C/D)"
```

(Adjust the CSS path in `git add` to wherever the `.hv-*` classes live.)

---

### Task 5: Group drag handle, group reorder, and header drop target

Give `GroupRow` a drag handle that reorders groups (A), draw the group insertion line, and make the group header a drop target for categories so collapsed and empty groups can receive a drop at their top.

**Files:**
- Modify: `src/screens/Plan.jsx` — `GroupRow` (destructure ~line 391; root `<div>` ~line 420s) and the render loop (~line 1177 to pass the next group's id for the "before" slot and the group's first category id).

**Interfaces:**
- Consumes: `ctx.dnd`, `sectionGroupId` semantics from Task 4.
- Produces: a `beforeGroupId` + `firstCatId` prop on `GroupRow`.

- [ ] **Step 1: Pass slot info into `GroupRow`**

In the render loop, compute and pass the id of the NEXT section's group (so dropping "on" a group means "insert before it") and this group's first category. Update the loop (~line 1177):

```jsx
{shownSections.map(({ group, key, cats, totals }, i) => {
  const isCollapsed = collapsed.has(key);
  const nextGroup = shownSections[i + 1]?.group;
  return (
    <div key={key ?? 'other'}>
      <GroupRow group={group} totals={totals} cats={cats} collapsed={isCollapsed}
        beforeGroupId={group.id} firstCatId={cats[0]?.id ?? null}
        onToggle={() => toggleGroup(key)} ctx={ctx} />
      {!isCollapsed && cats.map(cat => (
        <CategoryRow key={cat.id} cat={cat} row={env.rows.get(cat.id)} sectionGroupId={group.id} ctx={ctx} />
      ))}
    </div>
  );
})}
```

Note: `beforeGroupId={group.id}` means a group dropped onto this header lands *before* this group. `nextGroup` is not needed as a prop with this "before" convention, but keep the `i`/`nextGroup` binding out if unused — remove `const nextGroup` if lint flags it.

- [ ] **Step 2: Wire the group handle, reorder line, and header drop target**

In `GroupRow`, add `beforeGroupId` and `firstCatId` to the signature (~line 391) and `dnd` to the `ctx` destructure (which currently reads `const { S, applyData, money, selected, setMany } = ctx;` ~line 392):

```jsx
function GroupRow({ group, totals, cats, collapsed, onToggle, beforeGroupId, firstCatId, ctx }) {
  const { S, applyData, money, selected, setMany, dnd } = ctx;
```

The synthetic "Other" group has `group.id === null`; it must NOT be draggable and must not be a group-reorder target, but it IS a category drop target (drop → ungroup). Compute:

```js
const isOther = group.id == null;
const showGroupLineAbove = dnd.target && dnd.target.kind === 'group'
  && dnd.target.beforeId === group.id && dnd.drag?.ids[0] !== group.id && !isOther;
```

On the `GroupRow` root `<div>` (~line 420), add `position: 'relative'` to its style and these handlers so it accepts BOTH a group-reorder drop and a category-into-this-group drop:

```jsx
onDragOver={e => {
  if (dnd.drag?.kind === 'group') dnd.overGroupGap(e, { beforeGroupId });
  else if (dnd.drag?.kind === 'category') dnd.overGroupHeader(e, { groupId: group.id, firstCatId });
}}
onDrop={dnd.drop}
```

Add the group insertion line as the first child of the root `<div>`:

```jsx
{showGroupLineAbove && (
  <div aria-hidden="true" style={{ position: 'absolute', left: 16, right: 16, marginTop: -8, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
)}
```

Add a drag handle for real groups only (not "Other"). Place it just before the group name element (the `<span>`/`EditNamePopover` at ~line 426). Wrap in `{!isOther && (...)}`:

```jsx
{!isOther && (
  <span
    draggable data-noselect
    onDragStart={e => dnd.startGroupDrag(e, group.id)}
    onDragEnd={dnd.endDrag}
    title="Drag to reorder group"
    aria-label={'Drag group ' + group.name}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'var(--muted)', opacity: 0, fontSize: 13, lineHeight: 1, flex: 'none' }}
    className="plan-drag-handle"
  >⠿</span>
)}
```

Add `className="plan-row"` to the `GroupRow` root `<div>` so the shared `.plan-row:hover .plan-drag-handle` rule from Task 4 reveals it.

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: clean.

- [ ] **Step 4: Manual verification**

On the Plan screen confirm:
- Group rows show a `⠿` handle on hover; dragging it reorders groups with an accent insertion line; "Other" has no handle and never accepts a group drop below it.
- Dragging a category onto a group header (including a collapsed or empty group) drops it in at the top of that group; the group stays collapsed if it was.
- The group's existing collapse chevron, rename popover, hover "+", and checkbox still work.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Plan.jsx
git commit -m "feat(plan): group drag reorder + header drop target (A)"
```

---

### Task 6: Drag ghost and edge auto-scroll

Replace the browser's default drag image with a compact chip (name, or a count badge for multi-drag) and auto-scroll the list when dragging near its top/bottom edge.

**Files:**
- Modify: `src/ui/plan/usePlanDnd.js` (ghost node in `startCategoryDrag`/`startGroupDrag`; auto-scroll in a drag-over-aware handler)
- Modify: `src/screens/Plan.jsx` (attach the scroll container ref if needed)

**Interfaces:**
- Consumes/Produces: same hook API as Task 3, plus an internal `setDragImage` node. No new exported names.

- [ ] **Step 1: Add the ghost chip**

In `usePlanDnd.js`, add a helper that builds an off-screen node and calls `setDragImage`. Put it above the hook:

```js
// Build a compact drag ghost and register it with the drag event. The node is
// appended off-screen (the DnD spec requires it to be in the document at
// setDragImage time) and removed on the next tick.
function setGhost(e, label) {
  const chip = document.createElement('div');
  chip.textContent = label;
  chip.style.cssText = 'position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;'
    + 'background:var(--accent);color:var(--on-accent);font-size:13px;font-weight:700;'
    + 'box-shadow:var(--shadow);white-space:nowrap;';
  document.body.appendChild(chip);
  e.dataTransfer.setDragImage(chip, 12, 12);
  setTimeout(() => chip.remove(), 0);
}
```

In `startCategoryDrag`, after computing `ids`, call it:

```js
const ids = dragIdsFor(catId, selected, visibleCatIdList);
setGhost(e, ids.length > 1 ? ids.length + ' categories' : (document.getElementById('cat-name-' + catId)?.textContent || 'Category'));
setDrag({ kind: 'category', ids });
```

(If a per-row name id is not already present, pass the name in from the row instead: change `startCategoryDrag(e, catId)` to `startCategoryDrag(e, catId, name)` and have `CategoryRow` pass `cat.name`. Prefer passing the name — simpler than a DOM lookup. Update the Task 4 call site to `dnd.startCategoryDrag(e, cat.id, cat.name)` and the signature to `(e, catId, label)`, using `label` for the single-drag ghost text.)

In `startGroupDrag`, call `setGhost(e, name)` (pass the group name in the same way: `startGroupDrag(e, groupId, name)` and `dnd.startGroupDrag(e, group.id, group.name)` at the Task 5 call site).

- [ ] **Step 2: Add edge auto-scroll**

Add a module-level helper and call it from the `overCategory`/`overGroupGap`/`overGroupHeader` handlers (they already fire continuously on `dragover`). Add near the top of the hook file:

```js
// Auto-scroll the nearest scrollable ancestor when the pointer nears its top or
// bottom edge during a drag, so long category lists stay draggable.
function edgeAutoScroll(e) {
  const EDGE = 48, STEP = 12;
  let el = e.target;
  while (el && el !== document.body) {
    const canScroll = el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
    if (canScroll) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + EDGE) { el.scrollTop -= STEP; return; }
      if (e.clientY > r.bottom - EDGE) { el.scrollTop += STEP; return; }
      return;
    }
    el = el.parentElement;
  }
}
```

Call `edgeAutoScroll(e)` as the first line inside `overCategory`, `overGroupHeader`, and `overGroupGap` (after their `e.preventDefault()`).

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: clean.

- [ ] **Step 4: Manual verification**

- A drag shows the accent chip near the cursor; multi-drag shows "N categories".
- Dragging toward the top/bottom of a long list scrolls it.

- [ ] **Step 5: Full suite + build + commit**

```bash
npx vitest run && npx vite build
git add src/ui/plan/usePlanDnd.js src/screens/Plan.jsx
git commit -m "feat(plan): drag ghost chip + edge auto-scroll"
```

---

### Task 7: End-to-end verification pass and spec sign-off

A dedicated Playwright pass driving real drags, since native HTML5 DnD + `setDragImage` cannot be exercised under the jsdom-free unit setup.

**Files:** none (verification only; fixes, if any, go back into the relevant task's files).

- [ ] **Step 1: Delegate a live browser test**

Per project memory ("Playwright testing subagent"), dispatch a subagent to drive the app in a real browser and verify every goal against the spec's acceptance criteria:
- A. Reorder groups (drag group handle to an exact slot; "Other" stays pinned last and rejects a below-drop).
- B. Reorder a category within its group.
- C. Move a category to another group at an exact position, and into "Other" (ungroup).
- D. Multi-select 2–3 categories and drag them contiguously into another group and within a group.
- Insertion line + ghost render; collapsed/empty group header accepts a top drop; auto-scroll works.
- Undo/redo reverses each operation (they go through `applyData`).
- Existing row interactions (select, shift/cmd range, rename popover, checkboxes, collapse chevron, hover "+") are unbroken.
Have the subagent fix any issues it finds and re-verify.

- [ ] **Step 2: Final green gate**

Run: `npx vitest run && npx vite build`
Expected: all tests pass, build clean.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test(plan): verify drag-and-drop end-to-end; fixes from live pass"
```

---

## Self-Review

**Spec coverage:**
- Goal A (reorder groups) → Task 2 (reducer) + Task 5 (UI). ✓
- Goal B (reorder within group) → Task 1 + Task 4. ✓
- Goal C (move between groups) → Task 1 + Task 4/5. ✓
- Goal D (multi-drag) → Task 1 (`ids[]`) + Task 3 (`dragIdsFor`) + Task 4. ✓
- Drag handle → Task 4 (category) + Task 5 (group). ✓
- Precise insertion line → Task 4 + Task 5. ✓
- Drag ghost + multi-count badge → Task 6. ✓
- Collapsed/empty group drop at top → Task 5 (`overGroupHeader`, `firstCatId`). ✓
- "Other" bucket: droppable to ungroup, never draggable, pinned last → Task 4 (`sectionGroupId=null`) + Task 5 (`isOther` guards). ✓
- Multi-drag lands contiguous in visible order; cross-group selection allowed → Task 1 tests + Task 3 `dragIdsFor`. ✓
- Auto-scroll → Task 6. ✓
- Undo/redo automatic via `applyData` → Task 7 verification. ✓
- Reducers pure + same-ref no-op, unit-tested; UI verified manually/Playwright (no jsdom) → Tasks 1–3 tests, Tasks 4–7 manual/Playwright. ✓
- Only `groupId`/`sortOrder` change; no new deps; desktop-only → Global Constraints, enforced in reducer code. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. Task 4 flags one lookup the implementer must confirm — the file that defines `.hv-*` utility classes (grep `.hv-soft {`) — with an explicit grep to resolve it, not a placeholder.

**Type consistency:** `moveCategories({ ids, groupId, beforeId })`, `reorderCategoryGroup({ id, beforeId })`, `dragIdsFor(catId, selected, visibleCatIdList)`, and the `usePlanDnd` return shape (`drag`, `target`, `startCategoryDrag`, `startGroupDrag`, `overCategory`, `overGroupHeader`, `overGroupGap`, `drop`, `endDrag`) are used identically across Tasks 3–6. `target` shapes (`{kind:'category',groupId,beforeId}` / `{kind:'group',beforeId}`) match the `drop` dispatch. ✓
