# Envelope Phase 3 — Inspector Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YNAB's right-hand inspector to the Plan screen: month summary when nothing is selected, a category card (Available breakdown, Auto-Assign shortcuts, Notes) for a single selection, and scoped totals + bulk Auto-Assign for multi-selection.

**Architecture:** A pure helper module (`src/lib/inspector.js`) computes every Auto-Assign delta as `moveAssigned`-ready move lists; a tiny store action (`setCategoryNote`) persists notes into the already-synced `categories.description`; the Plan screen gains a checkbox-selection model and a two-column grid whose right column renders the new `src/ui/plan/Inspector.jsx` (three states driven by `selected.size`).

**Tech Stack:** React 18 + Vite, vitest, inline-style theming via CSS variables (`src/styles/theme.css`), existing envelope fold (`src/lib/envelope.js`) and store reducers (`src/store/actions.js`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-envelope-budget-phase3-inspector-design.md`. YNAB structure captured live 2026-08-09 (§Captured YNAB reference).
- **Every Auto-Assign click resolves to `moveAssigned` deltas — never raw `setAssigned`** (one undo step, audit `move` rows, Phase 2 consistency).
- **One `applyData` per user click**; bulk actions chain `moveAssigned` reducers inside that single call.
- **Notes bind to `category.description`** — the field already syncs; no migration, no new column.
- **Targets are out of scope**: no Target/Cost-to-Be-Me cards. "Underfunded" = `Σ max(0, −available)` over the acted-on categories.
- **Averages = mean over the previous 3 calendar months, months with no data count as 0**, `Math.round`ed.
- Selection is screen-local state — never persisted, never synced.
- All components module-scope (the `no-inline-components` guard scans `src/screens/*.jsx`).
- Raqam theme tokens win over YNAB chrome: cards use `var(--surface)`/`var(--border)`/radius 12; Auto-Assign rows 32px/radius 8/`var(--elev)` bg, hover `var(--soft)`.
- Inspector column 320px, sticky (`top: 16px`); grid collapses to one column ≤1100px (table first in source order). Plan `maxWidth` 1180 → 1280.
- Copy (exact): "<Month>'s Summary" · "Left Over from Last Month" · "Assigned in <Month>" · "Activity" · "Available" · "Available Balance" · "Assigned This Month" · "Spending This Month" · "Auto-Assign" · "Assigned Last Month" · "Spent Last Month" · "Average Assigned" · "Average Spent" · "Reset Available Amount(s)" · "Reset Assigned Amount(s)" · "Underfunded" · "N Categories Selected" · "Notes" · "Enter a note...".

---

### Task 1: Pure inspector math — `src/lib/inspector.js`

**Files:**
- Create: `src/lib/inspector.js`
- Test: `tests/inspector.test.js`

**Interfaces:**
- Consumes: `prevMonth(month)` from `src/lib/calc.js` (`'2026-08' → '2026-07'`); the envelope fold result shape `env.rows: Map<catId, {assigned, activity, available, carryIn}>` from `src/lib/envelope.js`; `S.assignments: [{id, category, month, amount}]`.
- Produces (later tasks rely on these exact names):
  - `trailingMonths(month, n) → string[]` — the n months BEFORE `month`, newest first.
  - `assignedIn(S, catId, month) → number`
  - `selectionSummary(env, catIds) → { carryIn, assigned, activity, available }`
  - `underfundedFor(env, catIds) → number`
  - `autoAssignPlan(kind, catIds, ctx) → [{ from, to, month, amount }]` with `ctx = { S, month, env, envAt }` where `envAt(m)` returns the envelope fold for month `m`. Kinds: `'assignedLastMonth' | 'spentLastMonth' | 'avgAssigned' | 'avgSpent' | 'resetAvailable' | 'resetAssigned' | 'underfunded'`.
  - `autoAssignAmount(kind, catIds, ctx) → number` — the figure shown on the button (target/total, not the delta).

- [ ] **Step 1: Write the failing tests**

```js
// tests/inspector.test.js
import { describe, it, expect } from 'vitest';
import { envelopeFor } from '../src/lib/envelope.js';
import {
  trailingMonths, assignedIn, selectionSummary, underfundedFor,
  autoAssignPlan, autoAssignAmount,
} from '../src/lib/inspector.js';

const NOW = '2026-08-09T12:00:00.000Z';
const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', groupId: 'g1' },
  ],
  assignments: [
    { id: 'a1', category: 'groc', month: '2026-08', amount: 5000 },
    { id: 'a2', category: 'groc', month: '2026-07', amount: 4000 },
    { id: 'a3', category: 'groc', month: '2026-06', amount: 2000 },
    { id: 'a4', category: 'fuel', month: '2026-08', amount: 1000 },
  ],
  transactions: [
    { id: 't1', type: 'expense', category: 'groc', amount: 1500, date: '2026-08-05', status: 'confirmed', accountId: 'acc' },
    { id: 't2', type: 'expense', category: 'fuel', amount: 2500, date: '2026-08-04', status: 'confirmed', accountId: 'acc' },
    { id: 't3', type: 'expense', category: 'groc', amount: 900, date: '2026-07-10', status: 'confirmed', accountId: 'acc' },
  ],
  accounts: [{ id: 'acc', nickname: 'Cash', type: 'Current', status: 'active', instId: 'i1' }],
  snapshots: [{ id: 's1', accountId: 'acc', month: '2026-06', balance: 100000, status: 'confirmed' }],
  budgets: [], cards: [], recurring: [], audit: [],
  ...(over || {}),
});
const ctxFor = S => {
  const cache = new Map();
  const envAt = m => { if (!cache.has(m)) cache.set(m, envelopeFor(S, m, NOW)); return cache.get(m); };
  return { S, month: '2026-08', env: envAt('2026-08'), envAt };
};

describe('trailingMonths', () => {
  it('lists the n previous months, newest first, across a year boundary', () => {
    expect(trailingMonths('2026-08', 3)).toEqual(['2026-07', '2026-06', '2026-05']);
    expect(trailingMonths('2026-01', 2)).toEqual(['2025-12', '2025-11']);
  });
});

describe('assignedIn', () => {
  it('reads the assignment for cat+month, 0 when absent', () => {
    const S = store();
    expect(assignedIn(S, 'groc', '2026-07')).toBe(4000);
    expect(assignedIn(S, 'fuel', '2026-07')).toBe(0);
  });
});

describe('selectionSummary / underfundedFor', () => {
  it('sums envelope rows over the given cats', () => {
    const { env } = ctxFor(store());
    const sum = selectionSummary(env, ['groc', 'fuel']);
    const g = env.rows.get('groc'), f = env.rows.get('fuel');
    expect(sum.assigned).toBe(g.assigned + f.assigned);
    expect(sum.available).toBe(g.available + f.available);
    expect(sum.activity).toBe(g.activity + f.activity);
    expect(sum.carryIn).toBe(g.carryIn + f.carryIn);
  });
  it('underfunded counts only negative availables', () => {
    const { env } = ctxFor(store());
    // fuel: assigned 1000, spent 2500 → available −1500
    expect(env.rows.get('fuel').available).toBe(-1500);
    expect(underfundedFor(env, ['groc', 'fuel'])).toBe(1500);
    expect(underfundedFor(env, ['groc'])).toBe(0);
  });
});

describe('autoAssignPlan', () => {
  it('assignedLastMonth: delta up through rta→cat, delta down through cat→rta', () => {
    const ctx = ctxFor(store());
    // groc assigned Aug 5000, Jul 4000 → target 4000, delta −1000
    expect(autoAssignPlan('assignedLastMonth', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 1000 }]);
    expect(autoAssignAmount('assignedLastMonth', ['groc'], ctx)).toBe(4000);
    // fuel Jul assigned 0, Aug 1000 → delta −1000
    expect(autoAssignPlan('assignedLastMonth', ['fuel'], ctx))
      .toEqual([{ from: 'fuel', to: 'rta', month: '2026-08', amount: 1000 }]);
  });
  it('spentLastMonth: target is last month outflow, floored at 0', () => {
    const ctx = ctxFor(store());
    // groc spent 900 in Jul; assigned Aug 5000 → delta −4100
    expect(autoAssignPlan('spentLastMonth', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 4100 }]);
    expect(autoAssignAmount('spentLastMonth', ['groc'], ctx)).toBe(900);
  });
  it('avgAssigned: mean of prior 3 months, empty months count as 0', () => {
    const ctx = ctxFor(store());
    // groc: Jul 4000 + Jun 2000 + May 0 → avg 2000; current 5000 → delta −3000
    expect(autoAssignAmount('avgAssigned', ['groc'], ctx)).toBe(2000);
    expect(autoAssignPlan('avgAssigned', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 3000 }]);
  });
  it('avgSpent: mean of prior 3 months of outflow', () => {
    const ctx = ctxFor(store());
    // groc outflow: Jul 900, Jun 0, May 0 → avg 300; current assigned 5000 → delta −4700
    expect(autoAssignAmount('avgSpent', ['groc'], ctx)).toBe(300);
    expect(autoAssignPlan('avgSpent', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 4700 }]);
  });
  it('resetAvailable: positive available moves to rta, negative covers from rta', () => {
    const ctx = ctxFor(store());
    // groc carries over: Jun avail 2000 → Jul 2000+4000−900=5100 → Aug
    // carryIn 5100 + assigned 5000 − spent 1500 = available 8600 → cat→rta 8600
    expect(autoAssignPlan('resetAvailable', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 8600 }]);
    // fuel available −1500 → rta→cat 1500
    expect(autoAssignPlan('resetAvailable', ['fuel'], ctx))
      .toEqual([{ from: 'rta', to: 'fuel', month: '2026-08', amount: 1500 }]);
  });
  it('resetAssigned zeroes assigned in the right direction and skips at 0', () => {
    const ctx = ctxFor(store());
    expect(autoAssignPlan('resetAssigned', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 5000 }]);
    const S2 = store({ assignments: [] });
    expect(autoAssignPlan('resetAssigned', ['groc'], ctxFor(S2))).toEqual([]);
  });
  it('underfunded covers each overspent cat from rta', () => {
    const ctx = ctxFor(store());
    expect(autoAssignPlan('underfunded', ['groc', 'fuel'], ctx))
      .toEqual([{ from: 'rta', to: 'fuel', month: '2026-08', amount: 1500 }]);
    expect(autoAssignAmount('underfunded', ['groc', 'fuel'], ctx)).toBe(1500);
  });
  it('already-at-target produces an empty plan', () => {
    const S = store({ assignments: [
      { id: 'a1', category: 'groc', month: '2026-08', amount: 4000 },
      { id: 'a2', category: 'groc', month: '2026-07', amount: 4000 },
    ] });
    expect(autoAssignPlan('assignedLastMonth', ['groc'], ctxFor(S))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/inspector.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/inspector.js"`.

- [ ] **Step 3: Implement `src/lib/inspector.js`**

```js
// Pure math for the Plan inspector (Phase 3). Every Auto-Assign action is
// expressed as a list of moveAssigned args ("the plan") so the screen can
// chain them in ONE applyData call — one undo step, audit rows for free.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase3-inspector-design.md
import { prevMonth } from './calc.js';

export function trailingMonths(month, n) {
  const out = [];
  let m = month;
  for (let i = 0; i < n; i++) { m = prevMonth(m); out.push(m); }
  return out;
}

export function assignedIn(S, catId, month) {
  const row = (S.assignments || []).find(a => a.category === catId && a.month === month);
  return row ? Math.round(row.amount) || 0 : 0;
}

const rowOf = (env, id) => env.rows.get(id) || { assigned: 0, activity: 0, available: 0, carryIn: 0 };

export function selectionSummary(env, catIds) {
  return catIds.reduce((acc, id) => {
    const r = rowOf(env, id);
    acc.carryIn += r.carryIn; acc.assigned += r.assigned;
    acc.activity += r.activity; acc.available += r.available;
    return acc;
  }, { carryIn: 0, assigned: 0, activity: 0, available: 0 });
}

export function underfundedFor(env, catIds) {
  return catIds.reduce((n, id) => n + Math.max(0, -rowOf(env, id).available), 0);
}

// Spent = outflow, so a month's "spent" figure is max(0, −activity).
const spentIn = (envAt, catId, month) => Math.max(0, -rowOf(envAt(month), catId).activity);
const AVG_N = 3; // previous 3 calendar months; empty months count as 0 (spec assumption)
const mean3 = vals => Math.round(vals.reduce((a, b) => a + b, 0) / AVG_N);

// The figure each button SHOWS (the target/total, YNAB-style — not the delta).
export function autoAssignAmount(kind, catIds, ctx) {
  const { S, month, env, envAt } = ctx;
  const per = catId => {
    if (kind === 'assignedLastMonth') return assignedIn(S, catId, prevMonth(month));
    if (kind === 'spentLastMonth') return spentIn(envAt, catId, prevMonth(month));
    if (kind === 'avgAssigned') return mean3(trailingMonths(month, AVG_N).map(m => assignedIn(S, catId, m)));
    if (kind === 'avgSpent') return mean3(trailingMonths(month, AVG_N).map(m => spentIn(envAt, catId, m)));
    if (kind === 'resetAvailable') return rowOf(env, catId).available;
    if (kind === 'resetAssigned') return rowOf(env, catId).assigned;
    throw new Error('unknown auto-assign kind: ' + kind);
  };
  if (kind === 'underfunded') return underfundedFor(env, catIds);
  return catIds.reduce((n, id) => n + per(id), 0);
}

// The moves that get the categories TO the shown figure. Target kinds emit the
// signed delta vs the current assigned; reset kinds emit the zeroing move.
export function autoAssignPlan(kind, catIds, ctx) {
  const { month, env } = ctx;
  const moves = [];
  const push = (catId, delta) => {
    if (delta > 0) moves.push({ from: 'rta', to: catId, month, amount: delta });
    else if (delta < 0) moves.push({ from: catId, to: 'rta', month, amount: -delta });
  };
  for (const catId of catIds) {
    const r = rowOf(env, catId);
    if (kind === 'underfunded') { if (r.available < 0) push(catId, -r.available); continue; }
    if (kind === 'resetAvailable') { push(catId, -r.available); continue; }
    if (kind === 'resetAssigned') { push(catId, -r.assigned); continue; }
    push(catId, autoAssignAmount(kind, [catId], ctx) - r.assigned);
  }
  return moves;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/inspector.test.js`
Expected: PASS (all).

- [ ] **Step 5: Full suite + build, then commit**

Run: `npx vitest run` → all pass; `npx vite build` → clean.

```bash
git add src/lib/inspector.js tests/inspector.test.js
git commit -m "feat(plan): pure inspector math — trailing months, summaries, auto-assign plans"
```

---

### Task 2: `setCategoryNote` store action

**Files:**
- Modify: `src/store/actions.js` (add near `upsertCategory`, ~line 768)
- Test: `tests/category-note.test.js`

**Interfaces:**
- Consumes: `makeAudit` from `src/store/audit.js` (already imported in actions.js); existing audit literals `entityType: 'category'`, `action: 'update'` (already used by category CRUD — `tests/audit-constraints.test.js` will fail the build if the literals were wrong).
- Produces: `setCategoryNote(data, { id, note }) → data'` — writes `note` into `category.description` (the synced field); no-ops **by reference** when the category is missing or the note is unchanged.

- [ ] **Step 1: Write the failing tests**

```js
// tests/category-note.test.js
import { describe, it, expect } from 'vitest';
import { setCategoryNote } from '../src/store/actions.js';

const store = () => ({
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', description: '' }],
  categoryGroups: [], assignments: [], transactions: [], budgets: [],
  accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
});

describe('setCategoryNote', () => {
  it('writes the note into description with one audit row', () => {
    const s = setCategoryNote(store(), { id: 'groc', note: 'buy in bulk' });
    expect(s.categories.find(c => c.id === 'groc').description).toBe('buy in bulk');
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'category', entityId: 'groc', action: 'update' });
    expect(s.audit[0].summary).toContain('Groceries');
  });
  it('no-ops by reference on unknown id or unchanged note', () => {
    const s0 = store();
    expect(setCategoryNote(s0, { id: 'nope', note: 'x' })).toBe(s0);
    expect(setCategoryNote(s0, { id: 'groc', note: '' })).toBe(s0);
    const s1 = setCategoryNote(s0, { id: 'groc', note: 'a' });
    expect(setCategoryNote(s1, { id: 'groc', note: 'a' })).toBe(s1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/category-note.test.js`
Expected: FAIL — `setCategoryNote` is not exported.

- [ ] **Step 3: Implement the action** (in `src/store/actions.js`, after `upsertCategory`)

```js
// Inspector Notes (Phase 3): the note IS categories.description — the field
// already syncs, so no schema work. Trimmed only of trailing whitespace-only
// input; intentional inner formatting is preserved.
export function setCategoryNote(data, { id, note }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0) return data;
  const next = (note || '').trim() === '' && !(data.categories[i].description || '') ? null
    : (data.categories[i].description || '') === (note || '') ? null : true;
  if (!next) return data;
  const cat = { ...data.categories[i], description: note || '' };
  const categories = [...data.categories];
  categories[i] = cat;
  return {
    ...data, categories,
    audit: [makeAudit({
      entityType: 'category', entityId: id, action: 'update',
      summary: 'Updated note for ' + cat.name,
      before: { description: data.categories[i].description || '' },
      after: { description: cat.description },
    }), ...(data.audit || [])],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/category-note.test.js tests/audit-constraints.test.js`
Expected: PASS (audit-constraints proves the literals are inside the SQL CHECK lists).

- [ ] **Step 5: Full suite + build, then commit**

```bash
git add src/store/actions.js tests/category-note.test.js
git commit -m "feat(plan): setCategoryNote action — notes ride categories.description"
```

---

### Task 3: Selection model + checkbox column — `src/screens/Plan.jsx`

**Files:**
- Modify: `src/screens/Plan.jsx` — `ROW_COLS` (line 28), header row (~line 854), `GroupRow`, `CategoryRow`, `Plan()` state (~line 780)

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 4 relies on these): `Plan()` holds `const [selected, setSelected] = useState(() => new Set())` of category ids; `ctx` gains `selected` and `onSelect`; rows render a leading checkbox column. `PlanCheckbox` module-scope component: `({ checked, indeterminate, onChange, label })`.

- [ ] **Step 1: Widen the grid and add the checkbox primitive**

Change `ROW_COLS` to a 5-column grid (leading 24px checkbox lane):

```js
const ROW_COLS = { display: 'grid', gridTemplateColumns: '24px minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)', gap: 10, alignItems: 'center' };
```

Add module-scope (near `usePopoverDismiss`):

```jsx
// Native checkbox, accent-tinted; indeterminate is only reachable via the
// property, so a ref effect mirrors the prop onto the DOM node.
function PlanCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input ref={ref} type="checkbox" checked={checked} aria-label={label}
      onChange={onChange} onClick={e => e.stopPropagation()}
      style={{ width: 15, height: 15, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer' }} />
  );
}
```

- [ ] **Step 2: Selection state in `Plan()` + Escape-to-clear**

In `Plan()` (next to the `collapsed` state):

```js
const [selected, setSelected] = useState(() => new Set());
const activeCatIds = useMemo(
  () => (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active').map(c => c.id),
  [S.categories],
);
const toggleSelect = (id, additive) => setSelected(prev => {
  const next = additive ? new Set(prev) : new Set();
  if (prev.has(id) && (additive || prev.size === 1)) next.delete(id); else next.add(id);
  return next;
});
const setMany = (ids, on) => setSelected(prev => {
  const next = new Set(prev);
  ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
  return next;
});
useEffect(() => {
  const onKey = e => { if (e.key === 'Escape') setSelected(prev => (prev.size ? new Set() : prev)); };
  document.addEventListener('keydown', onKey); // NOT capture — popover Escape (capture + stopPropagation) wins
  return () => document.removeEventListener('keydown', onKey);
}, []);
```

Extend `ctx` (line ~831): `const ctx = { S, month, applyData, money, moneyS, view: prefs.planView, env, selected, toggleSelect };`

Also prune `selected` of ids that stop existing (archive/delete): inside the existing `sections` memo is the wrong place — add a small effect:

```js
useEffect(() => {
  setSelected(prev => {
    const live = new Set(activeCatIds);
    const next = new Set([...prev].filter(id => live.has(id)));
    return next.size === prev.size ? prev : next;
  });
}, [activeCatIds]);
```

- [ ] **Step 3: Header check-all + group and category checkboxes + row-click select**

Header row (line ~854) gets a leading cell before CATEGORY:

```jsx
<PlanCheckbox label="Select all categories"
  checked={selected.size > 0 && selected.size === activeCatIds.length}
  indeterminate={selected.size > 0 && selected.size < activeCatIds.length}
  onChange={() => setMany(activeCatIds, selected.size !== activeCatIds.length)} />
```

`GroupRow`: receives `selected` + `setMany` (thread via props or ctx); leading cell:

```jsx
<PlanCheckbox label={'Select ' + group.name + ' categories'}
  checked={cats.length > 0 && cats.every(c => selected.has(c.id))}
  indeterminate={cats.some(c => selected.has(c.id))}
  onChange={() => setMany(cats.map(c => c.id), !cats.every(c => selected.has(c.id)))} />
```

`CategoryRow`: leading cell `<PlanCheckbox label={'Select ' + cat.name} checked={selected.has(cat.id)} onChange={() => toggleSelect(cat.id, true)} />`; the row's outer div gets background-click single-select (guarded so editors/pills/popovers keep working):

```js
onClick={e => {
  if (e.target.closest('button, input, textarea, [role="dialog"]')) return;
  toggleSelect(cat.id, e.metaKey || e.ctrlKey);
}}
```

Selected row tint: on the row's outer div style, `background: selected.has(cat.id) ? 'var(--soft)' : undefined` (merged before the existing hover class).

- [ ] **Step 4: Verify by hand + guard**

Run: `npx vite build` → clean; `node scripts/check-inline-components.mjs` if the guard is a script (else `npx vitest run` covers it) → `PlanCheckbox` is module-scope so the guard passes. On the dev server: check-all works, group checkbox is indeterminate with a partial selection, row click selects one, Ctrl-click adds, Escape clears, Escape inside an open popover closes the popover and keeps the selection.

- [ ] **Step 5: Full suite, then commit**

```bash
git add src/screens/Plan.jsx
git commit -m "feat(plan): checkbox selection model on the Plan table"
```

---

### Task 4: Inspector shell + no-selection summary — `src/ui/plan/Inspector.jsx`

**Files:**
- Create: `src/ui/plan/Inspector.jsx`
- Modify: `src/screens/Plan.jsx` (layout grid, `envAt` memo, render `<Inspector …/>`), `src/styles/theme.css` (grid + sticky classes)

**Interfaces:**
- Consumes (exact, from Tasks 1–3): `selectionSummary`, `underfundedFor`, `autoAssignPlan`, `autoAssignAmount` from `src/lib/inspector.js`; `moveAssigned` from `src/store/actions.js`; `selected: Set` from Plan.
- Produces: `export default function Inspector({ S, env, envAt, month, money, applyData, selected })`; internal module-scope components `Card({ title, children, right })` (collapsible) and `AutoAssignRows({ kinds, catIds, ctx, money, applyData, plural })` reused by Tasks 5–6.

- [ ] **Step 1: Layout CSS** (append to `src/styles/theme.css`)

```css
/* Plan screen: table + inspector two-column grid (Phase 3). Inspector is
   sticky in the right column; ≤1100px it drops below the table. */
.plan-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.plan-inspector { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 1100px) {
  .plan-grid { grid-template-columns: 1fr; }
  .plan-inspector { position: static; }
}
```

- [ ] **Step 2: Inspector shell + no-selection state**

Create `src/ui/plan/Inspector.jsx`:

```jsx
// Plan inspector (Phase 3): right-column sidebar reacting to row selection.
// Structure live-captured from YNAB 2026-08-09 (see the phase-3 spec);
// chrome follows Raqam tokens, not YNAB's.
import { useMemo, useState } from 'react';
import { monthLabel } from '../../lib/calc.js';
import {
  selectionSummary, underfundedFor, autoAssignPlan, autoAssignAmount,
} from '../../lib/inspector.js';
import { moveAssigned, setCategoryNote } from '../../store/actions.js';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const lineRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, padding: '3px 0' };
const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

