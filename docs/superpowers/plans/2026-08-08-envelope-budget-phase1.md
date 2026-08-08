# Envelope Budget Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YNAB-style envelope foundation — per-category-per-month assignments, category groups, RTA math, and the plan table replacing the `/budget` index.

**Architecture:** New `category_groups` + `assignments` server tables/collections; pure envelope math in `src/lib/envelope.js` (single fold over months, reusing `txBudgetImpact`); idempotent adoption actions; new `src/screens/Plan.jsx` styled per the captured YNAB reference.

**Tech Stack:** React 18, Supabase (SQL migration), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-envelope-budget-phase1-design.md` · **Visuals:** `docs/superpowers/specs/2026-08-08-ynab-budget-reference.md`

## Global Constraints

- **Envelope math:** `available(cat,m) = max(0, available(cat,m−1)) + assigned(cat,m) + activity(cat,m)`; `RTA(m) = RTA(m−1) + income(m) − assignedTotal(m) − overspend(m−1)` where `overspend(m) = Σ max(0, −available(cat,m))`. Activity reuses `txBudgetImpact` (`src/lib/calc.js:331`) negated; income per `monthMetrics` rules (`type === 'income'`, `status !== 'pending'`, `hasOccurred`).
- **Income categories are never grouped and never appear on the plan table.**
- **Idempotency:** `adoptYnabTree` and `importBudgetsAsAssignments` must be no-ops on second run (tests assert store equality by value on re-run).
- **Amounts are integers (PKR).** `setAssigned` with amount 0 removes the assignment row.
- **Sync order:** `categoryGroups` before `categories`; `assignments` after `categories` (FK-safe); both surrogate-`id` collections with default `conflictKey`.
- **One undo step per user action** (single `applyData` reducer); audit entity types `'assignment'` / `'categoryGroup'`.
- **Old `budgets` collection/data untouched**; only its screen is unrouted (file stays for Dashboard).
- Visual tokens come from the reference doc (group row 40px `#F8F6F2` name 16/600; cat row 44px white name 16/500; header 14/500 ls .6px; pills green/beige/red radius 999; accent `var(--accent)`).
- Keep the full vitest suite green and `npx vite build` clean after every task.

---

### Task 1: Server migration `0011_envelope.sql`

**Files:**
- Create: `supabase/migrations/0011_envelope.sql`

**Interfaces:**
- Produces: tables `category_groups`, `assignments`; `categories.group_id` column; widened `audit_log` CHECK. (Applied by the user to Supabase as a deploy step — nothing in-app depends on it until sync runs against a migrated project.)

- [ ] **Step 1: Write the migration**

```sql
-- Envelope budget phase 1: category groups + per-month assignments.

create table public.category_groups (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  sort_order int not null default 99,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.category_groups enable row level security;

alter table public.categories add column if not exists group_id text;
alter table public.categories
  add constraint categories_group_fk
  foreign key (user_id, group_id) references public.category_groups (user_id, id) on delete set null;

create table public.assignments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  category_id text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, category_id, month),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);
alter table public.assignments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['category_groups', 'assignments'] loop
    execute format('create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update using (auth.uid() = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.audit_log drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring','assignment','categoryGroup'));
```

- [ ] **Step 2: Sanity-check against precedents**

Compare shape with `0001_init.sql` snapshots table (composite FK precedent, lines ~70-82) and the RLS `do $$` block (~202-211). Confirm the current `audit_log` CHECK contents at `0005_budgets_screen.sql:11-13` — the new constraint must be a superset (include `'recurring'` if the current one has it; adjust the list to current-plus-new, never dropping an existing value).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_envelope.sql
git commit -m "Envelope: migration for category_groups, categories.group_id, assignments"
```

---

### Task 2: Store shape + sync collections

**Files:**
- Modify: `src/store/seed.js` (freshStore), `src/store/sync.js` (COLLECTIONS + categories mapping)
- Test: `tests/sync-envelope.test.js` (create)

**Interfaces:**
- Produces: `data.categoryGroups` (`{id, name, sortOrder}`) and `data.assignments` (`{id, category, month, amount}`) exist on every store; sync pushes/fetches both; category rows round-trip `groupId`.

- [ ] **Step 1: Write the failing test**

Create `tests/sync-envelope.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/store/sync.js';
import { freshStore } from '../src/store/seed.js';

const names = COLLECTIONS.map(c => c.name);
const idx = n => names.indexOf(n);
const col = n => COLLECTIONS.find(c => c.name === n);

