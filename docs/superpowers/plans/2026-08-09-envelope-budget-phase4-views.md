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
    expect(out.map(v => v.id)).toEqual(['v1', 'v2']);      // dupe dropped, id-less dropped
    expect(out[0].name.length).toBeLessThanOrEqual(40);
    expect(out[1].categoryIds).toEqual(['a']);              // de-duped
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

### Task 2: Recent-moves parsing — `src/lib/moves.js`

**Files:**
- Create: `src/lib/moves.js`
- Test: `tests/moves.test.js`

**Interfaces:**
- Consumes: `S.audit` rows. Exact shapes produced by `src/store/actions.js`:
  - set: `{ entityType: 'assignment', entityId: '<catId>|<month>', action: 'create'|'update'|'delete', after: { amount }, at }`
  - move: `{ entityType: 'assignment', entityId: '<from>><to>|<month>', action: 'move', after: { from, to, amount, month }, at }`
  - import: `{ entityType: 'assignment', entityId: 'import|<month>', action: 'create', at }` (no `after`)
- Produces: `recentMoves(S, { now, days = 34, kind = 'all' }) -> [{ dateKey, dateLabel, relLabel, rows }]` where each row is `{ id, at, verb: 'assigned'|'moved'|'removed'|'imported', amount, from, to, month }` and `from`/`to` are display strings (or null).

- [ ] **Step 1: Write the failing tests**

```js
// tests/moves.test.js
import { describe, it, expect } from 'vitest';
import { recentMoves } from '../src/lib/moves.js';

const NOW = '2026-08-09T12:00:00.000Z';
const S = {
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active' },
  ],
  audit: [
    { id: '1', entityType: 'assignment', action: 'move', entityId: 'groc>fuel|2026-08', after: { from: 'groc', to: 'fuel', amount: 2700, month: '2026-08' }, at: '2026-08-09T09:00:00.000Z' },
    { id: '2', entityType: 'assignment', action: 'update', entityId: 'groc|2026-08', after: { amount: 5000 }, at: '2026-08-08T09:00:00.000Z' },
    { id: '3', entityType: 'assignment', action: 'move', entityId: 'rta>groc|2026-08', after: { from: 'rta', to: 'groc', amount: 100, month: '2026-08' }, at: '2026-08-06T09:00:00.000Z' },
    { id: '4', entityType: 'assignment', action: 'delete', entityId: 'fuel|2026-08', after: { amount: 0 }, at: '2026-08-06T08:00:00.000Z' },
    { id: '5', entityType: 'assignment', action: 'move', entityId: 'gone>groc|2026-08', after: { from: 'gone', to: 'groc', amount: 42, month: '2026-08' }, at: '2026-08-06T07:00:00.000Z' },
    { id: '6', entityType: 'transaction', action: 'create', entityId: 't1', at: '2026-08-09T10:00:00.000Z' },
    { id: '7', entityType: 'assignment', action: 'update', entityId: 'groc|2026-07', after: { amount: 10 }, at: '2026-06-01T09:00:00.000Z' },
  ],
};

describe('recentMoves', () => {
  it('groups by day, newest first, with relative labels', () => {
    const g = recentMoves(S, { now: NOW });
    expect(g.map(x => x.relLabel)).toEqual(['Today', 'Yesterday', '3 days ago']);
    expect(g[0].dateLabel).toBe('09 Aug 2026');
    expect(g[0].rows.map(r => r.id)).toEqual(['1']);
  });
  it('ignores non-assignment audit rows', () => {
    const ids = recentMoves(S, { now: NOW }).flatMap(g => g.rows.map(r => r.id));
    expect(ids).not.toContain('6');
  });
  it('drops rows older than the window', () => {
    const ids = recentMoves(S, { now: NOW, days: 34 }).flatMap(g => g.rows.map(r => r.id));
    expect(ids).not.toContain('7');
  });
  it('resolves rta and deleted categories to display names', () => {
    const rows = recentMoves(S, { now: NOW }).flatMap(g => g.rows);
    const rta = rows.find(r => r.id === '3');
    expect(rta).toMatchObject({ verb: 'moved', from: 'Ready to Assign', to: 'Groceries', amount: 100 });
    expect(rows.find(r => r.id === '5').from).toBe('(deleted category)');
  });
  it('reads set rows: month and category come from entityId, verb from action', () => {
    const rows = recentMoves(S, { now: NOW }).flatMap(g => g.rows);
    expect(rows.find(r => r.id === '2')).toMatchObject({ verb: 'assigned', to: 'Groceries', amount: 5000, month: '2026-08' });
    expect(rows.find(r => r.id === '4')).toMatchObject({ verb: 'removed', to: 'Fuel' });
  });
  it('filters by kind', () => {
    const moved = recentMoves(S, { now: NOW, kind: 'moved' }).flatMap(g => g.rows.map(r => r.id));
    expect(moved).toEqual(['1', '3', '5']);
    const assigned = recentMoves(S, { now: NOW, kind: 'assigned' }).flatMap(g => g.rows.map(r => r.id));
    expect(assigned).toEqual(['2', '4']);
  });
  it('handles an empty/absent audit log', () => {
    expect(recentMoves({ categories: [], audit: [] }, { now: NOW })).toEqual([]);
    expect(recentMoves({ categories: [] }, { now: NOW })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/moves.test.js` → FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/moves.js`**

```js
// Global Recent Moves feed (Phase 4), read from the audit log — the same rows
// that power Phase 2's per-category clock popover, but across all categories
// and grouped by day. Read-only: undo stays on Cmd+Z.
const MS_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayKey = iso => String(iso).slice(0, 10);
const fmtDate = key => {
  const [y, m, d] = key.split('-');
  return d + ' ' + MONTHS[Number(m) - 1] + ' ' + y;
};
const relLabelFor = (key, nowKey) => {
  const diff = Math.round((Date.parse(nowKey + 'T00:00:00Z') - Date.parse(key + 'T00:00:00Z')) / MS_DAY);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return diff + ' days ago';
};

