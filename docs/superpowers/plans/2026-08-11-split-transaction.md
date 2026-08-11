# Split Expense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user split one expense across multiple categories at entry time; it saves as N ordinary linked expense transactions.

**Architecture:** Split-on-save. The expense form gains a split mode (category picker → N category+amount lines that must sum to the total). Saving calls a new `addSplitTransaction` action that reuses `buildTx` per leg and links legs with a shared `splitId`. The money engine (`calc.js`, `envelope.js`) is untouched — legs are ordinary expenses; the existing excluded-category mechanism routes a Roommate-advance leg into `recoverable` automatically.

**Tech Stack:** React 18 + Vite (plain JS/JSX, inline styles, CSS variables), vitest for pure-function tests, Supabase (fixed-column tables, explicit toRow/fromRow sync mappers in `src/store/sync.js`).

**Spec:** `docs/superpowers/specs/2026-08-11-split-transaction-design.md`

## Global Constraints

- PKR integers only — amounts parse via `parseAmt` from `src/lib/format.js`; no rounding tolerance: split lines must sum to the total **exactly**.
- Split mode is **expense type, add mode only** (`type === 'expense' && !f.editId`). No splits for refund/income/transfer; no editing a saved split as a unit.
- Split mode hides the Repeat preset (no recurring splits).
- One `applyData` call per save → one undo step, one sync push.
- No jsdom/browser tests — UI behavior is verified pure (helpers) + manually via the dev server (project convention).
- New store field `splitId` is optional; nothing in money math may read it.
- Run tests from the worktree root with `pnpm exec vitest run <file>`.

---

### Task 1: Pure split helpers (`splitLines` math + validation)

**Files:**
- Create: `src/lib/splitTx.js`
- Test: `tests/split-tx.test.js`

**Interfaces:**
- Produces: `blankLine()` → `{ category: '', amount: '', newCat: '', newCatGroup: '' }`
- Produces: `splitRemainder(totalStr, lines)` → integer (total − sum of line amounts; parses both via `parseAmt`)
- Produces: `validateSplit(totalStr, lines)` → error string or `null`
- Consumes: `parseAmt` from `src/lib/format.js` (existing; `parseAmt('2,500') === 2500`, invalid → 0)

- [ ] **Step 1: Write the failing tests**

```js
// tests/split-tx.test.js
import { describe, it, expect } from 'vitest';
import { blankLine, splitRemainder, validateSplit } from '../src/lib/splitTx.js';

const line = (category, amount, over) => ({ category, amount, newCat: '', newCatGroup: '', ...(over || {}) });

describe('splitRemainder', () => {
  it('is total minus the sum of line amounts', () => {
    expect(splitRemainder('5000', [line('groc', '2500'), line('adv', '')])).toBe(2500);
    expect(splitRemainder('5000', [line('groc', '2500'), line('adv', '2500')])).toBe(0);
  });
  it('treats unparseable amounts as zero', () => {
    expect(splitRemainder('', [line('groc', 'abc')])).toBe(0);
  });
});

describe('validateSplit', () => {
  const ok = [line('groc', '2500'), line('adv', '2500')];
  it('passes a fully assigned split', () => {
    expect(validateSplit('5000', ok)).toBeNull();
  });
  it('requires at least two lines', () => {
    expect(validateSplit('5000', [line('groc', '5000')])).toMatch(/two/i);
  });
  it('requires a category on every line', () => {
    expect(validateSplit('5000', [line('', '2500'), line('adv', '2500')])).toMatch(/category/i);
  });
  it('accepts an inline new category (__new with a name)', () => {
    expect(validateSplit('5000', [line('__new', '2500', { newCat: 'Fuel' }), line('adv', '2500')])).toBeNull();
    expect(validateSplit('5000', [line('__new', '2500'), line('adv', '2500')])).toMatch(/category/i);
  });
  it('requires every amount to be positive', () => {
    expect(validateSplit('5000', [line('groc', '0'), line('adv', '5000')])).toMatch(/amount/i);
  });
  it('requires lines to sum exactly to the total', () => {
    expect(validateSplit('5000', [line('groc', '2000'), line('adv', '2500')])).toMatch(/Rs 500/);
    expect(validateSplit('5000', [line('groc', '3000'), line('adv', '2500')])).toMatch(/exceed/i);
  });
  it('rejects the same category on two lines', () => {
    expect(validateSplit('5000', [line('groc', '2500'), line('groc', '2500')])).toMatch(/same category/i);
  });
});

describe('blankLine', () => {
  it('is an empty line shape', () => {
    expect(blankLine()).toEqual({ category: '', amount: '', newCat: '', newCatGroup: '' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/split-tx.test.js`
