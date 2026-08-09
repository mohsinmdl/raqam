# Category Targets (Monthly) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YNAB-style Monthly category targets (both Set-aside-another and Refill-up-to modes), managed inline in the Plan inspector's Target card, unlocking the Underfunded/Overfunded filter pills, Cost-to-Be-Me, target-aware progress bars, and target-aware Auto-Assign.

**Architecture:** Three nullable columns on `categories` (additive migration, flow through the existing sync mapping). A pure `src/lib/targets.js` holds all target math. Store actions `setTarget`/`clearTarget`/`setCategoryExcluded` mutate them (the exclude→clear logic is factored out of `upsertCategory` and shared). A new inline `TargetCard` in the inspector renders the editor + exclude toggle; the progress bars, filter pills, Cost-to-Be-Me line, and Auto-Assign "Underfunded" action all read the pure math.

**Tech Stack:** React 18 + Vite, vitest (no jsdom — UI verified via Playwright), inline styles over CSS-variable tokens, Supabase-backed sync (`src/store/sync.js` diff differ), pure reducers returning same-ref on no-op.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-category-targets-design.md`. YNAB target feature captured live 2026-08-09.
- **v1 = Monthly cadence only, both modes.** The editor renders Weekly/Yearly/Custom cadence tabs **disabled** (`title="Coming later"`), only Monthly enabled — same idiom as the disabled Auto-Assign "⚡ Auto" tab.
- **Target fields are columns on `categories`** (one target per category): `targetAmount` (bigint PKR, `null` = no target), `targetMode` (`'setaside'` | `'refill'`), `targetDueDay` (`null` = last day of month, else 1–28). Client keys camelCase; DB `target_amount`/`target_mode`/`target_due_day`.
- **A target is never a partial row:** `targetAmount`, `targetMode` are set together or all three are null. `targetMode` is non-null exactly when `targetAmount` is non-null.
- **Math (exact):** `available` is the fold's already-clamped value. Refill need = `max(0, amount − available)`; Set-aside need = `max(0, amount − assigned)`. Over-target: refill `available > amount`, setaside `assigned > amount`.
- **`hasTarget(cat)` is false when `cat.excludeFromBudget` is true** — an excluded category never has a live target. Enabling exclusion **clears** any target (and any legacy budget) in one step.
- Amounts are integer PKR, `Math.round`ed defensively.
- All components module-scope (a guard test scans `src/screens/*.jsx`; keep inspector components module-scope in `src/ui/plan/*` too).
- Copy (exact): "Create Target" · "I need" · "Set aside another" · "Refill up to" · "Last Day of Month" · "Save Target" · "Cancel" · "Delete" · "Weekly"/"Monthly"/"Yearly"/"Custom" · "Coming later" · "Underfunded" · "Overfunded" · "Cost to Be Me" · "Exclude from budgets". Mode helper copy: set-aside "Use for: bills, subscriptions, saving over time"; refill "Use for: gasoline, fun money, dining out. Whatever you don't spend applies toward next month."
- Audit: target edits use `entityType: 'category', action: 'update'` (already permitted — no audit-CHECK migration).

---

### Task 1: Migration + sync mapping

**Files:**
- Create: `supabase/migrations/0013_targets.sql`
- Modify: `src/store/sync.js` (categories `toRow`/`fromRow`, ~lines 54-71)
- Test: `tests/target-sync.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: category client shape gains `targetAmount?: number`, `targetMode?: 'setaside'|'refill'`, `targetDueDay?: number`. `toRow` writes `target_amount`/`target_mode`/`target_due_day` as explicit `null` when absent (phantom-diff discipline).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0013_targets.sql`:
```sql
-- Monthly category targets. Additive & nullable (mirrors 0006_exclude_from_budget.sql).
alter table public.categories add column if not exists target_amount  bigint;
alter table public.categories add column if not exists target_mode    text
  check (target_mode is null or target_mode in ('setaside','refill'));
alter table public.categories add column if not exists target_due_day smallint
  check (target_due_day is null or (target_due_day between 1 and 28));
```

- [ ] **Step 2: Write the failing round-trip test**

`tests/target-sync.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/store/sync.js';

const categories = COLLECTIONS.find(c => c.name === 'categories');

describe('categories sync mapping — target fields', () => {
  it('toRow serializes target fields, defaulting to explicit null', () => {
    const bare = categories.toRow({ id: 'c1', name: 'Rent', type: 'expense', color: '#000', excludeFromBudget: false });
    expect(bare.target_amount).toBe(null);
    expect(bare.target_mode).toBe(null);
    expect(bare.target_due_day).toBe(null);
    const withT = categories.toRow({ id: 'c2', name: 'Fuel', type: 'expense', color: '#000', targetAmount: 25000, targetMode: 'refill', targetDueDay: 15 });
    expect(withT.target_amount).toBe(25000);
    expect(withT.target_mode).toBe('refill');
    expect(withT.target_due_day).toBe(15);
  });
  it('fromRow hydrates target fields and omits them when null', () => {
    const bare = categories.fromRow({ id: 'c1', name: 'Rent', type: 'expense', color: '#000', target_amount: null, target_mode: null, target_due_day: null });
    expect('targetAmount' in bare).toBe(false);
    expect('targetMode' in bare).toBe(false);
    const withT = categories.fromRow({ id: 'c2', name: 'Fuel', type: 'expense', color: '#000', target_amount: 25000, target_mode: 'setaside', target_due_day: null });
    expect(withT.targetAmount).toBe(25000);
    expect(withT.targetMode).toBe('setaside');
    expect('targetDueDay' in withT).toBe(false); // null due-day = last day of month, omitted
  });
});
```

Note: if `COLLECTIONS` is not exported from `src/store/sync.js`, add `export` to its declaration in the same task (it is the array of collection definitions containing the `categories` entry).

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/target-sync.test.js` → FAIL (target fields undefined / COLLECTIONS not exported).

- [ ] **Step 4: Extend the categories mapping in `src/store/sync.js`**

In `toRow` (after `exclude_from_budget: ...`):
```js
      target_amount: r.targetAmount ?? null,
      target_mode: r.targetMode ?? null,
      target_due_day: r.targetDueDay ?? null,
```
In `fromRow` (inside `stripNulls({...})`, after `excludeFromBudget: ...`):
```js
      targetAmount: r.target_amount ?? undefined,
      targetMode: r.target_mode || undefined,
      targetDueDay: r.target_due_day ?? undefined,
```
(`stripNulls` drops `undefined` keys, so a null column hydrates as an absent key — matching the test.)

- [ ] **Step 5: Run to verify it passes + full suite + build**

Run: `npx vitest run tests/target-sync.test.js` → PASS. Then `npx vitest run` (full suite green) and `npx vite build` (clean).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_targets.sql src/store/sync.js tests/target-sync.test.js
git commit -m "feat(targets): migration 0013 + category sync mapping for target fields"
```

---

### Task 2: Pure target math — `src/lib/targets.js`

**Files:**
- Create: `src/lib/targets.js`
- Test: `tests/targets.test.js`

**Interfaces:**
- Consumes: the envelope fold row shape `{ assigned, activity, available, carryIn }` (`src/lib/envelope.js:203`), and a category object with `targetAmount`/`targetMode`/`excludeFromBudget`.
- Produces: `hasTarget(cat)`, `targetNeeded(row, cat)`, `isOverTarget(row, cat)`, `costToBeMe(cats)`, `targetSummary(cat, money)`.

- [ ] **Step 1: Write the failing tests**

`tests/targets.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { hasTarget, targetNeeded, isOverTarget, costToBeMe, targetSummary } from '../src/lib/targets.js';

const money = n => 'Rs ' + n.toLocaleString('en-US');
const cat = over => ({ id: 'c', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: false, ...over });
const row = over => ({ assigned: 0, activity: 0, available: 0, carryIn: 0, ...over });

describe('hasTarget', () => {
  it('true only with a positive amount and not excluded', () => {
    expect(hasTarget(cat({ targetAmount: 5000, targetMode: 'refill' }))).toBe(true);
    expect(hasTarget(cat({ targetAmount: 0, targetMode: 'refill' }))).toBe(false);
    expect(hasTarget(cat({}))).toBe(false);
    expect(hasTarget(cat({ targetAmount: 5000, targetMode: 'refill', excludeFromBudget: true }))).toBe(false);
  });
});

describe('targetNeeded', () => {
  it('refill: shortfall against available, floored at 0', () => {
    const c = cat({ targetAmount: 10000, targetMode: 'refill' });
    expect(targetNeeded(row({ available: 3000 }), c)).toBe(7000);
    expect(targetNeeded(row({ available: 10000 }), c)).toBe(0);
    expect(targetNeeded(row({ available: 12000 }), c)).toBe(0); // over-funded floors at 0
  });
  it('setaside: shortfall against assigned, ignoring carry-in', () => {
    const c = cat({ targetAmount: 5000, targetMode: 'setaside' });
    expect(targetNeeded(row({ assigned: 2000, carryIn: 9999, available: 11999 }), c)).toBe(3000);
    expect(targetNeeded(row({ assigned: 5000 }), c)).toBe(0);
  });
  it('is 0 when there is no target or the category is excluded', () => {
    expect(targetNeeded(row({ available: 0 }), cat({}))).toBe(0);
    expect(targetNeeded(row({ available: 0 }), cat({ targetAmount: 9000, targetMode: 'refill', excludeFromBudget: true }))).toBe(0);
  });
});

describe('isOverTarget', () => {
  it('refill compares available, setaside compares assigned', () => {
    expect(isOverTarget(row({ available: 12000 }), cat({ targetAmount: 10000, targetMode: 'refill' }))).toBe(true);
    expect(isOverTarget(row({ available: 10000 }), cat({ targetAmount: 10000, targetMode: 'refill' }))).toBe(false);
    expect(isOverTarget(row({ assigned: 6000 }), cat({ targetAmount: 5000, targetMode: 'setaside' }))).toBe(true);
    expect(isOverTarget(row({ assigned: 6000 }), cat({}))).toBe(false); // no target
  });
});

describe('costToBeMe', () => {
  it('sums targetAmount over targeted, non-excluded cats only', () => {
    const cats = [
      cat({ id: 'a', targetAmount: 5000, targetMode: 'refill' }),
      cat({ id: 'b', targetAmount: 3000, targetMode: 'setaside', excludeFromBudget: true }), // excluded → skip
      cat({ id: 'c' }), // no target → skip
      cat({ id: 'd', targetAmount: 2000, targetMode: 'refill' }),
    ];
    expect(costToBeMe(cats)).toBe(7000);
  });
});

describe('targetSummary', () => {
  it('reads mode + amount + monthly cadence', () => {
    expect(targetSummary(cat({ targetAmount: 25000, targetMode: 'refill' }), money)).toBe('Refill up to Rs 25,000 monthly');
    expect(targetSummary(cat({ targetAmount: 5000, targetMode: 'setaside' }), money)).toBe('Set aside Rs 5,000 monthly');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/targets.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/targets.js`**

```js
// Monthly category-target math (v1). Pure. Reads the envelope fold row shape
// { assigned, activity, available, carryIn } from src/lib/envelope.js.
// Spec: docs/superpowers/specs/2026-08-09-category-targets-design.md
//
// Two modes: 'refill' (spend-envelope — need enough to bring AVAILABLE up to the
// amount; leftover reduces it) and 'setaside' (savings — need another amount
// ASSIGNED each month; carry-in is ignored).

export function hasTarget(cat) {
  return !!cat && !cat.excludeFromBudget && typeof cat.targetAmount === 'number' && cat.targetAmount > 0;
}

export function targetNeeded(row, cat) {
  if (!hasTarget(cat)) return 0;
  const have = cat.targetMode === 'setaside' ? (row.assigned || 0) : (row.available || 0);
  return Math.max(0, Math.round(cat.targetAmount - have));
}

export function isOverTarget(row, cat) {
  if (!hasTarget(cat)) return false;
  const have = cat.targetMode === 'setaside' ? (row.assigned || 0) : (row.available || 0);
  return have > cat.targetAmount;
}

export function costToBeMe(cats) {
  return (cats || []).reduce((n, c) => n + (hasTarget(c) ? Math.round(c.targetAmount) : 0), 0);
}

export function targetSummary(cat, money) {
  if (!hasTarget(cat)) return '';
  const verb = cat.targetMode === 'setaside' ? 'Set aside' : 'Refill up to';
  return verb + ' ' + money(Math.round(cat.targetAmount)) + ' monthly';
}
```

- [ ] **Step 4: Run to verify it passes + full suite + build**

Run: `npx vitest run tests/targets.test.js` → PASS. Then `npx vitest run` + `npx vite build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/targets.js tests/targets.test.js
git commit -m "feat(targets): pure monthly-target math (needed/over/cost/summary)"
```

---

### Task 3: Store actions — `setTarget` / `clearTarget` / `setCategoryExcluded`

**Files:**
- Modify: `src/store/actions.js` (`CAT_AUDIT_FIELDS` ~line 762; refactor exclude→clear out of `upsertCategory` ~lines 798-802; add the three actions)
- Test: `tests/target-actions.test.js`

**Interfaces:**
- Consumes: `makeAudit`, `stampUpdate`, `diffFields` (already imported in actions.js).
- Produces:
  - `setTarget(data, { id, amount, mode, dueDay }) → data'`
  - `clearTarget(data, { id }) → data'`
  - `setCategoryExcluded(data, { id, excluded }) → data'`
  - `CAT_AUDIT_FIELDS` extended with `'targetAmount', 'targetMode', 'targetDueDay'`.

- [ ] **Step 1: Write the failing tests**

`tests/target-actions.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { setTarget, clearTarget, setCategoryExcluded } from '../src/store/actions.js';

const store = over => ({
  categories: [{ id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: false }],
  budgets: [{ id: 'b1', category: 'fuel', amount: 5000, rollover: false }],
  categoryGroups: [], assignments: [], transactions: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const catOf = (s, id = 'fuel') => s.categories.find(c => c.id === id);

describe('setTarget', () => {
  it('writes all three fields together with one audit row', () => {
    const s = setTarget(store(), { id: 'fuel', amount: 25000, mode: 'refill', dueDay: 15 });
    expect(catOf(s)).toMatchObject({ targetAmount: 25000, targetMode: 'refill', targetDueDay: 15 });
    expect(s.audit[0]).toMatchObject({ entityType: 'category', entityId: 'fuel', action: 'update' });
  });
  it('rounds and floors the amount; a 0 amount clears the target', () => {
    const withT = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'setaside' });
    const cleared = setTarget(withT, { id: 'fuel', amount: 0, mode: 'setaside' });
    expect(catOf(cleared).targetAmount).toBeUndefined();
    expect(catOf(cleared).targetMode).toBeUndefined();
  });
  it('no-ops by reference for a missing or excluded category, or an unchanged target', () => {
    const s0 = store();
    expect(setTarget(s0, { id: 'nope', amount: 100, mode: 'refill' })).toBe(s0);
    const ex = store({ categories: [{ id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: true }] });
    expect(setTarget(ex, { id: 'fuel', amount: 100, mode: 'refill' })).toBe(ex);
    const s1 = setTarget(s0, { id: 'fuel', amount: 5000, mode: 'refill', dueDay: null });
    expect(setTarget(s1, { id: 'fuel', amount: 5000, mode: 'refill', dueDay: null })).toBe(s1);
  });
});

describe('clearTarget', () => {
  it('nulls the target fields; no-ops when there is no target', () => {
    const s1 = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill' });
    const cleared = clearTarget(s1, { id: 'fuel' });
    expect(catOf(cleared).targetAmount).toBeUndefined();
    expect(clearTarget(store(), { id: 'fuel' })).toBe(store()); // reference equal? build a stable ref:
  });
});

describe('setCategoryExcluded', () => {
  it('turning on clears budget AND target in one step', () => {
    const withT = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill' });
    const s = setCategoryExcluded(withT, { id: 'fuel', excluded: true });
    expect(catOf(s).excludeFromBudget).toBe(true);
    expect(catOf(s).targetAmount).toBeUndefined();
    expect(s.budgets.find(b => b.category === 'fuel')).toBeUndefined();
  });
  it('turning off just flips the flag; no-op when unchanged', () => {
    const s0 = store();
    expect(setCategoryExcluded(s0, { id: 'fuel', excluded: false })).toBe(s0); // already false
    const on = setCategoryExcluded(s0, { id: 'fuel', excluded: true });
    const off = setCategoryExcluded(on, { id: 'fuel', excluded: false });
    expect(catOf(off).excludeFromBudget).toBe(false);
  });
});
```

Fix the `clearTarget` no-op assertion to use a captured reference:
```js
    const noTarget = store();
    expect(clearTarget(noTarget, { id: 'fuel' })).toBe(noTarget);
```
(Replace the inline `store()` comparison — two `store()` calls are different objects.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/target-actions.test.js` → FAIL (actions not exported).

- [ ] **Step 3: Extend `CAT_AUDIT_FIELDS` and factor the exclude→clear helper**

In `src/store/actions.js`, extend the constant:
```js
const CAT_AUDIT_FIELDS = ['name', 'type', 'icon', 'color', 'description', 'sortOrder', 'excludeFromBudget', 'targetAmount', 'targetMode', 'targetDueDay'];
```

Add a module-scope helper that both `upsertCategory` and `setCategoryExcluded` use. It takes the already-updated `next` store, the category id, and whether exclusion just turned on, and drops the budget + target, appending the budget-drop audit row (target clearing is captured by the category diff, so no separate audit row):
```js
// When a category becomes excluded from budgets it must not keep an unusable
// budget or target. Shared by upsertCategory (drawer) and setCategoryExcluded
// (inspector) so the two never diverge. Mutates `next` in place; returns it.
function dropBudgetAndTargetOnExclude(next, id, name) {
  const dropped = next.budgets.find(b => b.category === id);
  if (dropped) {
    next.budgets = next.budgets.filter(b => b.id !== dropped.id);
    next.audit = [makeAudit({ entityType: 'budget', entityId: dropped.id, action: 'delete', summary: 'Budget removed — “' + name + '” excluded from budgets', before: { category: id, amount: dropped.amount, rollover: !!dropped.rollover } }), ...next.audit];
  }
  return next;
}
```

In `upsertCategory`, replace the existing inline drop block (currently lines ~798-802) so that, when `excluded && !before.excludeFromBudget`, it ALSO nulls the target on the updated category and calls the helper. The updated category row is `next.categories[i]`; set its target fields to `undefined` before computing the audit diff so the diff records the target removal:
```js
  // (inside the `editing` branch, after stampUpdate) if newly excluded, strip target too:
  if (excluded && before && !before.excludeFromBudget) {
    const i = next.categories.findIndex(c => c.id === id);
    next.categories[i] = { ...next.categories[i], targetAmount: undefined, targetMode: undefined, targetDueDay: undefined };
  }
```
Then where the audit diff + budget drop happen, replace the inline `dropped` block with `dropBudgetAndTargetOnExclude(next, id, after.name)` (the diff over `CAT_AUDIT_FIELDS` now already captures the nulled target fields).

- [ ] **Step 4: Implement the three actions**

Add after `upsertCategory` (near `setCategoryNote`):
```js
// Monthly target for a category. amount<=0 clears it. Excluded categories reject.
export function setTarget(data, { id, amount, mode, dueDay }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0) return data;
  const cur = data.categories[i];
  if (cur.excludeFromBudget) return data;
  const amt = Math.max(0, Math.round(amount) || 0);
  if (amt === 0) return clearTarget(data, { id });
  const day = dueDay == null ? undefined : dueDay;
  if (cur.targetAmount === amt && cur.targetMode === mode && (cur.targetDueDay ?? undefined) === day) return data;
  const cats = [...data.categories];
  cats[i] = stampUpdate({ ...cur, targetAmount: amt, targetMode: mode, targetDueDay: day });
  return {
    ...data, categories: cats,
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Set ' + (mode === 'setaside' ? 'set-aside' : 'refill') + ' target for ' + cur.name, before: { targetAmount: cur.targetAmount, targetMode: cur.targetMode }, after: { targetAmount: amt, targetMode: mode } }), ...(data.audit || [])],
  };
}

export function clearTarget(data, { id }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0 || data.categories[i].targetAmount === undefined) return data;
  const cur = data.categories[i];
  const cats = [...data.categories];
  cats[i] = stampUpdate({ ...cur, targetAmount: undefined, targetMode: undefined, targetDueDay: undefined });
  return {
    ...data, categories: cats,
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Removed target for ' + cur.name, before: { targetAmount: cur.targetAmount, targetMode: cur.targetMode }, after: { targetAmount: undefined } }), ...(data.audit || [])],
  };
}

// Toggle excludeFromBudget from the inspector; enabling clears budget + target.
export function setCategoryExcluded(data, { id, excluded }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0 || !!data.categories[i].excludeFromBudget === !!excluded) return data;
  const cur = data.categories[i];
  const next = { ...data, categories: [...data.categories], budgets: [...data.budgets] };
  next.categories[i] = stampUpdate({
    ...cur, excludeFromBudget: !!excluded,
    ...(excluded ? { targetAmount: undefined, targetMode: undefined, targetDueDay: undefined } : {}),
  });
  const before = { excludeFromBudget: !!cur.excludeFromBudget, targetAmount: cur.targetAmount, targetMode: cur.targetMode };
  const after = { excludeFromBudget: !!excluded, targetAmount: next.categories[i].targetAmount, targetMode: next.categories[i].targetMode };
  next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: (excluded ? 'Excluded ' : 'Included ') + cur.name + ' from budgets', before, after }), ...(data.audit || [])];
  if (excluded) dropBudgetAndTargetOnExclude(next, id, cur.name);
  return next;
}
```

- [ ] **Step 5: Run to verify it passes + audit-constraints + full suite + build**

Run: `npx vitest run tests/target-actions.test.js tests/audit-constraints.test.js` → PASS (the audit-constraints test proves `category`/`update` and `budget`/`delete` literals are valid). Then `npx vitest run` + `npx vite build`.

- [ ] **Step 6: Commit**

```bash
git add src/store/actions.js tests/target-actions.test.js
git commit -m "feat(targets): setTarget/clearTarget/setCategoryExcluded actions + shared exclude-clears-target"
```

---

### Task 4: Inspector Target card

**Files:**
- Modify: `src/ui/plan/Inspector.jsx` (new `TargetCard` module-scope component + slot it into the single-select branch after `AvailableCard`)

**Interfaces:**
- Consumes: `setTarget`, `clearTarget`, `setCategoryExcluded` (Task 3); `hasTarget`, `targetNeeded`, `targetSummary` (Task 2); `parseAmt` (`src/lib/format.js`).
- Produces: the Target card UI. No new exports.

- [ ] **Step 1: Add imports and the `TargetCard` component**

`src/ui/plan/Inspector.jsx` already imports actions (e.g. `setCategoryNote`, `moveAssigned`) and `useState`/`useRef`. ADD to the existing action import line: `setTarget, clearTarget, setCategoryExcluded`. Then add:
```js
import { hasTarget, targetNeeded, targetSummary } from '../../lib/targets.js';
import { parseAmt } from '../../lib/format.js';
```
(Do NOT re-import `moveAssigned`/`setCategoryNote` — merge into the existing line. The target "I need" field is a plain amount entry — `parseAmt`, no calculator expression in v1.)

Add module-scope, above `export default function Inspector`:
```js
const DISABLED_CADENCES = ['Weekly', 'Yearly', 'Custom'];

function ExcludeToggle({ cat, applyData }) {
  const on = !!cat.excludeFromBudget;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <button onClick={() => applyData(d => setCategoryExcluded(d, { id: cat.id, excluded: !on }))}
        role="switch" aria-checked={String(on)} aria-label="Exclude from budgets"
        style={{ width: 44, height: 26, flex: 'none', padding: 2, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--track)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start' }}>
        <span aria-hidden="true" style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: on ? 'var(--on-accent)' : 'var(--surface)' }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Exclude from budgets</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>Use for advances or money you expect to receive back. Excluded categories carry no target.</div>
      </div>
    </div>
  );
}

function TargetCard({ cat, row, money, applyData }) {
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('setaside');
  const [dueDay, setDueDay] = useState(''); // '' = Last Day of Month
  const excluded = !!cat.excludeFromBudget;
  const has = hasTarget(cat);

  const open = () => {
    setAmt(has ? String(cat.targetAmount) : '');
    setMode(cat.targetMode || 'setaside');
    setDueDay(cat.targetDueDay == null ? '' : String(cat.targetDueDay));
    setEditing(true);
  };
  const commit = () => {
    const amount = Math.max(0, Math.round(parseAmt(String(amt)) || 0));
    applyData(d => setTarget(d, { id: cat.id, amount, mode, dueDay: dueDay === '' ? null : parseInt(dueDay, 10) }));
    setEditing(false);
  };
  const remove = () => { applyData(d => clearTarget(d, { id: cat.id })); setEditing(false); };

  return (
    <Card title="Target">
      {excluded ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Excluded from budgets — no target.</div>
      ) : editing ? (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <button aria-pressed="true" style={{ flex: 1, padding: '5px 0', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--soft)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'default' }}>Monthly</button>
            {DISABLED_CADENCES.map(c => (
              <button key={c} disabled title="Coming later" style={{ flex: 1, padding: '5px 0', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--elev)', color: 'var(--muted)', fontSize: 12, cursor: 'not-allowed' }}>{c}</button>
            ))}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>I need</label>
          <input autoFocus value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal"
            style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }} />
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Next month I want to</label>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ width: '100%', height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 4 }}>
            <option value="setaside">Set aside another</option>
            <option value="refill">Refill up to</option>
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            {mode === 'setaside' ? 'Use for: bills, subscriptions, saving over time' : "Use for: gasoline, fun money, dining out. Whatever you don't spend applies toward next month."}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>By</label>
          <select value={dueDay} onChange={e => setDueDay(e.target.value)}
            style={{ width: '100%', height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 12 }}>
            <option value="">Last Day of Month</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Day {d}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {has && <button onClick={remove} style={{ marginRight: 'auto', border: 'none', background: 'transparent', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
            <button onClick={() => setEditing(false)} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={commit} disabled={!(parseAmt(String(amt)) > 0)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: parseAmt(String(amt)) > 0 ? 1 : .5 }}>Save Target</button>
          </div>
        </div>
      ) : has ? (
        <button onClick={open} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{targetSummary(cat, money)}</div>
          <div style={{ fontSize: 12, marginTop: 3, color: targetNeeded(row, cat) > 0 ? 'var(--neg)' : 'var(--pos)' }}>
            {targetNeeded(row, cat) > 0 ? 'Needs ' + money(targetNeeded(row, cat)) + ' more' : 'Funded'}
          </div>
        </button>
      ) : (
        <button onClick={open} style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '7px 12px', cursor: 'pointer' }}>Create Target</button>
      )}
      <ExcludeToggle cat={cat} applyData={applyData} />
    </Card>
  );
}
```
Note: `useState`/`useRef` are already imported in Inspector.jsx (used by NotesCard). Confirm `useState` is in the React import; add it if missing.

- [ ] **Step 2: Slot `TargetCard` into the single-select branch**

In the `selected.size === 1` return (currently after `<AvailableCard row={row} money={money} />` at `Inspector.jsx:159`), insert:
```jsx
        <TargetCard cat={cat} row={row} money={money} applyData={applyData} />
```
so the order is: name → AvailableCard → **TargetCard** → Auto-Assign → Notes.

- [ ] **Step 3: Verify (build + live)**

Run: `npx vitest run` (unchanged count — this task adds no pure logic) + `npx vite build` (clean). On the dev server (port 5210): select a category with no target → "Create Target" shows; create a refill target of 25,000 → the summary "Refill up to Rs 25,000 monthly" + "Needs Rs N more" appears; the disabled Weekly/Yearly/Custom tabs show "Coming later"; toggling Exclude from budgets clears the target and shows the "no target" note; Escape/Cancel discards edits.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/Inspector.jsx
git commit -m "feat(targets): inline Target card in the inspector with exclude toggle"
```

---

### Task 5: Target-aware progress bars + Cost to Be Me

**Files:**
- Modify: `src/screens/Plan.jsx` (`CategoryRow` progress block ~lines 728-753)
- Modify: `src/ui/plan/Inspector.jsx` (no-selection `SummaryLines` area ~line 143)

**Interfaces:**
- Consumes: `hasTarget`, `targetNeeded`, `costToBeMe` (Task 2).

- [ ] **Step 1: Make the row progress bar target-aware in `src/screens/Plan.jsx`**

Add the import (with the other lib imports at the top):
```js
import { hasTarget, targetNeeded, costToBeMe } from '../lib/targets.js';
```
Replace the progress computation (currently `Plan.jsx:728-732`):
```js
  const spend = Math.max(0, -r.activity);
  const overspent = r.available < 0;
  let target, funded, pct, subLabel;
  if (hasTarget(cat)) {
    target = cat.targetAmount;
    funded = cat.targetMode === 'setaside' ? r.assigned : r.available;
    pct = target > 0 ? Math.min(1, Math.max(0, funded / target)) : 0;
    const need = targetNeeded(r, cat);
    subLabel = need > 0 ? 'Needs ' + money(need) + ' more' : 'Funded';
  } else {
    target = r.carryIn + r.assigned;
    pct = target > 0 ? Math.min(1, spend / target) : (spend > 0 ? 1 : 0);
    subLabel = 'Spent ' + money(spend) + ' of ' + money(target);
  }
  const barColor = overspent ? 'var(--neg)' : 'var(--pos)';
```
Replace the sub-label line (currently `Plan.jsx:753`):
```jsx
            <div className="tnum" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{subLabel}</div>
```

- [ ] **Step 2: Add the "Cost to Be Me" line in `src/ui/plan/Inspector.jsx`**

Import `costToBeMe`/`hasTarget` (merge with the Task 4 targets import). In the `selected.size === 0` branch, under the Summary `Card`, add a muted line beneath `SummaryLines`:
```jsx
        <Card title={monthName + "'s Summary"}>
          <SummaryLines sum={selectionSummary(env, allIds)} money={money} monthName={monthName} />
          {costToBeMe(activeCats) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
              <span>Cost to Be Me</span><span className="tnum">{money(costToBeMe(activeCats))}</span>
            </div>
          )}
        </Card>
```

- [ ] **Step 3: Verify (build + live)**

Run: `npx vitest run` + `npx vite build`. Live: a targeted category's row shows "Needs Rs N more"/"Funded" and the bar fills toward the target; an untargeted category still shows "Spent X of Y"; with at least one target set, the no-selection inspector shows a "Cost to Be Me" line equal to the sum of targets.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Plan.jsx src/ui/plan/Inspector.jsx
git commit -m "feat(targets): target-aware progress bars + Cost to Be Me line"
```

---

### Task 6: Underfunded/Overfunded filter pills + target-aware Auto-Assign

**Files:**
- Modify: `src/lib/planViews.js` (`BUILTIN_VIEWS`)
- Modify: `src/lib/inspector.js` (`underfundedFor`, and the `underfunded` kind in `autoAssignPlan`)
- Test: extend `tests/plan-views.test.js`; extend `tests/inspector.test.js`

**Interfaces:**
- Consumes: `hasTarget`, `targetNeeded` (Task 2). The `match` predicate signature is `(cat, env)`; `env.rows.get(cat.id)` gives the row.
- Produces: `BUILTIN_VIEWS` now has 5 entries `['all','overspent','underfunded','overfunded','available']`.

- [ ] **Step 1: Write the failing planViews test**

Add to `tests/plan-views.test.js`:
```js
import { hasTarget } from '../src/lib/targets.js'; // ensure targets module resolves in this file's imports
// ... within a new describe:
describe('underfunded / overfunded built-in views', () => {
  const envT = { rows: new Map([
    ['u', { assigned: 2000, activity: 0, available: 2000, carryIn: 0 }], // refill target 5000 → needs 3000
    ['o', { assigned: 9000, activity: 0, available: 9000, carryIn: 0 }], // refill target 5000 → over
    ['x', { assigned: 0, activity: 0, available: 0, carryIn: 0 }],       // excluded, has target → neither
  ]) };
  const catU = { id: 'u', name: 'U', type: 'expense', status: 'active', targetAmount: 5000, targetMode: 'refill', excludeFromBudget: false };
  const catO = { id: 'o', name: 'O', type: 'expense', status: 'active', targetAmount: 5000, targetMode: 'refill', excludeFromBudget: false };
  const catX = { id: 'x', name: 'X', type: 'expense', status: 'active', targetAmount: 5000, targetMode: 'refill', excludeFromBudget: true };
  const view = id => BUILTIN_VIEWS.find(v => v.id === id);
  it('ships 5 built-ins in order', () => {
    expect(BUILTIN_VIEWS.map(v => v.id)).toEqual(['all', 'overspent', 'underfunded', 'overfunded', 'available']);
  });
  it('underfunded matches a targeted shortfall, not excluded', () => {
    expect(view('underfunded').match(catU, envT)).toBe(true);
    expect(view('underfunded').match(catO, envT)).toBe(false);
    expect(view('underfunded').match(catX, envT)).toBe(false);
  });
  it('overfunded matches over-target, not excluded', () => {
    expect(view('overfunded').match(catO, envT)).toBe(true);
    expect(view('overfunded').match(catU, envT)).toBe(false);
    expect(view('overfunded').match(catX, envT)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/plan-views.test.js` → FAIL (only 3 built-ins; no underfunded/overfunded).

- [ ] **Step 3: Add the two views in `src/lib/planViews.js`**

Import at the top:
```js
import { hasTarget, targetNeeded, isOverTarget } from './targets.js';
```
Extend `BUILTIN_VIEWS` (insert between `overspent` and `available`):
```js
  Object.freeze({ id: 'underfunded', label: 'Underfunded', match: (cat, env) => hasTarget(cat) && targetNeeded(env.rows.get(cat.id) || {}, cat) > 0 }),
  Object.freeze({ id: 'overfunded', label: 'Overfunded', match: (cat, env) => hasTarget(cat) && isOverTarget(env.rows.get(cat.id) || {}, cat) }),
```
(`hasTarget` already returns false for excluded categories, so both predicates exclude them.)

- [ ] **Step 4: Make Auto-Assign "underfunded" target-aware in `src/lib/inspector.js`**

`underfundedFor(env, catIds)` currently sums cover-overspending. Change it to prefer target need, falling back to overspending for untargeted cats. It needs category objects, so thread them via the ctx the callers already pass (`ctx.S`). Update `underfundedFor` to accept the store and add a per-category rule:
```js
// Amount needed to fund each category up to its target (targeted cats) or to
// cover overspending (untargeted cats), summed. Excluded cats contribute 0.
export function underfundedFor(env, catIds, S) {
  const catById = new Map((S?.categories || []).map(c => [c.id, c]));
  return catIds.reduce((n, id) => {
    const r = env.rows.get(id) || { available: 0 };
    const cat = catById.get(id);
    if (cat && hasTarget(cat)) return n + targetNeeded(r, cat);
    return n + Math.max(0, -r.available); // untargeted: cover overspending
  }, 0);
}
```
Import `hasTarget`, `targetNeeded` at the top of `inspector.js`. First `grep -rn "underfundedFor" src` and update **every** caller to pass `S` (the signature gains a third param); the known ones are the two below. Update the two call sites:
- `autoAssignAmount`: `if (kind === 'underfunded') return underfundedFor(env, catIds, ctx.S);`
- `autoAssignPlan` underfunded branch (currently `if (kind === 'underfunded') { if (r.available < 0) push(catId, -r.available); continue; }`): replace with a per-category funded-to-need push:
```js
    if (kind === 'underfunded') {
      const cat = (ctx.S?.categories || []).find(c => c.id === catId);
      const need = cat && hasTarget(cat) ? targetNeeded(r, cat) : Math.max(0, -r.available);
      if (need > 0) push(catId, need); // push(catId, delta): from RTA into the category
      continue;
    }
```
(Confirm `push` moves `delta` from RTA into `catId`; match the existing helper's direction.)

- [ ] **Step 5: Update the inspector.test underfunded expectations**

The existing `tests/inspector.test.js` asserts `underfundedFor`/underfunded auto-assign as cover-overspending only. Extend (do not delete existing cover-overspending cases — they still hold for untargeted cats) with a fixture where a targeted category needs funding: build a store with `{ categories: [...], }`, an `env` with that category's row, and assert `underfundedFor(env, ['c'], S)` equals the target need, and `autoAssignPlan('underfunded', ['c'], { ...ctx, S })` pushes that amount from RTA. Pass `S` through the `ctx` object the tests already construct (add `S` to it). Derive the expected amount by hand.

- [ ] **Step 6: Run to verify everything passes + build**

Run: `npx vitest run tests/plan-views.test.js tests/inspector.test.js` → PASS. Then `npx vitest run` (full suite) + `npx vite build`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planViews.js src/lib/inspector.js tests/plan-views.test.js tests/inspector.test.js
git commit -m "feat(targets): Underfunded/Overfunded pills + target-aware Auto-Assign"
```

---

### Task 7: Live verification pass (main session, Playwright — not a subagent)

**Files:** none (verification only; fixes land as scoped commits).

- [ ] **Step 1: Apply migration 0013** to the Supabase project (owner action; the branch cannot ship without it). Confirm the app hydrates without sync errors.
- [ ] **Step 2: Run the spec's live checklist** on the dev server against real data:
  1. Create a **Refill** target (e.g. 25,000) on a category; assign toward it and watch "Needs Rs N more" drop to "Funded" and the row bar fill.
  2. Create a **Set-aside** target; confirm the need is `amount − assigned`, independent of carry-in.
  3. The **Underfunded** pill lists exactly the targeted cats with a shortfall; **Overfunded** the over-target ones; excluded cats appear in neither.
  4. Auto-Assign **"Underfunded"** funds each targeted category to its need in one Cmd+Z step.
  5. The no-selection inspector shows **Cost to Be Me** = Σ targets.
  6. The Target card's **Exclude from budgets** toggle clears an existing target and drops the category from Cost-to-Be-Me/Underfunded.
  7. A target **round-trips a reload** through Supabase sync.
- [ ] **Step 3: Undo/restore every data mutation** made during verification (unmask via `h`, act, assert, undo/clear, re-mask), and remove any targets created for testing.
- [ ] **Step 4: Commit any fixes as their own scoped commits.**

---

## Self-Review

- **Spec coverage:** migration+sync → T1; math → T2; actions incl. exclude-clears-target → T3; inline Target card + exclude toggle + disabled cadence tabs → T4; progress bars + Cost-to-Be-Me → T5; Underfunded/Overfunded pills + target-aware Auto-Assign → T6; live checklist → T7. Out-of-scope items (Weekly/Yearly/Custom cadences, due-day pacing math, retiring legacy budgets) have no tasks — intentional.
- **Placeholder scan:** none — every code step carries real code; the two UI tasks (T4/T5) name exact copy, styles, and the slot position.
- **Type consistency:** `targetNeeded(row, cat)`, `hasTarget(cat)`, `isOverTarget(row, cat)`, `costToBeMe(cats)`, `targetSummary(cat, money)` used identically in T2/T4/T5/T6. Category shape `{ targetAmount, targetMode, targetDueDay, excludeFromBudget }` consistent across T1 (sync), T3 (actions), T2/T4/T5/T6 (reads). `setTarget(data, {id, amount, mode, dueDay})` / `clearTarget(data, {id})` / `setCategoryExcluded(data, {id, excluded})` signatures match T3 definitions and T4 call sites. `BUILTIN_VIEWS` grows to 5 with the exact id order asserted in T6. `underfundedFor(env, catIds, S)` gains the `S` param consistently across its definition and both call sites.