describe('envelope collections', () => {
  it('exist in FK-safe order', () => {
    expect(idx('categoryGroups')).toBeGreaterThan(-1);
    expect(idx('assignments')).toBeGreaterThan(-1);
    expect(idx('categoryGroups')).toBeLessThan(idx('categories'));
    expect(idx('assignments')).toBeGreaterThan(idx('categories'));
  });

  it('freshStore carries both collections empty', () => {
    const s = freshStore();
    expect(s.categoryGroups).toEqual([]);
    expect(s.assignments).toEqual([]);
  });

  it('categoryGroups rows round-trip', () => {
    const g = { id: 'g1', name: 'Bills', sortOrder: 2 };
    const row = col('categoryGroups').toRow(g);
    expect(row).toEqual({ id: 'g1', name: 'Bills', sort_order: 2 });
    expect(col('categoryGroups').fromRow(row)).toEqual(g);
  });

  it('assignments rows round-trip', () => {
    const a = { id: 'a1', category: 'groceries', month: '2026-08', amount: 25000 };
    const row = col('assignments').toRow(a);
    expect(row).toEqual({ id: 'a1', category_id: 'groceries', month: '2026-08', amount: 25000 });
    expect(col('assignments').fromRow(row)).toEqual(a);
  });

  it('categories round-trip groupId (and omit it when absent)', () => {
    const c = col('categories');
    expect(c.toRow({ id: 'x', name: 'X', type: 'expense', color: '#000', groupId: 'g1' }).group_id).toBe('g1');
    expect(c.toRow({ id: 'x', name: 'X', type: 'expense', color: '#000' }).group_id).toBe(null);
    expect(c.fromRow({ id: 'x', name: 'X', type: 'expense', color: '#000', group_id: 'g1' }).groupId).toBe('g1');
    expect(c.fromRow({ id: 'x', name: 'X', type: 'expense', color: '#000', group_id: null }).groupId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/sync-envelope.test.js` → FAIL (collections missing).

- [ ] **Step 3: Implement**

`src/store/seed.js` freshStore: add `categoryGroups: [], assignments: [],` to the returned object.

`src/store/sync.js`:
- Insert immediately **before** the `categories` entry:

```js
{
  name: 'categoryGroups', table: 'category_groups', keyOf: r => r.id,
  toRow: r => ({ id: r.id, name: r.name, sort_order: r.sortOrder ?? 99 }),
  fromRow: r => ({ id: r.id, name: r.name, sortOrder: r.sort_order ?? 99 }),
},
```

- Insert immediately **after** the `categories` entry:

```js
{
  name: 'assignments', table: 'assignments', keyOf: r => r.id,
  toRow: r => ({ id: r.id, category_id: r.category, month: r.month, amount: r.amount }),
  fromRow: r => ({ id: r.id, category: r.category_id, month: r.month, amount: Number(r.amount) || 0 }),
},
```

- In the `categories` entry: add `group_id: r.groupId ?? null,` to `toRow` and `groupId: r.group_id || undefined,` inside the `stripNulls({...})` of `fromRow`.

- [ ] **Step 4: Run tests + suite + build** — targeted PASS; `npx vitest run --exclude '**/.claude/**'` green (fix `tests/sync-recurring.test.js` fixture if it hardcodes the collection list); `npx vite build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/seed.js src/store/sync.js tests/sync-envelope.test.js
git commit -m "Envelope: categoryGroups + assignments collections in store and sync"
```

---

### Task 3: Envelope math — `src/lib/envelope.js`

**Files:**
- Create: `src/lib/envelope.js`
- Test: `tests/envelope.test.js`

**Interfaces:**
- Consumes: `txBudgetImpact`, `hasOccurred` (`src/lib/calc.js`), `addMonths` (`src/lib/dates.js`).
- Produces: `envelopeFor(store, month, now) → { rows: Map<catId,{assigned,activity,available,carryIn}>, groupTotals: Map<groupKey,{assigned,activity,available}>, rta, income, assignedTotal }` and `assignedFor(store, catId, month) → number`.

- [ ] **Step 1: Write the failing test**

Create `tests/envelope.test.js` (fixture: 2 expense cats in groups, income cat ungrouped; months Jul–Aug 2026):

```js
import { describe, it, expect } from 'vitest';
import { envelopeFor, assignedFor } from '../src/lib/envelope.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
  ],
  transactions: [], assignments: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const tx = (id, month, amount, cat, type = 'expense') =>
  ({ id, type, amount, category: cat, accountId: 'a1', status: 'cleared', date: month + '-05T12:00' });

describe('envelopeFor', () => {
  it('computes assigned + activity + available for the month', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 10000 }],
      transactions: [tx('t1', '2026-08', 4000, 'groc')],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ assigned: 10000, activity: -4000, available: 6000, carryIn: 0 });
  });

  it('carries positive available forward and resets overspend to zero', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-07', amount: 5000 },
        { id: 'x2', category: 'fun', month: '2026-07', amount: 1000 },
      ],
      transactions: [tx('t1', '2026-07', 2000, 'groc'), tx('t2', '2026-07', 3000, 'fun')],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ carryIn: 3000, available: 3000 });   // +3000 carried
    expect(e.rows.get('fun')).toMatchObject({ carryIn: 0, available: 0 });          // −2000 reset
  });

  it('RTA = income − assigned, minus LAST month’s overspend', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'fun', month: '2026-07', amount: 1000 }],
      transactions: [
        tx('i1', '2026-07', 100000, 'salary', 'income'),
        tx('t1', '2026-07', 3000, 'fun'),                       // overspends fun by 2000
        tx('i2', '2026-08', 50000, 'salary', 'income'),
      ],
    });
    expect(envelopeFor(S, '2026-07').rta).toBe(99000);           // 100000 − 1000
    expect(envelopeFor(S, '2026-08').rta).toBe(147000);          // 99000 + 50000 − 0 assigned − 2000 overspend
  });

  it('pending income and pending spending are excluded', () => {
    const S = store({
      transactions: [
        { ...tx('i1', '2026-08', 9999, 'salary', 'income'), status: 'pending' },
        { ...tx('t1', '2026-08', 500, 'groc'), status: 'pending' },
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.income).toBe(0);
    expect(e.rows.get('groc').activity).toBe(0);
  });

  it('group totals sum member rows; income categories are absent from rows', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-08', amount: 7000 },
        { id: 'x2', category: 'fun', month: '2026-08', amount: 3000 },
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.groupTotals.get('g1')).toMatchObject({ assigned: 10000, available: 10000 });
    expect(e.rows.has('salary')).toBe(false);
    expect(e.assignedTotal).toBe(10000);
  });
});