Expected: FAIL — `Cannot find module '../src/lib/splitTx.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/lib/splitTx.js
// Pure math + validation for split-expense entry (see the 2026-08-11 split
// design doc). A split is entered as the TOTAL the user actually paid plus N
// category lines; lines must sum to the total exactly (PKR integers — no
// rounding tolerance). The form stores lines as strings; everything parses
// through parseAmt so entry quirks ("2,500") behave like the main amount field.
import { parseAmt } from './format.js';

export const blankLine = () => ({ category: '', amount: '', newCat: '', newCatGroup: '' });

export function splitRemainder(totalStr, lines) {
  return parseAmt(totalStr) - lines.reduce((s, l) => s + parseAmt(l.amount), 0);
}

// One error string at a time (the form shows a single FieldError under the
// lines), ordered so the user fixes structure before arithmetic.
export function validateSplit(totalStr, lines) {
  if (lines.length < 2) return 'A split needs at least two lines.';
  if (lines.some(l => !l.category || (l.category === '__new' && !l.newCat)))
    return 'Choose a category for every line.';
  const ids = lines.filter(l => l.category !== '__new').map(l => l.category);
  if (new Set(ids).size !== ids.length) return 'Two lines use the same category — merge them.';
  if (lines.some(l => !(parseAmt(l.amount) > 0)))
    return 'Enter an amount greater than zero on every line.';
  const rem = splitRemainder(totalStr, lines);
  if (rem > 0) return 'Rs ' + rem.toLocaleString() + ' of the total is not assigned to a line.';
  if (rem < 0) return 'The lines exceed the total by Rs ' + Math.abs(rem).toLocaleString() + '.';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/split-tx.test.js`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/splitTx.js tests/split-tx.test.js