export function recentMoves(S, { now, days = 34, kind = 'all' } = {}) {
  const nowKey = dayKey(now);
  const cutoff = Date.parse(nowKey + 'T00:00:00Z') - (days - 1) * MS_DAY;
  const nameOf = id => {
    if (id === 'rta') return 'Ready to Assign';
    const c = (S.categories || []).find(x => x.id === id);
    return c ? c.name : '(deleted category)';
  };

  const rows = (S.audit || [])
    .filter(a => a.entityType === 'assignment' && Date.parse(a.at) >= cutoff)
    .map(a => {
      if (a.action === 'move') {
        return { id: a.id, at: a.at, verb: 'moved', amount: a.after?.amount ?? 0,
          from: nameOf(a.after?.from), to: nameOf(a.after?.to), month: a.after?.month || '' };
      }
      const [head, month] = String(a.entityId || '').split('|');
      if (head === 'import') return { id: a.id, at: a.at, verb: 'imported', amount: null, from: null, to: null, month: month || '' };
      return { id: a.id, at: a.at, verb: a.action === 'delete' ? 'removed' : 'assigned',
        amount: a.after?.amount ?? 0, from: null, to: nameOf(head), month: month || '' };
    })
    .filter(r => kind === 'all'
      || (kind === 'moved' && r.verb === 'moved')
      || (kind === 'assigned' && r.verb !== 'moved'))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const groups = [];
  for (const r of rows) {
    const key = dayKey(r.at);
    let g = groups[groups.length - 1];
    if (!g || g.dateKey !== key) {
      g = { dateKey: key, dateLabel: fmtDate(key), relLabel: relLabelFor(key, nowKey), rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/moves.test.js` → all pass.

- [ ] **Step 5: Full suite + build, then commit**

```bash
git add src/lib/moves.js tests/moves.test.js
git commit -m "feat(plan): recent-moves audit parsing — day grouping, kinds, name resolution"
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
  const all = [...BUILTIN_VIEWS, ...views];
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
- Modify: `src/screens/Plan.jsx` (ACTIVITY cell opens it)

**Interfaces:**
- Consumes: `S.transactions`, `S.accounts`, `money` from `useMoney()`, `monthLabel`.
- Produces: `<ActivityModal open cat month S money onClose />`.

- [ ] **Step 1: Build the modal**

Same modal shell. Header "Activity", subheader = category name + `monthLabel(month)`. Table columns exactly `Account · Date · Payee · Memo · Amount`. Rows: this category's transactions in `month`, newest first. **Use the same predicate the envelope fold uses for a category's activity** — read `src/lib/envelope.js` and mirror its filter (occurred, not pending, month match, `t.category === cat.id`) so the modal's total always equals the row's ACTIVITY figure; do not invent a second definition. Right-align Amount with `.tnum` and sign colors. Footer: a total row (`Total` + the summed amount) and a **Close** button. Empty state: "No transactions in this category for 〈month〉."

- [ ] **Step 2: Wire the ACTIVITY cell**

In `CategoryRow`, the activity cell already carries `data-noselect`. Make its number a button (`className="hv-soft"`, `background: 'transparent'`, `border: 'none'`, underline on hover) that opens the modal for that category. Keep the existing `data-noselect` so row-selection is unaffected. Track `activityCat` state in `Plan()` and render one `<ActivityModal>` at the screen level (not per row).

- [ ] **Step 3: Verify**

`npx vitest run` + `npx vite build` green. Dev server: click an ACTIVITY figure → modal lists that category's transactions for the month and the total equals the cell; a category with no transactions shows the empty state; Escape and Close both dismiss; clicking the figure does not select the row.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/ActivityModal.jsx src/screens/Plan.jsx
git commit -m "feat(plan): activity drill-down modal"
```

---

### Task 6: Recent Moves panel

**Files:**
- Create: `src/ui/plan/RecentMovesModal.jsx`
- Modify: `src/screens/Plan.jsx` (toolbar button)

**Interfaces:**
- Consumes: `recentMoves` (Task 2), `resolveDisplayName` (`src/lib/identity.js`), `useAuth()` for the user's email, `prefs.displayName`.
- Produces: `<RecentMovesModal open S money onClose />`.

- [ ] **Step 1: Build the modal**

Same modal shell; title "Recent Moves". A segmented control **All / Moved / Assigned** (mirror the existing `ViewToggle` styling in `Plan.jsx` so the two look like siblings) driving `kind`. Body: `recentMoves(S, { now: nowIso(), kind })` rendered as date groups — each group header shows `dateLabel` on the left and the muted `relLabel` on the right — then rows reading:
- moved: `〈who〉 moved 〈amount〉 from 〈chip from〉 to 〈chip to〉`
- assigned/removed: `〈who〉 assigned|removed 〈amount〉 to 〈chip to〉`
- imported: `〈who〉 imported budget amounts`

`〈who〉` is `resolveDisplayName(prefs.displayName, user.email)` with the avatar initial chip already used by Phase 2's `MovesPopover` (copy that chip's styling). A chip shows the category name over a muted month label (e.g. "Aug 2026"). Amounts bold, `.tnum`. Empty state: "No moves in the last 34 days." Footer: **Close**.

- [ ] **Step 2: Add the toolbar button**

Next to the existing `ViewToggle` / `AddGroupButton` row, add a "Recent Moves" button (same button styling as `AddGroupButton`) opening the modal.

- [ ] **Step 3: Verify**

`npx vitest run` + `npx vite build` green. Dev server: open Recent Moves → groups match the audit log with correct relative labels; All/Moved/Assigned partition the rows (Moved count + Assigned count === All count); an `'rta'` side renders "Ready to Assign"; Escape/Close dismiss.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/RecentMovesModal.jsx src/screens/Plan.jsx
git commit -m "feat(plan): global Recent Moves panel"
```

---

### Task 7: Live verification pass (main session, Playwright — not a subagent)

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

- **Spec coverage:** filter pills + semantics → T1/T3; custom views (create/edit/reorder/rename/delete, prefs repair) → T1/T4; group-totals invariant and selection pruning → T1/T3; activity modal → T5; recent moves → T2/T6; live checklist → T7. Deliberately dropped by the spec (Underfunded/Overfunded/Snoozed, synced views, editing from the Activity modal) have no tasks.
- **Placeholder scan:** none — every code step carries real code, and the two prose-heavy UI tasks (T4–T6) name exact copy, columns, states and the file to mirror.
- **Type consistency:** `normalizeViews(raw, cats)`, `reorderViews(views, fromId, toId)`, `newView(name, categoryIds, existing)`, `countFor(id, env, catIds)`, `visibleSections(sections, view, env)`, `matchesView(view, cat, env)` and `recentMoves(S, { now, days, kind })` are used with those exact signatures in T3–T6; the view shape `{ id, name, categoryIds, sortOrder }` is identical across T1, T3 and T4.