describe('assignedFor', () => {
  it('reads a single assignment, defaulting to 0', () => {
    const S = store({ assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 42 }] });
    expect(assignedFor(S, 'groc', '2026-08')).toBe(42);
    expect(assignedFor(S, 'fun', '2026-08')).toBe(0);
  });
});
```

- [ ] **Step 2: Verify it fails** — module not found.

- [ ] **Step 3: Implement `src/lib/envelope.js`**

```js
// Envelope math: per-category monthly assignments with YNAB-faithful carryover.
// One fold from the earliest data month to the viewed month. Pure — no React.
import { hasOccurred, txBudgetImpact } from './calc.js';
import { addMonths } from './dates.js';

export function assignedFor(store, catId, month) {
  const a = (store.assignments || []).find(x => x.category === catId && x.month === month);
  return a ? a.amount : 0;
}

const monthOf = t => String(t.date || '').slice(0, 7);

// Earliest month that matters: first assignment or first counted transaction.
function earliestMonth(store, viewed) {
  let m = viewed;
  (store.assignments || []).forEach(a => { if (a.month < m) m = a.month; });
  (store.transactions || []).forEach(t => { const tm = monthOf(t); if (tm && tm < m) m = tm; });
  return m;
}

export function envelopeFor(store, month, now) {
  const cats = (store.categories || []).filter(c => c.type === 'expense' && c.status === 'active');
  const catIds = new Set(cats.map(c => c.id));

  // Bucket by month once: activity per cat, income total.
  const activityByMonth = new Map(); // month -> Map(cat -> signed activity)
  const incomeByMonth = new Map();
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending' || !hasOccurred(t, now)) return;
    const m = monthOf(t);
    if (!m) return;
    if (t.type === 'income') { incomeByMonth.set(m, (incomeByMonth.get(m) || 0) + t.amount); return; }
    if (!t.category || !catIds.has(t.category)) return;
    const impact = txBudgetImpact(store, t, { includeExcluded: true });
    if (!impact) return;
    let byCat = activityByMonth.get(m);
    if (!byCat) { byCat = new Map(); activityByMonth.set(m, byCat); }
    byCat.set(t.category, (byCat.get(t.category) || 0) - impact); // spending is negative activity
  });
  const assignedBy = new Map(); // month -> Map(cat -> amount)
  (store.assignments || []).forEach(a => {
    if (!catIds.has(a.category)) return;
    let byCat = assignedBy.get(a.month);
    if (!byCat) { byCat = new Map(); assignedBy.set(a.month, byCat); }
    byCat.set(a.category, a.amount);
  });

  // Fold months.
  let avail = new Map();        // cat -> available at end of previous month
  let rta = 0;
  let prevOverspend = 0;
  let rows = new Map();
  let income = 0, assignedTotal = 0;
  let m = earliestMonth(store, month);
  for (let guard = 0; guard < 600; guard++) {
    const act = activityByMonth.get(m) || new Map();
    const asg = assignedBy.get(m) || new Map();
    const next = new Map();
    rows = new Map();
    let overspend = 0;
    let monthAssigned = 0;
    cats.forEach(c => {
      const carryIn = Math.max(0, avail.get(c.id) || 0);
      const assigned = asg.get(c.id) || 0;
      const activity = act.get(c.id) || 0;
      const available = carryIn + assigned + activity;
      next.set(c.id, available);
      rows.set(c.id, { assigned, activity, available, carryIn });
      if (available < 0) overspend += -available;
      monthAssigned += assigned;
    });
    const monthIncome = incomeByMonth.get(m) || 0;
    rta = rta + monthIncome - monthAssigned - prevOverspend;
    if (m === month) { income = monthIncome; assignedTotal = monthAssigned; break; }
    prevOverspend = overspend;
    avail = next;
    m = addMonths(m, 1);
  }

  const groupTotals = new Map();
  cats.forEach(c => {
    const key = c.groupId || 'other';
    const r = rows.get(c.id);
    const g = groupTotals.get(key) || { assigned: 0, activity: 0, available: 0 };
    g.assigned += r.assigned; g.activity += r.activity; g.available += r.available;
    groupTotals.set(key, g);
  });
  return { rows, groupTotals, rta, income, assignedTotal };
}
```

- [ ] **Step 4: Run tests** — targeted PASS, full suite green, build clean.
- [ ] **Step 5: Commit** — `git add src/lib/envelope.js tests/envelope.test.js && git commit -m "Envelope: pure carryover/RTA math with tests"`

---

### Task 4: Store actions — assignments + group CRUD

**Files:**
- Modify: `src/store/actions.js`
- Test: `tests/envelope-actions.test.js` (create)

**Interfaces:**
- Produces: `setAssigned(data, {categoryId, month, amount})`, `addCategoryGroup(data, {name})`, `renameCategoryGroup(data, {id, name})`, `deleteCategoryGroup(data, {id})`, `setCategoryGroup(data, {categoryId, groupId})` — all pure, audited, new-object reducers.

- [ ] **Step 1: Write the failing test** (`tests/envelope-actions.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { setAssigned, addCategoryGroup, renameCategoryGroup, deleteCategoryGroup, setCategoryGroup } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' }],
  assignments: [], transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