git commit -m "Split tx: pure line math + validation helpers"
```

---

### Task 2: `addSplitTransaction` store action

**Files:**
- Modify: `src/store/actions.js` (add below `addTransaction`, which ends near line 85; reuse `buildTx` line 38, `resolveCategory` line 60, `makeAudit`, `uid`)
- Test: `tests/split-transaction.test.js`

**Interfaces:**
- Consumes: `buildTx(f, type, amt, fee, catId)` — existing; mints a fresh tx `id` per call.
- Consumes: `resolveCategory(next, f, type)` — existing module-private fn; reads `f.category`, `f.newCat`, `f.newCatGroup`, appends to `next.categories` when `category === '__new'` and returns the cat id. Call it per leg with a leg-shaped shim.
- Produces: `export function addSplitTransaction(data, { form, legs, amt })` → next store. `legs = [{ category, amount, newCat, newCatGroup }]` (amount is the string from the form); `amt` is the parsed total (audit only). Every created tx: `type: 'expense'`, shared `splitId`, same date/account-or-card/merchant/status from `form`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/split-transaction.test.js
import { describe, it, expect } from 'vitest';
import { addSplitTransaction } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'adv', name: 'Roommate advance', type: 'expense', status: 'active', groupId: 'g1', excludeFromBudget: true },
  ],
  accounts: [{ id: 'a1', nickname: 'Meezan', status: 'active' }],
  assignments: [], transactions: [], budgets: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

const form = over => ({
  type: 'expense', amount: '5000', payWith: 'acc:a1', merchant: 'Imtiaz',
  date: '2026-08-11', time: '12:00', pending: false, notes: '',
  ...(over || {}),
});

const legs = [
  { category: 'groc', amount: '2500', newCat: '', newCatGroup: '' },
  { category: 'adv', amount: '2500', newCat: '', newCatGroup: '' },
];

describe('addSplitTransaction', () => {
  it('creates one expense per leg sharing splitId, date, account, merchant', () => {
    const s = addSplitTransaction(store(), { form: form(), legs, amt: 5000 });
    expect(s.transactions).toHaveLength(2);
    const [t1, t2] = s.transactions;
    expect(t1.splitId).toBeTruthy();
    expect(t1.splitId).toBe(t2.splitId);
    expect(t1.id).not.toBe(t2.id);
    for (const t of [t1, t2]) {
      expect(t).toMatchObject({ type: 'expense', accountId: 'a1', merchant: 'Imtiaz', status: 'cleared', date: '2026-08-11T12:00' });
    }
    expect([t1.amount, t2.amount].sort()).toEqual([2500, 2500]);
    expect([t1.category, t2.category].sort()).toEqual(['adv', 'groc']);
  });
  it('writes exactly one audit entry summarizing the split', () => {
    const s = addSplitTransaction(store(), { form: form(), legs, amt: 5000 });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'transaction', action: 'create' });
    expect(s.audit[0].summary).toMatch(/split/i);
  });
  it('resolves an inline new category on a line', () => {
    const withNew = [
      { category: '__new', amount: '2000', newCat: 'Fuel', newCatGroup: 'g1' },
      { category: 'adv', amount: '3000', newCat: '', newCatGroup: '' },
    ];
    const s = addSplitTransaction(store(), { form: form(), legs: withNew, amt: 5000 });
    const fuel = s.categories.find(c => c.name === 'Fuel');
    expect(fuel).toBeTruthy();
    expect(s.transactions.some(t => t.category === fuel.id)).toBe(true);
  });
  it('pays with a card when the form says card', () => {
    const withCard = store({ cards: [{ id: 'c1', nickname: 'Visa', status: 'active' }] });
    const s = addSplitTransaction(withCard, { form: form({ payWith: 'card:c1' }), legs, amt: 5000 });
    expect(s.transactions.every(t => t.cardId === 'c1' && !t.accountId)).toBe(true);
  });
  it('does not mutate the input store', () => {
    const s0 = store();
    addSplitTransaction(s0, { form: form(), legs, amt: 5000 });
    expect(s0.transactions).toHaveLength(0);
    expect(s0.audit).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: FAIL — `addSplitTransaction` is not exported

- [ ] **Step 3: Write the implementation**

Add to `src/store/actions.js`, directly after `addTransaction`:

```js
// Split expense: N ordinary expense legs linked by one splitId, saved in a
// single call — one undo step, one sync push, one audit entry. Legs reuse
// buildTx so every cross-type rule stays in one place; the engine never reads
// splitId. No repeat/recurring integration by design (split mode hides Repeat).
export function addSplitTransaction(data, { form: f, legs, amt }) {
  const next = { ...data, transactions: [...data.transactions] };
  const splitId = uid();
  const made = legs.map(leg => {
    const catId = resolveCategory(next, { category: leg.category, newCat: leg.newCat, newCatGroup: leg.newCatGroup }, 'expense');
    const t = buildTx(f, 'expense', parseAmt(leg.amount), 0, catId);
    t.splitId = splitId;
    return t;
  });
  next.transactions = [...made, ...next.transactions];
  next.audit = [makeAudit({
    entityType: 'transaction', entityId: splitId, action: 'create',
    summary: 'Recorded split expense (' + legs.length + ' ways)',
    after: { type: 'expense', amount: amt, legs: legs.length, date: made[0].date },
  }), ...(next.audit || [])];
  return next;
}
```

Note: `parseAmt` is already imported in `actions.js` (used by existing actions) — verify and add the import from `../lib/format.js` only if missing. `resolveCategory` mutates `next.categories` by replacement, which is why `next` is built before the loop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite (no regressions)**

Run: `pnpm exec vitest run`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/store/actions.js tests/split-transaction.test.js
git commit -m "Split tx: addSplitTransaction action — linked legs, one undo step"
```

---

### Task 3: Persistence — migration + sync mapping