function Card({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section style={cardStyle}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

function SummaryLines({ sum, money, monthName }) {
  return (
    <>
      <div style={lineRow}><span>Left Over from Last Month</span><span className="tnum">{money(sum.carryIn)}</span></div>
      <div style={lineRow}><span>Assigned in {monthName}</span><span className="tnum">{money(sum.assigned)}</span></div>
      <div style={lineRow}><span>Activity</span><span className="tnum">{money(sum.activity)}</span></div>
      <div style={{ ...lineRow, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 7 }}>
        <span style={{ fontWeight: 700 }}>Available</span>
        <span className="tnum" style={{ fontWeight: 700, color: tone(sum.available) }}>{money(sum.available)}</span>
      </div>
    </>
  );
}

const KIND_LABELS = {
  underfunded: 'Underfunded',
  assignedLastMonth: 'Assigned Last Month', spentLastMonth: 'Spent Last Month',
  avgAssigned: 'Average Assigned', avgSpent: 'Average Spent',
  resetAvailable: 'Reset Available Amount', resetAssigned: 'Reset Assigned Amount',
};

function AutoAssignRows({ kinds, catIds, ctx, money, applyData, plural }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {kinds.map(kind => {
        const amount = autoAssignAmount(kind, catIds, ctx);
        const plan = autoAssignPlan(kind, catIds, ctx);
        const label = KIND_LABELS[kind] + (plural && kind.startsWith('reset') ? 's' : '');
        return (
          <button key={kind} className="hv-soft" disabled={!plan.length}
            onClick={() => applyData(data => plan.reduce((d, mv) => moveAssigned(d, mv), data))}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, cursor: plan.length ? 'pointer' : 'default', opacity: plan.length ? 1 : .55 }}>
            <span>{label}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>{money(amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

const SIX_KINDS = ['assignedLastMonth', 'spentLastMonth', 'avgAssigned', 'avgSpent', 'resetAvailable', 'resetAssigned'];

export default function Inspector({ S, env, envAt, month, money, applyData, selected }) {
  const ctx = { S, month, env, envAt };
  const monthName = monthLabel(month).split(' ')[0]; // "August" from "August 2026"
  const activeCats = useMemo(
    () => (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active'),
    [S.categories],
  );
  const ids = [...selected];

  if (selected.size === 0) {
    const allIds = activeCats.map(c => c.id);
    return (
      <div className="plan-inspector">
        <Card title={monthName + "'s Summary"}>
          <SummaryLines sum={selectionSummary(env, allIds)} money={money} monthName={monthName} />
        </Card>
        <Card title="Auto-Assign">
          <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={allIds} ctx={ctx} money={money} applyData={applyData} plural />
        </Card>
      </div>
    );
  }
  return null; // single/multi arrive in Tasks 5–6
}
```

- [ ] **Step 3: Wire the grid into `Plan()`**

In `Plan()` add the `envAt` memo next to `env`:

```js
const envAt = useMemo(() => {
  const cache = new Map();
  return m => { if (!cache.has(m)) cache.set(m, envelopeFor(S, m, nowIso())); return cache.get(m); };
}, [S]);
```

Replace the return's outer wrapper: `maxWidth: 1180` → `1280`, and wrap the existing table column plus the inspector:

```jsx
return (
  <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 56px' }}>
    <div className="plan-grid" style={{ animation: 'hsFade .25s ease' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* …everything currently inside the flex column stays here unchanged… */}
      </div>
      <Inspector S={S} env={env} envAt={envAt} month={month} money={money} applyData={applyData} selected={selected} />
    </div>
  </div>
);
```

Import at top: `import Inspector from '../ui/plan/Inspector.jsx';`

- [ ] **Step 4: Verify**

Run: `npx vite build` → clean; `npx vitest run` → green. Dev server: with nothing selected the sidebar shows "<Month>'s Summary" whose four lines equal the table's group totals summed; "Underfunded" equals the sum of red pills; clicking "Underfunded" turns every red pill beige and drops RTA by exactly that amount; Cmd+Z reverts it in one step. Window ≤1100px: inspector drops below the table, no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add src/ui/plan/Inspector.jsx src/screens/Plan.jsx src/styles/theme.css
git commit -m "feat(plan): inspector sidebar shell — month summary + bulk auto-assign"
```

---

### Task 5: Single-selection state — Available Balance, Auto-Assign, Notes

**Files:**
- Modify: `src/ui/plan/Inspector.jsx`

**Interfaces:**
- Consumes: everything from Task 4 (`Card`, `SummaryLines`, `AutoAssignRows`, `SIX_KINDS`, `ctx`); `setCategoryNote` (Task 2).
- Produces: the `selected.size === 1` branch; module-scope `NotesCard({ cat, applyData })`.

- [ ] **Step 1: Implement the single-select branch** (replace `return null` placeholder's `selected.size === 1` case)

```jsx
function AvailableCard({ row, money }) {
  const pillBg = row.available > 0 ? 'var(--pos-soft)' : row.available < 0 ? 'var(--neg-soft)' : 'var(--elev)';
  const pillFg = row.available > 0 ? 'var(--pos)' : row.available < 0 ? 'var(--neg)' : 'var(--muted)';
  return (
    <Card title="Available Balance">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <span className="tnum" style={{ padding: '4px 14px', borderRadius: 999, background: pillBg, color: pillFg, fontSize: 15, fontWeight: 700 }}>{money(row.available)}</span>
      </div>
      <div style={lineRow}><span>Left Over from Last Month</span><span className="tnum">{money(row.carryIn)}</span></div>
      <div style={lineRow}><span>Assigned This Month</span><span className="tnum">{(row.assigned > 0 ? '+' : '') + money(row.assigned)}</span></div>
      <div style={lineRow}><span>Spending This Month</span><span className="tnum">{money(row.activity)}</span></div>
    </Card>
  );
}

function NotesCard({ cat, applyData }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const start = () => { setDraft(cat.description || ''); setEditing(true); };
  const commit = () => { applyData(data => setCategoryNote(data, { id: cat.id, note: draft })); setEditing(false); };
  return (
    <Card title="Notes">
      {editing ? (
        <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          }}
          style={{ width: '100%', minHeight: 64, boxSizing: 'border-box', padding: 8, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
      ) : (
        <p onClick={start} style={{ margin: 0, fontSize: 13, color: cat.description ? 'var(--text)' : 'var(--muted)', cursor: 'text', whiteSpace: 'pre-wrap' }}>
          {cat.description || 'Enter a note...'}
        </p>
      )}
    </Card>
  );
}
```

In `Inspector`, before the multi branch:

```jsx
if (selected.size === 1) {
  const cat = activeCats.find(c => c.id === ids[0]);
  if (!cat) return null;
  const row = env.rows.get(cat.id) || { assigned: 0, activity: 0, available: 0, carryIn: 0 };
  return (
    <div className="plan-inspector">
      <div style={{ fontSize: 15, fontWeight: 700, padding: '2px 2px 0' }}>{cat.name}</div>
      <AvailableCard row={row} money={money} />
      <Card title="Auto-Assign">
        <AutoAssignRows kinds={SIX_KINDS} catIds={[cat.id]} ctx={ctx} money={money} applyData={applyData} />
      </Card>
      <NotesCard key={cat.id} cat={cat} applyData={applyData} />
    </div>
  );
}
```

(`key={cat.id}` on NotesCard resets the editing state when the selection changes.)

- [ ] **Step 2: Verify**

`npx vite build` clean, `npx vitest run` green. Dev server: select one category → header shows its name; the three breakdown lines sum exactly to the pill; "Assigned Last Month" shows last month's figure and clicking it moves the delta (undo = one step); Notes: click placeholder → type → blur → note persists, reappears after reload (sync round-trip), and the same text shows in the category's description on the Categories screen; Escape while editing cancels without clearing the row selection.

- [ ] **Step 3: Commit**

```bash
git add src/ui/plan/Inspector.jsx
git commit -m "feat(plan): single-select inspector — available breakdown, auto-assign, notes"
```

---

### Task 6: Multi-selection state

**Files:**
- Modify: `src/ui/plan/Inspector.jsx`

**Interfaces:**
- Consumes: Task 4's building blocks; `underfundedFor` (already imported).
- Produces: the `selected.size > 1` branch (final state of `Inspector`).

- [ ] **Step 1: Implement the multi branch** (replaces the trailing `return null`)

```jsx
const names = ids.map(id => (activeCats.find(c => c.id === id) || {}).name).filter(Boolean);
return (
  <div className="plan-inspector">
    <div style={{ padding: '2px 2px 0' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.size} Categories Selected</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.join(', ')}</div>
    </div>
    <Card title={monthName + "'s Summary"}>
      <SummaryLines sum={selectionSummary(env, ids)} money={money} monthName={monthName} />
    </Card>
    <Card title="Auto-Assign">
      <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={ids} ctx={ctx} money={money} applyData={applyData} plural />
    </Card>
  </div>
);
```

- [ ] **Step 2: Verify**

`npx vite build` clean, `npx vitest run` green. Dev server: check two categories → "2 Categories Selected" with the comma list; Summary equals the sum of the two table rows; Underfunded equals their combined red-pill total, one click covers both in ONE undo step; "Reset Assigned Amounts" zeroes both.

- [ ] **Step 3: Commit**

```bash
git add src/ui/plan/Inspector.jsx
git commit -m "feat(plan): multi-select inspector — scoped summary + bulk auto-assign"
```

---

### Task 7: Live verification pass (main session, Playwright — not a subagent)

**Files:** none (verification only; fixes land as scoped commits if found).

- [ ] **Step 1: Run the spec's live checklist** on the dev server against real data:
  1. No selection: summary lines equal the table totals exactly (read both from the DOM, compare).
  2. Select Utilities: breakdown lines sum to the pill figure.
  3. Check two categories: summary equals the sum of both rows.
  4. "Assigned Last Month" applies; Cmd+Z reverts in one step (assert RTA and the cell return to prior values).
  5. Underfunded covers a red pill; RTA drops by the same amount; undo restores.
  6. Notes round-trip a reload (sync push + pull) — restore the original note afterwards.
  7. Escape clears selection; Escape with a popover open closes only the popover.
  8. 1000px-wide window: one column, no horizontal scroll; wide window: inspector sticky while the table scrolls.
- [ ] **Step 2: Undo/restore every data mutation made during verification** (the established unmask → act → assert → undo → re-mask flow).
- [ ] **Step 3: Commit any fixes as their own scoped commits.**

---

## Self-Review

- **Spec coverage:** selection model → T3; layout/grid/sticky/collapse → T4; no-selection summary + bulk auto-assign → T4; single (breakdown/auto-assign/notes) → T5; multi (header/summary/underfunded/plural) → T6; math helpers → T1; note action → T2; live checklist → T7. Dropped-by-spec items (targets, For You, future-months card, pencil) have no tasks — intentional.
- **Placeholder scan:** none; every code step carries real code.
- **Type consistency:** `autoAssignPlan(kind, catIds, ctx)` / `autoAssignAmount(kind, catIds, ctx)` with `ctx = { S, month, env, envAt }` used identically in T1/T4/T5/T6; `moveAssigned(data, { from, to, month, amount })` matches actions.js:925; `selectionSummary` returns `{ carryIn, assigned, activity, available }` consumed by `SummaryLines` under those exact names; `PlanCheckbox` props `{ checked, indeterminate, onChange, label }` used consistently in T3.