describe('setAssigned', () => {
  it('creates, updates, and removes-at-zero', () => {
    let s = setAssigned(store(), { categoryId: 'groc', month: '2026-08', amount: 5000 });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]).toMatchObject({ category: 'groc', month: '2026-08', amount: 5000 });
    s = setAssigned(s, { categoryId: 'groc', month: '2026-08', amount: 7000 });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0].amount).toBe(7000);
    s = setAssigned(s, { categoryId: 'groc', month: '2026-08', amount: 0 });
    expect(s.assignments).toHaveLength(0);
  });
  it('audits with entityType assignment and is a no-op for no change', () => {
    const s0 = store();
    const s1 = setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 100 });
    expect(s1.audit[0]).toMatchObject({ entityType: 'assignment' });
    expect(setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 0 })).toBe(s0);
  });
});

describe('group CRUD', () => {
  it('adds with a uid and next sortOrder', () => {
    const s = addCategoryGroup(store(), { name: 'Wants' });
    expect(s.categoryGroups).toHaveLength(2);
    expect(s.categoryGroups[1]).toMatchObject({ name: 'Wants', sortOrder: 2 });
  });
  it('renames', () => {
    const s = renameCategoryGroup(store(), { id: 'g1', name: 'Essentials' });
    expect(s.categoryGroups[0].name).toBe('Essentials');
  });
  it('delete clears members’ groupId', () => {
    const s = deleteCategoryGroup(store(), { id: 'g1' });
    expect(s.categoryGroups).toHaveLength(0);
    expect(s.categories[0].groupId).toBeUndefined();
  });
  it('setCategoryGroup moves a category', () => {
    const s0 = addCategoryGroup(store(), { name: 'Wants' });
    const g2 = s0.categoryGroups[1].id;
    const s = setCategoryGroup(s0, { categoryId: 'groc', groupId: g2 });
    expect(s.categories[0].groupId).toBe(g2);
  });
});
```

- [ ] **Step 2: Verify it fails.**

- [ ] **Step 3: Implement in `actions.js`** (near the category actions; reuse `uid`, `makeAudit`, `stampUpdate`):

```js
// ---- Envelope: per-month assignments + category groups -----------------------
export function setAssigned(data, { categoryId, month, amount }) {
  const existing = (data.assignments || []).find(a => a.category === categoryId && a.month === month);
  const amt = Math.round(amount) || 0;
  if (!existing && amt === 0) return data;
  if (existing && existing.amount === amt) return data;
  const assignments = amt === 0
    ? data.assignments.filter(a => a !== existing)
    : existing
      ? data.assignments.map(a => (a === existing ? { ...a, amount: amt } : a))
      : [...(data.assignments || []), { id: uid(), category: categoryId, month, amount: amt }];
  const cat = data.categories.find(c => c.id === categoryId);
  return {
    ...data, assignments,
    audit: [makeAudit({
      entityType: 'assignment', entityId: categoryId + '|' + month, action: existing ? (amt === 0 ? 'delete' : 'update') : 'create',
      summary: 'Assigned ' + amt + ' to ' + (cat ? cat.name : categoryId) + ' for ' + month,
      before: { amount: existing ? existing.amount : 0 }, after: { amount: amt },
    }), ...(data.audit || [])],
  };
}