**Files:**
- Create: `supabase/migrations/0014_split_id.sql`
- Modify: `src/store/sync.js` — the `transactions` collection entry (begins near line 155; `toRow` ~159, `fromRow` ~168)
- Test: `tests/split-transaction.test.js` (append a sync-contract describe block)

**Interfaces:**
- Consumes: `COLLECTIONS` export from `src/store/sync.js` (existing; test pattern copied from `tests/sync-recurring.test.js`).
- Produces: `split_id text` column; `toRow` emits `split_id: r.splitId ?? null` (explicit null — that collection clears absent fields on edit); `fromRow` emits `splitId: r.split_id || undefined` inside its existing `stripNulls(...)`.

- [ ] **Step 1: Write the failing test** (append to `tests/split-transaction.test.js`)

```js
import { COLLECTIONS } from '../src/store/sync.js';

describe('transactions sync contract: splitId', () => {
  const entry = COLLECTIONS.find(c => c.name === 'transactions');
  const leg = { id: 't1', date: '2026-08-11T12:00', type: 'expense', amount: 2500, accountId: 'a1', category: 'groc', merchant: 'Imtiaz', notes: '', status: 'cleared', splitId: 'sp1' };
  it('round-trips splitId through toRow/fromRow', () => {
    const row = entry.toRow(leg);
    expect(row.split_id).toBe('sp1');
    expect(entry.fromRow(row).splitId).toBe('sp1');
  });
  it('emits explicit null when absent and strips it coming back', () => {
    const { splitId, ...plain } = leg;
    const row = entry.toRow(plain);
    expect(row.split_id).toBeNull();
    expect('splitId' in entry.fromRow(row)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: FAIL — `row.split_id` is `undefined`

- [ ] **Step 3: Implement**

Migration:

```sql
-- supabase/migrations/0014_split_id.sql
-- Legs of one split expense share a split_id (a group tag minted client-side).
-- Nullable, no FK: it references no table, and absent means "not a split".
alter table public.transactions add column split_id text;
```

`src/store/sync.js` — in the `transactions` entry, add to `toRow`'s object (beside `adjustment_reason`):

```js
      split_id: r.splitId ?? null,
```

and to `fromRow`'s `stripNulls({ ... })` (beside `adjustmentReason`):

```js
      splitId: r.split_id || undefined,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: PASS

- [ ] **Step 5: Apply the migration**

Run: `npx supabase db push` (per README; skip if the environment has no linked project and note it in the commit message — the app tolerates the missing column only if sync never pushes a split, so flag loudly if skipped).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0014_split_id.sql src/store/sync.js tests/split-transaction.test.js
git commit -m "Split tx: persist split_id (migration + sync mapping round-trip)"
```

---

### Task 4: Transactions list badge

**Files:**
- Modify: `src/lib/txRow.js` — `txRowOf` (line 10), beside the `excluded` flag (~line 85)
- Modify: `src/ui/TxChips.jsx` — beside the excluded chip (line 33)
- Test: `tests/split-transaction.test.js` (append)

**Interfaces:**
- Consumes: `txRowOf(t, S, fmt, forAccountId)` — existing row builder.
- Produces: row fields `split: !!t.splitId` and `splitLabel: 'Split purchase'`; TxChips renders a muted "Split" chip when `meta && t.split` (same gating as the excluded chip).

- [ ] **Step 1: Write the failing test** (append to `tests/split-transaction.test.js`)

```js
import { txRowOf } from '../src/lib/txRow.js';

describe('txRowOf split flag', () => {
  const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => String(n) };
  const S2 = {
    accounts: [{ id: 'a1', nickname: 'Meezan' }], cards: [], categories: [{ id: 'groc', name: 'Groceries' }],
    transactions: [], recurring: [],
  };
  const base = { id: 't1', date: '2026-08-11T12:00', type: 'expense', amount: 2500, accountId: 'a1', category: 'groc', merchant: '', notes: '', status: 'cleared' };
  it('flags legs that carry a splitId', () => {
    expect(txRowOf({ ...base, splitId: 'sp1' }, S2, fmt).split).toBe(true);
    expect(txRowOf(base, S2, fmt).split).toBe(false);
  });
});
```

(If `txRowOf` needs more store shape than `S2` provides, mirror the fixture from `tests/txRow.test.js` — copy its `S` object rather than inventing one.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: FAIL — `split` is `undefined`

- [ ] **Step 3: Implement**

`src/lib/txRow.js`, beside the `excluded` fields:

```js
    // Split-purchase indicator — this row is one leg of a multi-category entry.
    split: !!t.splitId,
    splitLabel: 'Split purchase',
