# Envelope Phase 4 — Views, Activity, Recent Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Plan screen's filter/view pill bar (built-in filters + user-defined category views), the ACTIVITY drill-down modal, and the global Recent Moves panel.

**Architecture:** Two pure modules (`src/lib/planViews.js`, `src/lib/moves.js`) hold all filtering, view-repair and audit-parsing logic and are unit-tested; four new components under `src/ui/plan/` render them; `src/screens/Plan.jsx` stores the active view and the user's custom views in the existing device-local `prefs` and pipes `sections` through the filter before rendering.

**Tech Stack:** React 18 + Vite, vitest, inline styles over CSS-variable tokens, existing `FocusTrap`/scrim modal pattern (`src/ui/ShortcutHelpModal.jsx`), existing audit log as the Recent Moves data source.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-envelope-budget-phase4-views-design.md`. YNAB structure captured live 2026-08-09 (§Captured YNAB reference).
- **Ship exactly three built-in pills: All · Overspent · Money Available.** Do NOT add Underfunded / Overfunded / Snoozed — they require targets or snoozing, which do not exist (verified live: Underfunded duplicates Overspent without targets).
- **Custom views live in device-local `prefs`**, shape `{ id, name, categoryIds: [], sortOrder }` — no migration, no sync collection. `prefs` is written with the existing `setPrefs(patch)` from `useStore()`.
- **`normalizeViews` runs on every read of `prefs.planViews`** — localStorage is user-editable and outlives categories.
- **Group totals never change with the filter.** Filtering hides rows; it must not recompute group or month totals into filtered subtotals.
- **Prune `selected` to visible categories whenever the active view changes** — a hidden selected row must never remain actionable.
- **Boundary rule: `available === 0` matches neither Overspent nor Money Available.**
- Overspent pill: count prefix + `var(--neg-soft)`/`var(--neg)` tint when count > 0; selected pill: `var(--soft)` + 1.5px `var(--accent)` border. Pills 25px tall, radius 5, 12px/500, padding `3px 12px`.
- Modals follow `src/ui/ShortcutHelpModal.jsx`: fixed scrim (`var(--scrim)`, zIndex 60) + `FocusTrap` + `role="dialog" aria-modal="true"` + Escape on the **capture** phase with `stopPropagation`.
- All components module-scope (guard test scans `src/screens/*.jsx`).
- Copy (exact): "All" · "Overspent" · "Money Available" · "Manage Views" · "New View" · "New Custom View" · "View Name" · placeholder "Keep 'em short & sweet!" · "Done" · "Activity" · "Account"/"Date"/"Payee"/"Memo"/"Amount" · "Close" · "Recent Moves" · "Moved" · "Assigned" · "Today"/"Yesterday"/"N days ago" · "Ready to Assign".

---

### Task 1: View filtering module — `src/lib/planViews.js`

**Files:**
- Create: `src/lib/planViews.js`
- Test: `tests/plan-views.test.js`

**Interfaces:**
- Consumes: the envelope fold's `env.rows: Map<catId, {assigned, activity, available, carryIn}>`; the Plan screen's `sections` shape `[{ group, key, cats, totals }]`.
- Produces: `BUILTIN_VIEWS`, `isBuiltin(id)`, `countFor(id, env, catIds)`, `matchesView(view, cat, env)`, `visibleSections(sections, view, env)`, `normalizeViews(raw, cats)`, `reorderViews(views, fromId, toId)`, `newView(name, categoryIds, existing)`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/plan-views.test.js
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_VIEWS, isBuiltin, countFor, matchesView, visibleSections,
  normalizeViews, reorderViews, newView,
} from '../src/lib/planViews.js';

const cat = (id, name) => ({ id, name, type: 'expense', status: 'active' });
const CATS = [cat('a', 'Groceries'), cat('b', 'Fuel'), cat('c', 'Rent')];
const env = {
  rows: new Map([
    ['a', { assigned: 100, activity: -20, available: 80, carryIn: 0 }],   // money available
    ['b', { assigned: 100, activity: -150, available: -50, carryIn: 0 }], // overspent
    ['c', { assigned: 100, activity: -100, available: 0, carryIn: 0 }],   // exactly zero
  ]),
};
const SECTIONS = [
  { group: { id: 'g1', name: 'Needs' }, key: 'g1', cats: [CATS[0], CATS[1]], totals: { assigned: 200, activity: -170, available: 30 } },
  { group: { id: 'g2', name: 'Bills' }, key: 'g2', cats: [CATS[2]], totals: { assigned: 100, activity: -100, available: 0 } },
];
const view = id => BUILTIN_VIEWS.find(v => v.id === id);

describe('built-in views', () => {
  it('exposes exactly All, Overspent and Money Available', () => {
    expect(BUILTIN_VIEWS.map(v => v.id)).toEqual(['all', 'overspent', 'available']);
    expect(BUILTIN_VIEWS.map(v => v.label)).toEqual(['All', 'Overspent', 'Money Available']);
    expect(isBuiltin('all')).toBe(true);
    expect(isBuiltin('v_custom')).toBe(false);
  });
  it('treats available === 0 as neither overspent nor available', () => {
    expect(matchesView(view('overspent'), CATS[2], env)).toBe(false);
    expect(matchesView(view('available'), CATS[2], env)).toBe(false);
    expect(matchesView(view('all'), CATS[2], env)).toBe(true);
  });
  it('matches on the sign of available', () => {
    expect(matchesView(view('overspent'), CATS[1], env)).toBe(true);
    expect(matchesView(view('available'), CATS[0], env)).toBe(true);
    expect(matchesView(view('available'), CATS[1], env)).toBe(false);
  });
  it('counts only for overspent (badge); all/available report 0', () => {
    const ids = CATS.map(c => c.id);
    expect(countFor('overspent', env, ids)).toBe(1);
    expect(countFor('all', env, ids)).toBe(0);
    expect(countFor('available', env, ids)).toBe(0);
  });
});

describe('custom views', () => {
  it('matches by explicit category id set', () => {
    const v = { id: 'v1', name: 'Fixed', categoryIds: ['c'], sortOrder: 1 };
    expect(matchesView(v, CATS[2], env)).toBe(true);
    expect(matchesView(v, CATS[0], env)).toBe(false);
  });
  it('newView assigns a unique id and appends after existing views', () => {
    const a = newView('Fixed', ['c'], []);
    expect(a.sortOrder).toBe(0);
    expect(a.categoryIds).toEqual(['c']);
    const b = newView('Fun', ['a'], [a]);
    expect(b.sortOrder).toBe(1);
    expect(b.id).not.toBe(a.id);
  });
});

describe('visibleSections', () => {
  it('returns sections untouched for All', () => {
    expect(visibleSections(SECTIONS, view('all'), env)).toEqual(SECTIONS);
  });
  it('drops groups with no matching child but keeps TRUE group totals', () => {
    const out = visibleSections(SECTIONS, view('overspent'), env);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('g1');
    expect(out[0].cats.map(c => c.id)).toEqual(['b']);
    expect(out[0].totals).toEqual(SECTIONS[0].totals); // NOT recomputed for the filtered subset
  });
  it('returns an empty array when nothing matches', () => {
    const v = { id: 'v2', name: 'None', categoryIds: [], sortOrder: 0 };
    expect(visibleSections(SECTIONS, v, env)).toEqual([]);
  });
});

describe('normalizeViews', () => {
  it('drops category ids that no longer exist and views left empty', () => {
    const raw = [
      { id: 'v1', name: 'Mixed', categoryIds: ['a', 'gone'], sortOrder: 0 },
      { id: 'v2', name: 'Dead', categoryIds: ['gone'], sortOrder: 1 },
    ];
    const out = normalizeViews(raw, CATS);
    expect(out).toHaveLength(1);
    expect(out[0].categoryIds).toEqual(['a']);
  });
  it('repairs junk: non-array input, missing fields, duplicate ids, long names, bad order', () => {
    expect(normalizeViews(null, CATS)).toEqual([]);
    expect(normalizeViews('nope', CATS)).toEqual([]);
    const out = normalizeViews([
      { id: 'v2', name: 'Second', categoryIds: ['a', 'a'], sortOrder: 5 },
      { id: 'v1', name: 'x'.repeat(80), categoryIds: ['b'] },
      { id: 'v2', name: 'Duplicate id', categoryIds: ['b'], sortOrder: 9 },
      { name: 'No id', categoryIds: ['a'] },
    ], CATS);
    // v1 carries no sortOrder (-> 999), so it sorts AFTER v2 (5); the
    // duplicate id and the id-less entry are both dropped.
    expect(out.map(v => v.id)).toEqual(['v2', 'v1']);
    expect(out[0].categoryIds).toEqual(['a']);              // de-duped
    expect(out[1].name).toHaveLength(40);                   // truncated
    expect(out.map(v => v.sortOrder)).toEqual([0, 1]);      // resequenced
  });
});

describe('reorderViews', () => {
  const V = [
    { id: 'v1', name: 'A', categoryIds: ['a'], sortOrder: 0 },
    { id: 'v2', name: 'B', categoryIds: ['b'], sortOrder: 1 },
    { id: 'v3', name: 'C', categoryIds: ['c'], sortOrder: 2 },
  ];
  it('moves first to last and resequences', () => {
    const out = reorderViews(V, 'v1', 'v3');
    expect(out.map(v => v.id)).toEqual(['v2', 'v3', 'v1']);
    expect(out.map(v => v.sortOrder)).toEqual([0, 1, 2]);
  });
  it('moves last before first', () => {
    expect(reorderViews(V, 'v3', 'v1').map(v => v.id)).toEqual(['v3', 'v1', 'v2']);
  });
  it('no-ops for same/unknown ids', () => {
    expect(reorderViews(V, 'v2', 'v2')).toEqual(V);
    expect(reorderViews(V, 'nope', 'v1')).toEqual(V);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/plan-views.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/planViews.js"`.

- [ ] **Step 3: Implement `src/lib/planViews.js`**

```js
// Plan-screen filter views (Phase 4). Two kinds share one shape so the pill bar
// and the filter path never branch on kind: BUILT-INS carry a `match` predicate
// over the envelope row; CUSTOM views carry an explicit `categoryIds` set.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase4-views-design.md
//
// Underfunded/Overfunded/Snoozed are deliberately absent: they need targets or
// snoozing. Verified live against YNAB that, with no targets, "Underfunded"
// returns exactly the same rows as "Overspent".
const availOf = (env, id) => (env.rows.get(id) || { available: 0 }).available;

export const BUILTIN_VIEWS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All', match: null }),
  Object.freeze({ id: 'overspent', label: 'Overspent', match: (cat, env) => availOf(env, cat.id) < 0 }),
  Object.freeze({ id: 'available', label: 'Money Available', match: (cat, env) => availOf(env, cat.id) > 0 }),
]);

export const isBuiltin = id => BUILTIN_VIEWS.some(v => v.id === id);

// Only Overspent shows a badge (YNAB shows no count on the others).
export function countFor(id, env, catIds) {
  if (id !== 'overspent') return 0;
  return catIds.reduce((n, cid) => n + (availOf(env, cid) < 0 ? 1 : 0), 0);
}

export function matchesView(view, cat, env) {
  if (!view || view.id === 'all') return true;
  if (view.match) return !!view.match(cat, env);
  return (view.categoryIds || []).includes(cat.id);
}

// Hides rows, never numbers: `totals` is carried through untouched so a group's
// figures mean the same thing in every view.
export function visibleSections(sections, view, env) {
  if (!view || view.id === 'all') return sections;
  const out = [];
  for (const s of sections) {
    const cats = s.cats.filter(c => matchesView(view, c, env));
    if (cats.length) out.push({ ...s, cats });
  }
  return out;
}

const MAX_NAME = 40;

// prefs live in localStorage: user-editable, and they outlive the categories
// they reference. Every read is repaired rather than trusted.
export function normalizeViews(raw, cats) {
  if (!Array.isArray(raw)) return [];
  const live = new Set((cats || []).map(c => c.id));
  const seen = new Set();
  return raw
    .filter(v => v && typeof v.id === 'string' && !seen.has(v.id) && seen.add(v.id) !== false)
    .map(v => ({
      id: v.id,
      name: String(v.name || 'Untitled').slice(0, MAX_NAME),
      categoryIds: [...new Set((Array.isArray(v.categoryIds) ? v.categoryIds : []).filter(id => live.has(id)))],
      sortOrder: Number.isFinite(v.sortOrder) ? v.sortOrder : 999,
    }))
    .filter(v => v.categoryIds.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v, i) => ({ ...v, sortOrder: i }));
}

export function reorderViews(views, fromId, toId) {
  if (fromId === toId) return views;
  const from = views.findIndex(v => v.id === fromId);
  const to = views.findIndex(v => v.id === toId);
  if (from < 0 || to < 0) return views;
  const next = [...views];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((v, i) => ({ ...v, sortOrder: i }));
}

export function newView(name, categoryIds, existing) {
  return {
    id: 'v_' + Math.random().toString(36).slice(2, 10),
    name: String(name || '').slice(0, MAX_NAME),
    categoryIds: [...new Set(categoryIds || [])],
    sortOrder: (existing || []).length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/plan-views.test.js` → all pass.

- [ ] **Step 5: Full suite + build, then commit**

Run `npx vitest run` and `npx vite build` — both clean.

```bash
git add src/lib/planViews.js tests/plan-views.test.js
git commit -m "feat(plan): view filtering module — built-ins, custom views, prefs repair"
```

---

### Task 2: Recent Moves on the Plan screen (reuse the existing panel)

**Files:**
- Modify: `src/screens/Plan.jsx`

**Context — read before writing anything:** a complete Recent Moves panel ALREADY EXISTS and is live on the Transactions screen. `src/components/RecentMoves.jsx` is fully self-contained: it renders its own trigger button (clock icon + "Recent Moves"), owns its open state and dismissal contract, and renders a day-grouped panel with All/Money/Plans/Setup filter chips and per-filter counts. It is backed by the pure, already-tested `src/lib/moves.js` (`MOVE_FILTERS`, `filterMoves`, `groupMovesByDay`, `moveCount`).

**Do NOT create a new moves module, a new parser, or a new modal.** Duplicating either file is the failure mode this task exists to avoid.

**Interfaces:**
- Consumes: `RecentMoves` (default export, takes NO props) from `src/components/RecentMoves.jsx`.
- Produces: nothing new — the Plan screen simply gains the existing control.

- [ ] **Step 1: Read the existing component and its call site**

Read `src/components/RecentMoves.jsx` in full and look at how `src/screens/Transactions.jsx` mounts it (`<RecentMoves />`, around line 677) — note the toolbar row it sits in and the surrounding controls, so the Plan screen placement matches the app's existing idiom.

- [ ] **Step 2: Mount it on the Plan toolbar**

In `src/screens/Plan.jsx`, import it (`import RecentMoves from '../components/RecentMoves.jsx';`) and render `<RecentMoves />` in the existing toolbar row that holds `ViewToggle` and `AddGroupButton` — placed BEFORE `ViewToggle` so the row reads: Recent Moves · view toggle · add group. Change nothing else about that row, and pass no props (the component takes none).

- [ ] **Step 3: Verify**

Run `npx vitest run` (expect the suite unchanged at 654 — this task adds no tests because it adds no logic) and `npx vite build` (clean). On the dev server: the Plan screen shows a "Recent Moves" button; clicking it opens the panel with real audit rows; the filter chips and counts work; Escape and outside-click dismiss it; the Transactions screen's copy still works exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Plan.jsx
git commit -m "feat(plan): surface the existing Recent Moves panel on the Plan screen"
```

---

### Task 3: Filter pill bar + Plan wiring

**Files:**
- Create: `src/ui/plan/FilterPills.jsx`
- Modify: `src/screens/Plan.jsx`

**Interfaces:**
- Consumes: `BUILTIN_VIEWS`, `countFor`, `visibleSections`, `normalizeViews` (Task 1).
- Produces: `prefs.planViewId` (string, default `'all'`) and `prefs.planViews` (array) as the persisted contract Task 4 edits; `<FilterPills views activeId onSelect onManage onNewView env catIds />`.

- [ ] **Step 1: Build `src/ui/plan/FilterPills.jsx`**

```jsx
// Plan filter pills (Phase 4). Built-ins first, then the user's custom views in
// sortOrder, then a ⋯ menu (Manage Views / New View). Tokens captured from
// YNAB's pill bar: 25px tall, radius 5, 12px/500, 3px 12px padding.
import { useRef, useState } from 'react';
import { BUILTIN_VIEWS, countFor } from '../../lib/planViews.js';

const pillBase = { height: 25, padding: '3px 12px', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', border: '1.5px solid transparent', background: 'var(--elev)', color: 'var(--text)' };

export default function FilterPills({ views, activeId, onSelect, onManage, onNewView, env, catIds }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // Built-ins carry `label`, custom views carry `name` — normalize once here so
  // the pill renderer below has exactly one concept to render.
  const all = [...BUILTIN_VIEWS, ...views.map(v => ({ ...v, label: v.name }))];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {all.map(v => {
        const active = v.id === activeId;
        const count = countFor(v.id, env, catIds);
        const danger = v.id === 'overspent' && count > 0;
        return (
          <button key={v.id} onClick={() => onSelect(v.id)} aria-pressed={active}
            style={{ ...pillBase,
              background: active ? 'var(--soft)' : danger ? 'var(--neg-soft)' : 'var(--elev)',
              color: danger && !active ? 'var(--neg)' : 'var(--text)',
              borderColor: active ? 'var(--accent)' : 'transparent' }}>
            {count > 0 ? count + ' ' + v.label : v.label}
          </button>
        );
      })}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button onClick={() => setMenuOpen(o => !o)} aria-label="Views menu" aria-expanded={menuOpen}
          style={{ ...pillBase, padding: '3px 10px' }}>⋯</button>
        {menuOpen && (
          <div role="menu" style={{ position: 'absolute', top: 30, left: 0, zIndex: 40, minWidth: 150, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', padding: 4 }}>
            <button role="menuitem" className="hv-soft" onClick={() => { setMenuOpen(false); onManage(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Manage Views</button>
            <button role="menuitem" className="hv-soft" onClick={() => { setMenuOpen(false); onNewView(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>New View</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Dismiss the ⋯ menu with the screen's existing `usePopoverDismiss` contract: since that hook lives in `Plan.jsx`, replicate its two listeners inline here with a `useEffect` (outside mousedown closes; Escape closes on the capture phase with `stopPropagation`), guarded on `menuOpen`.

- [ ] **Step 2: Wire into `src/screens/Plan.jsx`**

In `Plan()`, after the existing `sections` memo:

```js
const views = useMemo(() => normalizeViews(prefs.planViews, S.categories), [prefs.planViews, S.categories]);
const activeViewId = prefs.planViewId || 'all';
const activeView = useMemo(
  () => BUILTIN_VIEWS.find(v => v.id === activeViewId) || views.find(v => v.id === activeViewId) || BUILTIN_VIEWS[0],
  [activeViewId, views],
);
const shownSections = useMemo(() => visibleSections(sections, activeView, env), [sections, activeView, env]);
const visibleCatIds = useMemo(() => new Set(shownSections.flatMap(s => s.cats.map(c => c.id))), [shownSections]);

// A selected row that the active view hides must not stay actionable.
useEffect(() => {
  setSelected(prev => {
    const next = new Set([...prev].filter(id => visibleCatIds.has(id)));
    return next.size === prev.size ? prev : next;
  });
}, [visibleCatIds]);
```

Render `<FilterPills … />` directly above the table card, passing `catIds={activeCatIds}`, and **replace `sections.map(...)` with `shownSections.map(...)`** in the table body. Keep the header row and every existing control unchanged.

Add an empty state when `shownSections.length === 0`: a centered muted line inside the table card — `No categories match this view.` plus a "Show all" button calling `setPrefs({ planViewId: 'all' })`.

Handlers: `onSelect={id => setPrefs({ planViewId: id })}`, plus `manageOpen` / `editing` state for Task 4's modals.

- [ ] **Step 3: Verify**

`npx vitest run` green, `npx vite build` clean. On the dev server: pills render; Overspent shows a count and red tint; clicking filters rows while group totals stay identical; an empty view shows the empty state; selecting a row then switching to a view that hides it clears the selection.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/FilterPills.jsx src/screens/Plan.jsx
git commit -m "feat(plan): filter pill bar with built-in views"
```

---

### Task 4: View editor + Manage Views modals

**Files:**
- Create: `src/ui/plan/ViewEditorModal.jsx`, `src/ui/plan/ManageViewsModal.jsx`
- Modify: `src/screens/Plan.jsx` (mount both, wire prefs writes)

**Interfaces:**
- Consumes: `newView`, `reorderViews`, `normalizeViews` (Task 1); `prefs.planViews` (Task 3).
- Produces: `<ViewEditorModal open view groups onSave onCancel />` (`view = null` → create), `<ManageViewsModal open views onReorder onRename onDelete onNew onClose />`.

- [ ] **Step 1: `ViewEditorModal.jsx`**

Modal per the `ShortcutHelpModal` pattern (scrim + `FocusTrap` + `role="dialog" aria-modal="true"` + capture-phase Escape). Title `New Custom View` when creating, `Edit View` when editing. Body: the paragraph "Choose a set of categories to include in this custom view."; a **View Name** label + input (`placeholder="Keep 'em short & sweet!"`, `maxLength={40}`, autofocus); then "Select the categories below to include." and, per group in `sortOrder`, a group heading with a group-level "Select all" checkbox and one checkbox per active expense category (reuse `src/ui/Checkbox.jsx` if its API fits; otherwise a plain `<input type="checkbox">` with `accentColor: 'var(--accent)'`). Footer: Cancel + Save; **Save disabled until the name is non-empty and ≥1 category is checked**. Save calls `onSave({ name, categoryIds })`.

- [ ] **Step 2: `ManageViewsModal.jsx`**

Title "Manage Views". One row per custom view: drag handle (`draggable`, `onDragStart` setting the dragged id, `onDragOver` preventDefault, `onDrop` calling `onReorder(fromId, toId)`), the name (click to rename inline via a text input committing on blur/Enter, Escape cancels), **↑ and ↓ buttons** calling `onReorder` with the neighbouring id (disabled at the ends), and a Delete button. Delete goes through the existing `ask()` confirm from `useUI()` naming the view, tone `neg`. Empty state: "No custom views yet." Footer: **New View** (secondary) + **Done** (primary).

Keyboard reordering is not optional — drag-only is unusable by keyboard and touch users, and this list is the only way to reorder.

- [ ] **Step 3: Wire in `Plan.jsx`**

```js
const [manageOpen, setManageOpen] = useState(false);
const [editing, setEditing] = useState(null); // null | 'new' | view object
const writeViews = next => setPrefs({ planViews: next });
```
- Save (create): `writeViews([...views, newView(name, categoryIds, views)])`, then select the new view.
- Save (edit): replace by id, preserving `sortOrder`.
- Delete: `writeViews(views.filter(v => v.id !== id))`; if it was active, fall back to `setPrefs({ planViewId: 'all' })`.
- Reorder: `writeViews(reorderViews(views, fromId, toId))`.

- [ ] **Step 4: Verify**

`npx vitest run` + `npx vite build` green. Dev server: create a view from a few categories → its pill appears and filters correctly; rename, reorder by drag AND by ↑/↓, delete (with confirm); reload the page and the views persist; deleting the active view falls back to All.

- [ ] **Step 5: Commit**

```bash
git add src/ui/plan/ViewEditorModal.jsx src/ui/plan/ManageViewsModal.jsx src/screens/Plan.jsx
git commit -m "feat(plan): custom view editor and Manage Views modal"
```

---

### Task 5: Activity drill-down modal

**Files:**
- Create: `src/ui/plan/ActivityModal.jsx`
- Modify: `src/lib/envelope.js` (export a shared row selector), `src/screens/Plan.jsx` (ACTIVITY cell opens it)
- Test: `tests/category-activity-rows.test.js`

**Why a shared helper:** the envelope fold's per-category activity is NOT `sum(t.amount)` over a naive filter. It (1) skips `pending`, un-occurred, non-expense/refund rows; (2) skips any transaction dated before its account's earliest confirmed snapshot month (`seededAfter` — already embedded in the opening balance); and (3) sums `txBudgetImpact(store, t, { includeExcluded: true })`, not `t.amount` (which differs for refunds, sign, and excluded/recoverable categories). If the modal reimplements this it WILL disagree with the ACTIVITY cell for those cases. So the fold's row-selection is factored into one exported, tested function that both the modal and (optionally) the fold call.

**Interfaces:**
- Consumes: `categoryActivityRows` (new, Task 5) ; `S.accounts`, `money` from `useMoney()`, `monthLabel`.
- Produces: `categoryActivityRows(store, catId, month, now) -> { rows: [{ t, impact }], total }` where `rows` are the transactions contributing to that category's activity in `month` (newest first), `impact` is each row's signed activity contribution (negative = spending), and `total` equals the category's `activity` from `envelopeFor(store, month, now).rows.get(catId)`. And `<ActivityModal open cat month S money onClose />`.

- [ ] **Step 1: Write the failing test** (`tests/category-activity-rows.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { envelopeFor, categoryActivityRows } from '../src/lib/envelope.js';

const NOW = '2026-08-20T12:00:00.000Z';
const store = () => ({
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
  categoryGroups: [], assignments: [{ id: 'a', category: 'groc', month: '2026-08', amount: 10000 }],
  accounts: [{ id: 'acc', nickname: 'Cash', type: 'Current', status: 'active', instId: 'i1' }],
  snapshots: [{ id: 's', accountId: 'acc', month: '2026-07', balance: 0, amount: 0, status: 'confirmed' }],
  transactions: [
    { id: 't1', type: 'expense', category: 'groc', amount: 1500, date: '2026-08-05', status: 'confirmed', accountId: 'acc', payee: 'Store', notes: 'weekly' },
    { id: 't2', type: 'expense', category: 'groc', amount: 900, date: '2026-08-12', status: 'confirmed', accountId: 'acc', payee: 'Market' },
    { id: 't3', type: 'expense', category: 'groc', amount: 999, date: '2026-08-30', status: 'pending', accountId: 'acc' }, // pending, excluded
    { id: 't4', type: 'expense', category: 'groc', amount: 500, date: '2026-06-01', status: 'confirmed', accountId: 'acc' }, // pre-seed month (< 2026-07), excluded
    { id: 't5', type: 'expense', category: 'groc', amount: 40, date: '2026-08-01', status: 'confirmed', accountId: 'acc' },
  ],
  budgets: [], cards: [], recurring: [], audit: [],
});

describe('categoryActivityRows', () => {
  it('selects the same rows the fold counts and totals to the ACTIVITY figure', () => {
    const S = store();
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-08', NOW);
    expect(rows.map(r => r.t.id)).toEqual(['t2', 't1', 't5']); // newest first, no pending, no pre-seed
    const foldActivity = envelopeFor(S, '2026-08', NOW).rows.get('groc').activity;
    expect(total).toBe(foldActivity);
    expect(total).toBe(-2440);
  });
  it('is empty for a category with no counted transactions that month', () => {
    const S = store();
    expect(categoryActivityRows(S, 'groc', '2026-09', NOW)).toEqual({ rows: [], total: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/category-activity-rows.test.js` → FAIL (`categoryActivityRows` not exported).

- [ ] **Step 3: Implement `categoryActivityRows` in `src/lib/envelope.js`**

Factor the row-selection predicate already inside `envelopeFor` into an exported pure function. It must reuse the SAME building blocks that file already has — `earliestOpeningSnapshots` (for the per-account seed months → `seededAfter`), `monthOf`, `hasOccurred` and `txBudgetImpact` — so it can never drift from the fold:

```js
// The transactions that make up ONE category's activity for a month, and their
// signed total (negative = spending). Same predicate as the fold below, so the
// Activity modal (Phase 4) can never disagree with the ACTIVITY cell: not
// pending, occurred, expense/refund, category match, and NOT dated before the
// account's opening-snapshot seed month. Amount is txBudgetImpact, not t.amount.
export function categoryActivityRows(store, catId, month, now) {
  const seed = earliestOpeningSnapshots(store); // accountId -> earliest confirmed snapshot
  const seededAfter = (accountId, m) => { const s = seed.get(accountId); return !!s && s.month > m; };
  const out = [];
  let total = 0;
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending') return;
    if (monthOf(t) !== month) return;
    if (!hasOccurred(t, now)) return;
    if (t.type !== 'expense' && t.type !== 'refund') return;
    if (t.category !== catId) return;
    if (seededAfter(t.accountId, month)) return;
    const impact = txBudgetImpact(store, t, { includeExcluded: true });
    if (!impact) return;
    out.push({ t, impact: -impact }); // spending is negative activity, matching the fold
    total -= impact;
  });
  out.sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : 0));
  return { rows: out, total };
}
```
(`earliestOpeningSnapshots` returns snapshot objects keyed by account; `.month` is the seed month. If the helper is defined below `envelopeFor`, hoist it or move it above — keep it a module-scope function either way.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/category-activity-rows.test.js` → both pass. Then `npx vitest run` (full suite — the fold's own tests must still pass unchanged, proving the factoring didn't alter `envelopeFor`).

- [ ] **Step 5: Build `src/ui/plan/ActivityModal.jsx`**

Modal shell exactly per `src/ui/ShortcutHelpModal.jsx` (scrim `var(--scrim)` zIndex 60, `FocusTrap`, `role="dialog" aria-modal="true" aria-label="Activity"`, capture-phase Escape + stopPropagation, header row with title + × close). Header "Activity", subheader = `cat.name` + " · " + `monthLabel(month)`. Body: a table with columns exactly `Account · Date · Payee · Memo · Amount` from `categoryActivityRows(S, cat.id, month, nowIso()).rows`. Per row: account nickname via `S.accounts.find(a => a.id === t.accountId)?.nickname` (or "—"); date formatted as the app formats transaction dates (check `src/lib/format.js`/existing tx rows — reuse, don't invent); `t.payee || '—'`; the memo = `t.notes || t.memo || ''` (match how the Transactions screen's Memo column reads it — read that screen and mirror it); Amount = `money(row.impact)` right-aligned `.tnum`, sign-colored (`var(--neg)` negative, `var(--pos)` positive). Footer: a **Total** row = `money(total)` (must visibly equal the ACTIVITY cell) and a **Close** button. Empty state when `rows.length === 0`: "No transactions in this category for " + `monthLabel(month)` + ".". Module-scope component.

- [ ] **Step 6: Wire the ACTIVITY cell in `src/screens/Plan.jsx`**

In `CategoryRow`, the activity cell already carries `data-noselect`. Make its number a button (`className="hv-soft"`, `background: 'transparent'`, `border: 'none'`, `cursor: 'pointer'`, underline-on-hover) that calls a handler opening the modal for that category. Keep the `data-noselect` so row-selection is unaffected (verify the guard in the row-click handler still excludes it). Track `activityCat` state in `Plan()` and render ONE `<ActivityModal>` at the screen level, not per row.

- [ ] **Step 7: Verify + commit**

`npx vitest run` + `npx vite build` green. Dev server: click an ACTIVITY figure → modal lists that category's transactions for the month and the **Total equals the cell exactly** (test a category whose activity includes an excluded/recoverable row or a refund, where t.amount != impact); a category with no activity shows the empty state; Escape and Close both dismiss; clicking the figure does not select the row.

```bash
git add src/lib/envelope.js src/ui/plan/ActivityModal.jsx src/screens/Plan.jsx tests/category-activity-rows.test.js
git commit -m "feat(plan): activity drill-down modal over a shared category-activity selector"
```

---


### Task 6: Live verification pass (main session, Playwright — not a subagent)

**Files:** none (verification only; fixes land as scoped commits).

- [ ] **Step 1: Run the spec's live checklist** against real data on the dev server:
  1. Each pill's visible row set matches the predicate recomputed from the table's own AVAILABLE figures.
  2. The Overspent badge equals the number of red pills.
  3. Group totals are byte-identical between All and a filtered view.
  4. Create a view → pill appears, filters correctly; rename; reorder by drag AND by ↑/↓; delete with confirm; all four survive a reload.
  5. Select rows → switch to a view that hides them → selection is empty (no hidden row stays selected).
  6. Activity modal rows sum exactly to the row's ACTIVITY figure.
  7. Recent Moves matches the audit log; Moved + Assigned counts partition All.
  8. Empty-view state renders with a working "Show all".
- [ ] **Step 2: Undo/restore every data mutation** and delete any views created during testing.
- [ ] **Step 3: Commit any fixes as their own scoped commits.**

---

## Self-Review

- **Scope correction (2026-08-09, mid-execution):** the original plan had a Task 2 building a new `src/lib/moves.js` parser and a Task 6 building a new Recent Moves modal. Both were **wrong — a complete, tested Recent Moves panel already existed** (`src/components/RecentMoves.jsx` + `src/lib/moves.js`, live on the Transactions screen). The first implementer overwrote the existing test file; that commit was reverted (suite restored to 654). Task 2 is now "reuse the existing panel on the Plan screen" and the duplicate Task 6 is deleted. Restyling that shared panel to YNAB's assigned/moved wording is deferred — it is used by Transactions too, so it is its own decision, not a silent side effect of this phase.
- **Spec coverage:** filter pills + semantics → T1/T3; custom views (create/edit/reorder/rename/delete, prefs repair) → T1/T4; group-totals invariant and selection pruning → T1/T3; activity modal → T5; recent moves → T2 (reuse); live checklist → T6. Deliberately dropped by the spec (Underfunded/Overfunded/Snoozed, synced views, editing from the Activity modal) have no tasks.
- **Placeholder scan:** none — every code step carries real code, and the two prose-heavy UI tasks (T4–T6) name exact copy, columns, states and the file to mirror.
- **Type consistency:** `normalizeViews(raw, cats)`, `reorderViews(views, fromId, toId)`, `newView(name, categoryIds, existing)`, `countFor(id, env, catIds)`, `visibleSections(sections, view, env)`, `matchesView(view, cat, env)` and `recentMoves(S, { now, days, kind })` are used with those exact signatures in T3–T6; the view shape `{ id, name, categoryIds, sortOrder }` is identical across T1, T3 and T4.