export function addCategoryGroup(data, { name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return data;
  const sortOrder = (data.categoryGroups || []).reduce((m, g) => Math.max(m, g.sortOrder || 0), 0) + 1;
  const g = { id: uid(), name: trimmed, sortOrder };
  return {
    ...data, categoryGroups: [...(data.categoryGroups || []), g],
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: g.id, action: 'create', summary: 'Added group ' + trimmed }), ...(data.audit || [])],
  };
}

export function renameCategoryGroup(data, { id, name }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  const trimmed = String(name || '').trim();
  if (!g || !trimmed || g.name === trimmed) return data;
  return {
    ...data,
    categoryGroups: data.categoryGroups.map(x => (x.id === id ? { ...x, name: trimmed } : x)),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'update', summary: 'Renamed group to ' + trimmed, before: { name: g.name }, after: { name: trimmed } }), ...(data.audit || [])],
  };
}

export function deleteCategoryGroup(data, { id }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  if (!g) return data;
  return {
    ...data,
    categoryGroups: data.categoryGroups.filter(x => x.id !== id),
    categories: data.categories.map(c => {
      if (c.groupId !== id) return c;
      const { groupId, ...rest } = c;
      return rest;
    }),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'delete', summary: 'Deleted group ' + g.name }), ...(data.audit || [])],
  };
}

export function setCategoryGroup(data, { categoryId, groupId }) {
  const c = data.categories.find(x => x.id === categoryId);
  if (!c || c.groupId === groupId) return data;
  return {
    ...data,
    categories: data.categories.map(x => (x.id === categoryId ? stampUpdate({ ...x, groupId }) : x)),
    audit: [makeAudit({ entityType: 'category', entityId: categoryId, action: 'update', summary: 'Moved ' + c.name + ' to a group', before: { groupId: c.groupId }, after: { groupId } }), ...(data.audit || [])],
  };
}
```

- [ ] **Step 4: Run tests + suite + build.**
- [ ] **Step 5: Commit** — `git add src/store/actions.js tests/envelope-actions.test.js && git commit -m "Envelope: setAssigned + category-group CRUD actions with tests"`

---

### Task 5: Adoption — YNAB tree + budget import

**Files:**
- Create: `src/lib/ynabTree.js`
- Modify: `src/store/actions.js`
- Test: `tests/adopt-ynab.test.js` (create)

**Interfaces:**
- Consumes: group CRUD internals from Task 4 patterns; `uid`, `makeAudit`, `stampUpdate`.
- Produces: `YNAB_TREE` (data), `normName(s)` (matching key), `adoptYnabTree(data)`, `importBudgetsAsAssignments(data, { month })` — both idempotent.

- [ ] **Step 1: Create `src/lib/ynabTree.js`**

```js
// The category tree captured live from the user's YNAB plan (see
// docs/superpowers/specs/2026-08-08-ynab-budget-reference.md). Display names
// keep their emoji; matching strips them.
export const YNAB_TREE = [
  { group: 'Recoverable (advances)', categories: ['Household advance', 'Roommate advance'] },
  { group: 'Bills', categories: ['🏠 Rent/Mortgage', '📱 Phone & Internet', '⚡️ Utilities'] },
  { group: 'Needs', categories: ['Cleaning & maintenance', '🤲 Charity & Zakat', '👪 Family support', '🎓 Education', '⛽️ Fuel', '🛒 Groceries', '🚘 Transportation', '🩺 Medical expenses', '😌 Emergency fund'] },
  { group: 'Wants', categories: ['Pet care', 'Food Delivery', '🛍️ Shopping', '🍽️ Dining out', '🍿 Entertainment', '🏝️ Vacation', '❗️ Stuff I forgot to plan for', '🌳 YNAB subscription'] },
];
export const OTHER_GROUP = 'Other';