```

`src/ui/TxChips.jsx`, add directly under the excluded chip line (match that file's local variable — the excluded chip reads `t.excluded`):

```jsx
      {meta && t.split && <span style={chip('var(--elev)', 'var(--muted)')}>Split</span>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/txRow.js src/ui/TxChips.jsx tests/split-transaction.test.js
git commit -m "Split tx: 'Split' chip on legs in the transactions list"
```

---

### Task 5: `validate.transaction` learns to skip the single category

**Files:**
- Modify: `src/lib/validate.js` — `transaction(store, f, opts)` (line 17); the category-required branch starts at the `if (type === 'expense' || type === 'income' || type === 'refund')` block (~line 47)
- Test: `tests/split-transaction.test.js` (append)

**Interfaces:**
- Produces: `validate.transaction(store, f, { skipCategory: true })` skips ONLY the category checks; every other check (amount, date, payWith ownership) still runs. Split mode validates categories per-line via `validateSplit` instead.

- [ ] **Step 1: Write the failing test** (append)

```js
import { validate } from '../src/lib/validate.js';

describe('validate.transaction skipCategory', () => {
  const S3 = {
    accounts: [{ id: 'a1', nickname: 'Meezan', status: 'active' }], cards: [],
    categories: [], transactions: [],
  };
  const f = { type: 'expense', amount: '5000', payWith: 'acc:a1', date: '2026-08-11', category: '' };
  it('still requires category by default', () => {
    expect(validate.transaction(S3, f, {}).category).toBeTruthy();
  });
  it('skips only the category check with skipCategory', () => {
    const errs = validate.transaction(S3, f, { skipCategory: true });
    expect(errs.category).toBeUndefined();
    expect(Object.keys(errs)).toHaveLength(0);
    // other checks still run:
    expect(validate.transaction(S3, { ...f, amount: '0' }, { skipCategory: true }).amount).toBeTruthy();
  });
});
```

(If the store shape above trips an unrelated check, borrow the minimal store from an existing `validate` test — search `tests/` for `validate.transaction` usages first.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/split-transaction.test.js`
Expected: FAIL — `errs.category` is set despite `skipCategory`

- [ ] **Step 3: Implement**

In `src/lib/validate.js`, wrap the category-required block:

```js
    if (!o.skipCategory && (type === 'expense' || type === 'income' || type === 'refund')) {
      // ...existing category checks unchanged...
    }
```

(Only the guard changes — keep the block's body byte-identical.)

- [ ] **Step 4: Run tests + whole suite**

Run: `pnpm exec vitest run`
Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.js tests/split-transaction.test.js
git commit -m "Split tx: validate.transaction opts.skipCategory for split mode"
```

---

### Task 6: TxForm split mode (UI + submit wiring)

**Files:**
- Modify: `src/drawers/TxForm.jsx` — `Body` (category block, lines 118–135; `showRepeat` line 67), `useSubmit` (lines 291–343)

**Interfaces:**
- Consumes: `blankLine`, `splitRemainder`, `validateSplit` from `src/lib/splitTx.js` (Task 1); `addSplitTransaction` from `../store/actions.js` (Task 2); `validate.transaction(..., { skipCategory })` (Task 5).
- Form state produced: `f.splitOn` (bool), `f.splits` (array of line objects). Neither ever reaches `buildTx`.

- [ ] **Step 1: Add split-mode state + UI to `Body`**

In `Body` (`src/drawers/TxForm.jsx`):

1. Compute the gate beside the other `fx*` flags (~line 58):

```js
  const canSplit = type === 'expense' && !f.editId;
  const splitOn = canSplit && !!f.splitOn;
```

2. Hide Repeat while splitting — change line 67 to append `&& !splitOn`:

```js
  const showRepeat = (type === 'expense' || type === 'income') && !f.fromRecurring && !ruleFromTx(S, f.editId) && !splitOn;
```

3. Replace the category block (`{fxCategory && (...)}`, lines 118–135) with a split-aware version. Keep the original single-picker JSX byte-identical inside the `!splitOn` branch; add the Split link in the Label row and a `splitOn` branch:

```jsx
      {fxCategory && !splitOn && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label required>Category</Label>
            {canSplit && (
              <button type="button" className="hv-soft"
                onClick={() => setForm({ splitOn: true, splits: [{ ...blankLine(), category: f.category === '__new' ? '' : (f.category || '') }, blankLine()] })}
                style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >Split across categories</button>
            )}
          </div>
          {/* ...existing PlanCategoryPicker + __new hint + FieldError, unchanged... */}
        </div>
      )}
      {fxCategory && splitOn && (
        <SplitLines f={f} setForm={setForm} env={env} S={S} month={month} money={money} errors={errors} />
      )}
```

4. Add the `SplitLines` component at module scope (NOT inside `Body` — `tests/no-inline-components.test.js` enforces this):

```jsx
// Split-entry lines: category + amount per line, anchored to the main Amount
// field. The remainder chip fills the last empty line on tap — the 50/50 case
// is one tap. Lines must sum to the total exactly before save (validateSplit).
function SplitLines({ f, setForm, env, S, month, money, errors }) {
  const lines = f.splits || [];
  const setLines = splits => setForm({ splits });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = i => {
    const rest = lines.filter((_, j) => j !== i);
    // Down to one line = no longer a split: collapse back to the single picker.
    if (rest.length < 2) setForm({ splitOn: false, splits: undefined, category: rest[0]?.category || '' });
    else setLines(rest);
  };
  const rem = splitRemainder(f.amount, lines);
  const fillRemainder = () => {
    if (rem <= 0) return;
    const idx = lines.map(l => parseAmt(l.amount)).lastIndexOf(0);
    if (idx >= 0) setLine(idx, { amount: String(rem) }); // the found line parses to 0, so it takes the whole remainder
  };
  const amountBox = { width: 110, boxSizing: 'border-box', height: 34, padding: '0 10px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, flex: 'none' };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label required>Split across categories</Label>
        <button type="button" className="hv-soft"
          onClick={() => setForm({ splitOn: false, splits: undefined, category: lines[0]?.category || '' })}
          style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >Un-split</button>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PlanCategoryPicker
              env={env} S={S} month={month} money={money}
              catType="expense" showAmounts excludeRta heading={null} allowCreate showSelected
              onCreate={({ name, groupId }) => setLine(i, { category: '__new', newCat: name, newCatGroup: groupId || '' })}
              value={l.category} onChange={id => setLine(i, { category: id, newCat: '', newCatGroup: '' })}
            />
            {l.category === '__new' && l.newCat && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>New category “{l.newCat}” will be created when you save.</div>
            )}
          </div>
          <input className="tnum" value={l.amount} inputMode="numeric" aria-label={'Line ' + (i + 1) + ' amount'}
            onFocus={e => e.target.select()} onChange={e => setLine(i, { amount: e.target.value })} style={amountBox} />
          <button type="button" onClick={() => removeLine(i)} aria-label={'Remove line ' + (i + 1)} className="hv-soft"
            style={{ width: 28, height: 34, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 15, flex: 'none' }}
          >×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" className="hv-soft" onClick={() => setLines([...lines, blankLine()])}
          style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >+ Add line</button>
        {rem !== 0 && (
          <button type="button" className="tnum hv-soft" onClick={fillRemainder} disabled={rem < 0}
            title={rem > 0 ? 'Assign the remainder to the last empty line' : 'Lines exceed the total'}
            style={{ border: 'none', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: rem > 0 ? 'pointer' : 'not-allowed', background: rem > 0 ? 'var(--elev)' : 'var(--neg-soft)', color: rem > 0 ? 'var(--muted)' : 'var(--neg)' }}
          >{rem > 0 ? 'Rs ' + rem.toLocaleString() + ' left' : 'Over by Rs ' + Math.abs(rem).toLocaleString()}</button>
        )}
      </div>
      <FieldError msg={errors.split} />
    </div>
  );
}
```

Imports to add at the top of `TxForm.jsx`: `blankLine, splitRemainder, validateSplit` from `../lib/splitTx.js`; add `addSplitTransaction` to the existing `../store/actions.js` import.

5. Type change must clear split state — the type pills' `onClick` (line 94) currently does `setForm({ type: id, category: '' })`; change to:

```jsx
          <Pill key={id} on={type === id} onClick={() => setForm({ type: id, category: '', splitOn: false, splits: undefined })}>