// Matching key: lowercase letters+digits only — drops emoji, punctuation and
// spacing, so 'Transport' matches '🚘 Transportation' ONLY via aliases below,
// while '🛒 Groceries' matches 'Groceries' directly.
export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Raqam seed names that map to a DIFFERENT YNAB name (norm(seed) → norm(ynab)).
export const ALIASES = {
  [normName('Transport')]: normName('Transportation'),
  [normName('Dining')]: normName('Dining out'),
  [normName('Mobile & Internet')]: normName('Phone & Internet'),
  [normName('Rent')]: normName('Rent/Mortgage'),
  [normName('Healthcare')]: normName('Medical expenses'),
  [normName('Charity & zakat')]: normName('Charity & Zakat'),
};
```

- [ ] **Step 2: Write the failing test** (`tests/adopt-ynab.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { adoptYnabTree, importBudgetsAsAssignments } from '../src/store/actions.js';
import { YNAB_TREE, normName } from '../src/lib/ynabTree.js';
import { freshStore } from '../src/store/seed.js';

const allYnabNames = YNAB_TREE.flatMap(g => g.categories);

describe('adoptYnabTree', () => {
  it('creates the 4 groups + Other, renames matches, creates missing, leaves income alone', () => {
    const s = adoptYnabTree(freshStore());
    const groupNames = s.categoryGroups.map(g => g.name);
    expect(groupNames).toEqual(['Recoverable (advances)', 'Bills', 'Needs', 'Wants', 'Other']);
    // seed 'Transport' renamed to the YNAB display name via alias:
    expect(s.categories.find(c => c.id === 'transport').name).toBe('🚘 Transportation');
    expect(s.categories.find(c => c.id === 'rent').name).toBe('🏠 Rent/Mortgage');
    // every YNAB name exists exactly once:
    allYnabNames.forEach(n => {
      expect(s.categories.filter(c => c.name === n)).toHaveLength(1);
    });
    // Raqam-only expense category falls into Other:
    const other = s.categoryGroups.find(g => g.name === 'Other');
    expect(s.categories.find(c => c.id === 'fees').groupId).toBe(other.id);
    // income untouched:
    expect(s.categories.find(c => c.id === 'salary').groupId).toBeUndefined();
    expect(s.categories.find(c => c.id === 'salary').name).toBe('Salary');
  });

  it('is idempotent', () => {
    const once = adoptYnabTree(freshStore());
    const twice = adoptYnabTree(once);
    expect(twice).toBe(once);
  });

  it('assigns every YNAB category to its right group', () => {
    const s = adoptYnabTree(freshStore());
    const byName = Object.fromEntries(s.categoryGroups.map(g => [g.name, g.id]));
    YNAB_TREE.forEach(g => g.categories.forEach(n => {
      expect(s.categories.find(c => c.name === n).groupId).toBe(byName[g.group]);
    }));
  });
});

describe('importBudgetsAsAssignments', () => {
  it('copies standing category budgets into the month, skipping existing, idempotent', () => {
    const base = { ...freshStore(), budgets: [
      { id: 'b1', category: 'groceries', amount: 25000, rollover: false },
      { id: 'b2', category: null, amount: 99999, label: 'Overall monthly budget' },
    ] };
    const s1 = importBudgetsAsAssignments(base, { month: '2026-08' });
    expect(s1.assignments).toHaveLength(1);
    expect(s1.assignments[0]).toMatchObject({ category: 'groceries', month: '2026-08', amount: 25000 });
    expect(importBudgetsAsAssignments(s1, { month: '2026-08' })).toBe(s1);
  });
});
```

- [ ] **Step 3: Verify it fails.**

- [ ] **Step 4: Implement in `actions.js`**

```js
import { YNAB_TREE, OTHER_GROUP, ALIASES, normName } from '../lib/ynabTree.js';

// One-click adoption of the captured YNAB tree. Idempotent: returns `data`
// unchanged (same reference) when everything is already in place.
export function adoptYnabTree(data) {
  let changed = false;
  let groups = [...(data.categoryGroups || [])];
  const groupIdByName = {};
  [...YNAB_TREE.map(g => g.group), OTHER_GROUP].forEach((name, i) => {
    let g = groups.find(x => x.name === name);
    if (!g) { g = { id: uid(), name, sortOrder: i + 1 }; groups.push(g); changed = true; }
    groupIdByName[name] = g.id;
  });

  const seedColors = ['#0F766E', '#B7791F', '#2563EB', '#64748B', '#7C3AED', '#DC2626'];
  let categories = [...data.categories];
  const matchKey = c => ALIASES[normName(c.name)] || normName(c.name);
  YNAB_TREE.forEach(g => g.categories.forEach((display, i) => {
    const want = normName(display);
    const hit = categories.find(c => c.type === 'expense' && matchKey(c) === want);
    if (hit) {
      if (hit.name !== display || hit.groupId !== groupIdByName[g.group]) {
        categories = categories.map(c => (c === hit ? stampUpdate({ ...c, name: display, groupId: groupIdByName[g.group] }) : c));
        changed = true;
      }
    } else {
      categories.push({
        id: uid(), name: display, type: 'expense', color: seedColors[i % seedColors.length],
        icon: 'circle', sortOrder: 99, isSystem: false, status: 'active', description: '',
        excludeFromBudget: false, groupId: groupIdByName[g.group],
      });
      changed = true;
    }
  }));
  // Raqam-only active expense categories without a group land in Other.
  categories = categories.map(c => {
    if (c.type !== 'expense' || c.status !== 'active' || c.groupId) return c;
    changed = true;
    return stampUpdate({ ...c, groupId: groupIdByName[OTHER_GROUP] });
  });
  if (!changed) return data;
  return {
    ...data, categoryGroups: groups, categories,
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: 'adopt', action: 'create', summary: 'Organized categories into groups (YNAB set)' }), ...(data.audit || [])],
  };
}

// Copy standing per-category budgets into `month` assignments. Skips the
// overall budget and any category that already has an assignment that month.
export function importBudgetsAsAssignments(data, { month }) {
  const existing = new Set((data.assignments || []).filter(a => a.month === month).map(a => a.category));
  const add = (data.budgets || [])
    .filter(b => b.category && b.amount > 0 && !existing.has(b.category))
    .map(b => ({ id: uid(), category: b.category, month, amount: b.amount }));
  if (add.length === 0) return data;
  return {
    ...data, assignments: [...(data.assignments || []), ...add],
    audit: [makeAudit({ entityType: 'assignment', entityId: 'import|' + month, action: 'create', summary: 'Imported ' + add.length + ' budget amounts as ' + month + ' assignments' }), ...(data.audit || [])],
  };
}
```

Note: `adoptYnabTree`'s idempotency test requires exact reference equality on re-run — ensure no `stampUpdate`/copy happens when nothing changed (the `changed` flag guards it).

- [ ] **Step 5: Run tests + suite + build.**
- [ ] **Step 6: Commit** — `git add src/lib/ynabTree.js src/store/actions.js tests/adopt-ynab.test.js && git commit -m "Envelope: YNAB tree adoption + budget import actions (idempotent) with tests"`

---

### Task 6: Plan screen + route swap

**Files:**
- Create: `src/screens/Plan.jsx`
- Modify: `src/App.jsx` (route `/budget` index → `Plan`)

**Interfaces:**
- Consumes: `envelopeFor`/`assignedFor` (T3), `setAssigned` + group CRUD (T4), `adoptYnabTree`/`importBudgetsAsAssignments` (T5), `useStore`, `useMonth`, `useMoney`, `useUI().notify`, `parseAmt` (`src/lib/format.js`), popover pattern from `src/ui/BulkBar.jsx`'s MoreMenu, category-add via a small inline popover (name-only → `upsertCategory` with the group preselected — check `upsertCategory`'s form contract in actions.js and pass the minimal valid form).
- Produces: the `/budget` index screen. `Budgets.jsx` stays in-tree, unrouted.

- [ ] **Step 1: Build `Plan.jsx`** — structure (follow the reference doc's tokens; all module-scope components):

```
Plan
├─ AdoptionBanner        // until groups exist AND (no standing budgets OR imported); two buttons + dismiss (prefs.planBannerDismissed)
├─ header row            // RTA banner (money(rta), state colors) · view toggle (prefs.planView) · ＋ Category Group (popover: name input, OK→addCategoryGroup)
└─ table
   ├─ thead: CATEGORY / ASSIGNED / ACTIVITY / AVAILABLE   (14/500, ls .6px)
   └─ per group (sortOrder; 'Other' renders only if it has members):
      ├─ GroupRow    // 40px #F8F6F2 (var(--elev) in dark): chevron collapse (local state Set), name 16/600,
      │              // hover ＋ (popover: category name → upsertCategory {name, type:'expense', groupId}), group totals per column
      └─ CategoryRow // 44px: name 16/500 (+ progress bar & "Spent X of Y" note when prefs.planView !== 'compact'),
                     // ASSIGNED → click-to-edit <input inputMode="numeric"> commit Enter/blur → applyData(setAssigned(...)), Esc cancels
                     // ACTIVITY → signed muted number (moneyS)
                     // AVAILABLE → pill: green available>0 / beige 0 / red <0 (radius 999)