```

- [ ] **Step 2: Wire `useSubmit`**

In `useSubmit` (line 297), after computing `f`/`type`/`amt`, branch before the existing validate call:

```js
    const splitting = type === 'expense' && !f.editId && f.splitOn && (f.splits || []).length >= 2;
    const errs = validate.transaction(S, f, {
      allowArchivedCategory: !!f.editId && f.originalCategory === f.category,
      skipCategory: splitting,
    });
    if (splitting) {
      const splitErr = validateSplit(f.amount, f.splits);
      if (splitErr) errs.split = splitErr;
    }
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
```

The duplicate check (lines 305–311) stays as-is — it keys on the total `amt`, which is exactly the spec's behavior.

Then in the save section, replace the single `applyData` line (328) with:

```js
    if (splitting) {
      applyData(data => addSplitTransaction(data, { form: f, legs: f.splits, amt }));
      closeDrawer();
      notify('Split expense recorded — ' + f.splits.length + ' categories updated.');
      return;
    }
    applyData(data => (f.editId ? updateTransaction(data, payload) : addTransaction(data, payload)));
```

- [ ] **Step 3: Static checks + full suite**

Run: `pnpm exec vitest run` (includes `no-inline-components.test.js`, which would fail if `SplitLines` were nested)
Run: `pnpm run build`
Expected: all green, build passes

- [ ] **Step 4: Commit**

```bash
git add src/drawers/TxForm.jsx
git commit -m "Split tx: split mode in the expense form — lines, remainder chip, save wiring"
```

---

### Task 7: Manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run the app** — `pnpm run dev` (background). Note: the Budget/Transactions screens are auth-gated; live click-through must be delegated to the Playwright-testing subagent per project convention (memory: always delegate live browser testing to a subagent; have it fix what it finds).

- [ ] **Step 2: Manual checklist (via subagent)**

1. Add transaction → Expense → "Split across categories" appears; other types and edit mode never show it.
2. Split: total 5000, line 1 Groceries 2500, tap "Rs 2,500 left" chip → fills line 2; pick Roommate advance; CTA enables; save.
3. Transactions list shows two rows, each with the "Split" chip; amounts/categories correct.
4. Undo (toolbar) removes BOTH legs in one step.
5. Budget screen: Groceries activity −2,500; Roommate advance excluded from spending (Dashboard "spending" unchanged by the advance leg; recoverable +2,500).
6. Un-split collapses to the single picker, keeping line 1's category; switching type to Income clears split state.
7. Remainder over-assignment shows "Over by …" and save is blocked with the exact-sum error.

- [ ] **Step 3: Fix anything found, re-run suite, push**

```bash
pnpm exec vitest run && git push -u origin worktree-split-transaction
```

---

## Self-review (done at plan time)

- **Spec coverage:** data model → T2/T3; form UX → T6; save flow → T2+T6; list badge → T4; persistence → T3; edge cases (sum-exact, positive integers, un-split, dup-on-total) → T1/T5/T6; testing → T1–T5 test steps; monthMetrics routing is covered by the manual check §5 (engine untouched — no code change to test).
- **Placeholder scan:** clean — every code step carries real code; the two "borrow the fixture" notes point at named existing files, not TBDs.
- **Type consistency:** `blankLine/splitRemainder/validateSplit` (T1) match T6's imports; `addSplitTransaction(data, { form, legs, amt })` (T2) matches T6's call; `split`/`splitLabel` row fields (T4) match the chip's `t.split`; `skipCategory` (T5) matches T6's opts.