```

Wiring specifics:
- `const { data: S, applyData, prefs, setPrefs } = useStore(); const { month } = useMonth(); const { money, moneyS } = useMoney();`
- `const env = envelopeFor(S, month, nowIso());` recomputed per render (memo on `[S, month]` if needed).
- Groups render order: `S.categoryGroups` by `sortOrder`; categories inside by `sortOrder` then name; only active expense categories.
- Progress fill = `min(1, spend / (carryIn + assigned))` where `spend = −activity` (0 target → full red when spend > 0); overspent portion red (`var(--neg)`), else green (`var(--pos)`).
- RTA banner colors: positive `#C9EE8F`-tinted bg / near-black text; zero `var(--elev)` muted; negative `var(--neg-soft)` + `var(--neg)` amount. Amount 21/700, label 14 muted.
- Popovers: absolute card w/ caret, Escape-closes (capture + stopPropagation), outside-click closes — copy the TxMonthNav dismissal contract.

- [ ] **Step 2: Route swap** — in `src/App.jsx`: import `Plan`, change the `/budget` index route element from `<Budgets />` to `<Plan />`, drop the now-unused `Budgets` import if unreferenced.

- [ ] **Step 3: Run suite + build** — `npx vitest run --exclude '**/.claude/**'` green (`tests/no-inline-components.test.js` now scans Plan.jsx — all subcomponents must be module-scope); `npx vite build` clean.

- [ ] **Step 4: Playwright verification (dev server 5207, real data)**
  - `/#/budget` renders the adoption banner → click "Organize into groups" → the 4 groups + Other appear with the user's categories renamed/placed; click "Import budgets" → ASSIGNED populates for the current month; banner disappears.
  - Compare side-by-side with the YNAB tab (same design reference): header, group rows, pills.
  - Edit an ASSIGNED cell → RTA and the row's AVAILABLE update immediately; Cmd+Z undoes.
  - Collapse a group; toggle progress⟷compact; add a group via ＋ Category Group; add a category via the group-row ＋.
  - Month-step back and forward: carryover shows in AVAILABLE, RTA accumulates.

- [ ] **Step 5: Commit** — `git add src/screens/Plan.jsx src/App.jsx && git commit -m "Envelope: Plan screen (YNAB-style table) replaces the budget index"`

---

## Self-Review notes

- **Spec coverage:** migration (T1), store/sync (T2), envelope math incl. carryover/overspend/RTA (T3), setAssigned + group CRUD (T4), adoption + import idempotent (T5), plan table with RTA banner, view toggle, group popovers, click-to-edit assigned, route swap (T6). Income-category exclusion enforced in envelope.js and Plan rendering. Old budgets untouched.
- **Type consistency:** `envelopeFor(store, month, now)` return shape used by Plan.jsx matches T3's export; `setAssigned({categoryId, month, amount})` called identically in T6; `YNAB_TREE`/`normName`/`ALIASES` shapes match between T5's lib and actions.
- **No placeholders:** every code step carries real code; T6's component is specified structurally with exact wiring because it is pure JSX assembly of already-specified pieces (visual values live in the committed reference doc).
- **Verification note:** screens are not unit-testable here (no jsdom); T6 verifies via build + the `no-inline-components` guard + live Playwright against real data, per project convention.
- **Deploy step:** `0011_envelope.sql` must be applied to the Supabase project before sync will accept the new collections — surfaced to the user at finish.
