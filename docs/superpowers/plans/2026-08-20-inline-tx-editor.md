# Inline Transaction Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop drawer with a YNAB-style inline editor row in the transactions register — add and edit transactions directly in the table, with account/date/payee/category dropdowns, outflow/inflow amount cells, splits, transfers, and repeat.

**Architecture:** The inline row is a **third shell** over the existing `DrawerProvider` form machinery (desktop drawer / phone TxSheet / inline row). It consumes the same `form` object and the same `useSubmit()` pipeline in `TxForm.jsx`, so validation, duplicate-guard, undo, audit, and row-flash are inherited unchanged. All new behavior lives in pure modules (`txEditorState.js`, `payeeOptions.js`, `calendar.js`) because the test suite has no jsdom. The register display also switches from one signed AMOUNT column to OUTFLOW/INFLOW columns.

**Tech Stack:** React 18 + Vite, `@base-ui/react` 1.7.0 (popover/select/combobox), Vitest (pure logic only, no jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-08-20-inline-tx-editor-design.md`

## Global Constraints

- Run tests with `pnpm test` (vitest run). There is NO jsdom — never write a test that renders a component. New behavior goes in pure modules under `src/lib/`.
- `tests/no-inline-components.test.js` fails the suite if any component is defined inside another component. Every new component must be module-scope (its own function at file top level). Its allowlist is empty — keep it that way.
- All new interactive primitives must be built on `@base-ui/react` and live in `src/ui/primitives/` (repo convention, see `src/ui/primitives/Popover.jsx` for the wrapper style).
- Styling is inline styles with theme tokens (`var(--surface)`, `var(--border)`, `var(--accent)`, `var(--soft)`, `var(--elev)`, `var(--muted)`, `var(--text)`, `var(--neg)`, `var(--pos)`). No CSS modules. Match the terse comment style of neighboring code.
- Amounts are stored as **unsigned magnitudes**; direction lives in `type` (`expense|income|transfer|refund|adjustment`). Never store a signed amount (except adjustments).
- `category` must be `undefined` when empty, never `''` (Supabase FK).
- Commit after every task. Do NOT open a PR (user rule: no PR until told). Work on the current branch `worktree-inline-tx-editor-spec`.
- One deviation from the spec, agreed during planning: **editing an existing split re-opens sub-rows is NOT implemented** — split legs are stored as independent transactions sharing a `splitId`, so editing a leg edits that one leg (same as today). Inline split *creation* is fully implemented (Task 12).

---

### Task 1: Extract the calendar grid into a pure module

The drawer's `WhenField.jsx` owns `calendarCells()` and `shiftMonth()` (lines 254–275). The inline date cell needs them too, and pure logic must be testable.

**Files:**
- Create: `src/lib/calendar.js`
- Modify: `src/drawers/WhenField.jsx` (delete the two local functions, import instead)
- Test: `tests/calendar.test.js`

**Interfaces:**
- Produces: `calendarCells(ym: 'YYYY-MM', selected: 'YYYY-MM-DD'|null, today: 'YYYY-MM-DD') → [{iso, n, out, sel, today}]` and `shiftMonth(ym: 'YYYY-MM', n: number) → 'YYYY-MM'`. NOTE: unlike the current WhenField-local version, `today` is **injected** (the repo convention for purity — see `stampFor`); WhenField passes `todayStr()`.

- [ ] **Step 1: Write the failing test**

```js
// tests/calendar.test.js
import { describe, it, expect } from 'vitest';
import { calendarCells, shiftMonth } from '../src/lib/calendar.js';

describe('shiftMonth', () => {
  it('steps forward across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('steps backward across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('calendarCells', () => {
  it('starts on the Sunday on or before the 1st', () => {
    // Aug 2026 starts on a Saturday → grid starts Sun 26 Jul.
    const cells = calendarCells('2026-08', null, '2026-08-20');
    expect(cells[0].iso).toBe('2026-07-26');
    expect(cells[0].out).toBe(true);
  });
  it('drops a trailing all-out-of-month week (five-row month)', () => {
    const cells = calendarCells('2026-08', null, '2026-08-20');
    expect(cells.length).toBe(42); // Aug 2026 spans 6 weeks (Sat start, 31 days)
    const jun = calendarCells('2026-06', null, '2026-08-20');
    expect(jun.length).toBe(35); // June 2026 fits 5 rows
  });
  it('marks selected and today', () => {
    const cells = calendarCells('2026-08', '2026-08-17', '2026-08-20');
    expect(cells.find(c => c.iso === '2026-08-17').sel).toBe(true);
    expect(cells.find(c => c.iso === '2026-08-20').today).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/calendar.test.js`
Expected: FAIL — module `src/lib/calendar.js` does not exist.

- [ ] **Step 3: Create the module (move the code, inject `today`)**

```js
// src/lib/calendar.js
// Month-grid math for date pickers, extracted from WhenField so the inline
// transaction editor's date cell shares one implementation. Pure: `today` is
// injected (like stampFor) so tests never read the wall clock.
const p2 = n => String(n).padStart(2, '0');

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return Math.floor(i / 12) + '-' + p2((i % 12) + 1);
}

// Whole weeks from the Sunday on or before the 1st. The trailing week is
// dropped when it holds nothing but next month, which is what keeps most
// months to five rows.
export function calendarCells(ym, selected, today) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    out.push({ iso, n: d.getDate(), out: iso.slice(0, 7) !== ym, sel: iso === selected, today: iso === today });
  }
  return out.slice(35).every(c => c.out) ? out.slice(0, 35) : out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/calendar.test.js` — Expected: PASS.

- [ ] **Step 5: Point WhenField at the module**

In `src/drawers/WhenField.jsx`: delete local `shiftMonth` (lines 254–258) and `calendarCells` (lines 263–275, including its comment). Add to imports: `import { calendarCells, shiftMonth } from '../lib/calendar.js';`. Change the one call site (line 87) from `calendarCells(month, f.date)` to `calendarCells(month, f.date, today)` (`today` is already in scope from `todayStr()`). Keep the local `p2` — the time picker still uses it.

- [ ] **Step 6: Full suite + commit**

Run: `pnpm test` — Expected: all pass.

```bash
git add src/lib/calendar.js src/drawers/WhenField.jsx tests/calendar.test.js
git commit -m "Extract calendar grid math into src/lib/calendar.js"
```

---

### Task 2: Outflow/inflow fields on the presenter rows

The register switches from one signed AMOUNT column to OUTFLOW/INFLOW. The presenter (`txRowOf`) is where display values are decided (repo rule: the sort key IS the rendered value), so the split happens there.

**Files:**
- Modify: `src/lib/txRow.js` (txRowOf, ruleRowOf)
- Test: `tests/txRow.test.js` (extend — read it first to match its fixture style)

**Interfaces:**
- Produces: every presenter row gains `outflowValue: number|null`, `inflowValue: number|null`, `outflowLabel: string`, `inflowLabel: string`. Exactly one side is populated per row (both null only if amtValue is 0 on the account-perspective view). `amtValue`/`amtLabel` are kept — the phone list, selected-total, and exports still read them.

- [ ] **Step 1: Read `tests/txRow.test.js` to learn the fixture helpers, then add failing tests**

Add cases (adapt store/fmt fixtures to the file's existing helpers):

```js
describe('outflow/inflow split', () => {
  it('expense → outflow side only', () => {
    const r = txRowOf(tx({ type: 'expense', amount: 500 }), S, fmt);
    expect(r.outflowValue).toBe(500);
    expect(r.inflowValue).toBe(null);
    expect(r.outflowLabel).toBe(fmt.money(500));
    expect(r.inflowLabel).toBe('');
  });
  it('income and refund → inflow side', () => {
    expect(txRowOf(tx({ type: 'income', amount: 700 }), S, fmt).inflowValue).toBe(700);
    expect(txRowOf(tx({ type: 'refund', amount: 80 }), S, fmt).inflowValue).toBe(80);
  });
  it('transfer (all-accounts view) → outflow side, money left the source', () => {
    const r = txRowOf(tx({ type: 'transfer', amount: 900, toAccountId: 'a2' }), S, fmt);
    expect(r.outflowValue).toBe(900);
    expect(r.inflowValue).toBe(null);
  });
  it('adjustment splits by its stored sign', () => {
    expect(txRowOf(tx({ type: 'adjustment', amount: -45 }), S, fmt).outflowValue).toBe(45);
    expect(txRowOf(tx({ type: 'adjustment', amount: 45 }), S, fmt).inflowValue).toBe(45);
  });
  it('account-perspective view splits by the delta sign', () => {
    const r = txRowOf(tx({ type: 'transfer', amount: 900, toAccountId: 'a2' }), S, fmt, 'a2');
    expect(r.inflowValue).toBe(900); // receiving account sees an inflow
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (`pnpm test tests/txRow.test.js`)

- [ ] **Step 3: Implement in `txRowOf`**

In `src/lib/txRow.js`, right after the `amtLabel/amtColor/amtValue` branch block (after line 40), add:

```js
  // Outflow/Inflow pair (YNAB columns). Derived from the SAME branch results
  // as amtValue so the two presentations can never disagree: money leaving is
  // outflow, money arriving is inflow, and a transfer in the all-accounts view
  // sits on the outflow side (it left the source account; acctLabel already
  // names the destination). Unpopulated side is null so sorting sinks blanks.
  let outflowValue = null, inflowValue = null;
  if (forAccountId) {
    if (amtValue < 0) outflowValue = -amtValue; else if (amtValue > 0) inflowValue = amtValue;
  } else if (t.type === 'transfer') outflowValue = t.amount;
  else if (amtValue < 0) outflowValue = -amtValue;
  else inflowValue = amtValue;
```

And add to the returned object (next to `acctLabel, amtLabel, amtColor, amtValue`):

```js
    outflowValue, inflowValue,
    outflowLabel: outflowValue != null ? fmt.money(outflowValue) : '',
    inflowLabel: inflowValue != null ? fmt.money(inflowValue) : '',
```

In `ruleRowOf`, add to its returned object (rules are forecasts — income rules inflow, expense rules outflow):

```js
    outflowValue: r.type === 'income' ? null : r.amount,
    inflowValue: r.type === 'income' ? r.amount : null,
    outflowLabel: r.type === 'income' ? '' : (r.estimated ? '~' : '') + fmt.money(r.amount),
    inflowLabel: r.type === 'income' ? (r.estimated ? '~' : '') + fmt.money(r.amount) : '',
```

Note `futureTxRowOf` spreads `txRowOf(...)` so it inherits the fields for free. Watch one edge: `amtValue === 0` with income/adjustment lands `inflowValue = 0` via the final `else` — that is fine (a zero inflow is a value, not a blank).

- [ ] **Step 4: Run to verify PASS**, then full `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/txRow.js tests/txRow.test.js
git commit -m "txRow: outflow/inflow presenter fields alongside signed amtValue"
```

---

### Task 3: Sortable outflow/inflow columns

**Files:**
- Modify: `src/lib/sortRows.js`
- Test: `tests/sort-rows.test.js` (extend, matching its fixture style)

**Interfaces:**
- Produces: `SORT_COLUMNS.outflow` and `SORT_COLUMNS.inflow` (type `number`, defaultDir `desc`, blanks sink both directions — the existing `compareValues` already does that for null); `sortLabel` entries for both.
- Consumes: `outflowValue`/`inflowValue` from Task 2.

- [ ] **Step 1: Failing tests**

```js
it('outflow sorts by outflow magnitude, blanks (inflow rows) at the bottom both ways', () => {
  const rows = [
    { outflowValue: 100, sortAt: '2026-08-01T12:00', sortId: 'a', merchant: 'x' },
    { outflowValue: null, inflowValue: 900, sortAt: '2026-08-02T12:00', sortId: 'b', merchant: 'y' },
    { outflowValue: 300, sortAt: '2026-08-03T12:00', sortId: 'c', merchant: 'z' },
  ];
  expect(sortRows(rows, { key: 'outflow', dir: 'desc' }).map(r => r.sortId)).toEqual(['c', 'a', 'b']);
  expect(sortRows(rows, { key: 'outflow', dir: 'asc' }).map(r => r.sortId)).toEqual(['a', 'c', 'b']);
});
it('sortLabel names the new columns', () => {
  expect(sortLabel({ key: 'outflow', dir: 'desc' })).toBe('Biggest outflow first');
  expect(sortLabel({ key: 'inflow', dir: 'desc' })).toBe('Biggest inflow first');
});
```

- [ ] **Step 2: Run to verify FAIL**

- [ ] **Step 3: Implement**

In `SORT_COLUMNS` (after the `signed` entry):

```js
  // The OUTFLOW / INFLOW headers. Each ranks only the rows populated on its
  // side; the other side's rows are blanks and sink in both directions.
  outflow: { defaultDir: 'desc', type: 'number', get: r => (Number.isFinite(r.outflowValue) ? r.outflowValue : null) },
  inflow: { defaultDir: 'desc', type: 'number', get: r => (Number.isFinite(r.inflowValue) ? r.inflowValue : null) },
```

In `sortLabel`'s map:

```js
    outflow: { asc: 'Smallest outflow first', desc: 'Biggest outflow first' },
    inflow: { asc: 'Smallest inflow first', desc: 'Biggest inflow first' },
```

- [ ] **Step 4: PASS + full suite. Commit**

```bash
git add src/lib/sortRows.js tests/sort-rows.test.js
git commit -m "sortRows: outflow/inflow sort columns"
```

---

### Task 4: Switch the register table to OUTFLOW / INFLOW columns

Pure display change in `Transactions.jsx`; the logic landed in Tasks 2–3.

**Files:**
- Modify: `src/screens/Transactions.jsx` (COLUMNS at :60-72, SortableHeader `nextWord` at :83-91, Row amount cell at :199-201)

**Interfaces:**
- Consumes: `outflowLabel/inflowLabel`, `SORT_COLUMNS.outflow/inflow` from Tasks 2–3.

- [ ] **Step 1: Replace the `size` entry in `COLUMNS`**

```js
  // Two amount columns (YNAB). altKeys keep the toolbar's size/signed modes
  // lighting a header: both are magnitude-family sorts, closest to OUTFLOW.
  { key: 'outflow', label: 'OUTFLOW', width: 110, align: 'right', altKeys: ['size', 'signed'] },
  { key: 'inflow', label: 'INFLOW', width: 110, align: 'right' },
```

- [ ] **Step 2: Add `nextWord` entries in SortableHeader** (the lookup throws on a missing key):

```js
    outflow: { asc: 'smallest first', desc: 'largest first' },
    inflow: { asc: 'smallest first', desc: 'largest first' },
```

Remove the `size` entry there (no header uses it anymore).

- [ ] **Step 3: Replace the amount cell in `Row`**

Replace the single amount `<td>` (lines 199–201) with two cells, in COLUMNS order (outflow before inflow, both before status):

```jsx
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.outflowLabel}</span>
      </td>
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.inflowLabel}</span>
      </td>
```

- [ ] **Step 4: Verify nothing else assumed the column count**

`gridColSpan` derives from `columns.length + 1` and `GroupHead` takes `colSpan` — both adjust automatically. Grep to confirm no other reader of `COLUMNS` or `'size'` in this file breaks: `grep -n "size\|COLUMNS" src/screens/Transactions.jsx`. The toolbar's signed-sort toggle button (≈line 890) still works (sort key `signed` exists; it lights OUTFLOW via altKeys).

- [ ] **Step 5: Build + suite + commit**

Run: `pnpm test && pnpm build` — Expected: both green.

```bash
git add src/screens/Transactions.jsx
git commit -m "Register: OUTFLOW/INFLOW columns replace the signed AMOUNT column"
```

---

### Task 5: `txEditorState.js` — the editor's pure brain

The inline row keeps the drawer's legacy form shape (`payWith/account/from/to/type/...`) correct **as the user edits YNAB-vocabulary cells**, so `TxForm.useSubmit()` runs unchanged. This module does every translation and decision; the components in later tasks are thin.

**Files:**
- Create: `src/lib/txEditorState.js`
- Test: `tests/tx-editor-state.test.js`

**Interfaces (Produces — later tasks consume exactly these):**
- `cellsFromForm(f) → { account, date, payee, transferTo, category, memo, outflow, inflow, cleared, repeat }` — `account`/`transferTo` are `'acc:<id>'`/`'card:<id>'` refs or `''`; `outflow`/`inflow` are display strings (one of them `''`); `category` is a category id, `''`, or `'__new'`.
- `editorPatch(f, key, value) → object` — a patch for `setForm()`. `key` ∈ `'account'|'date'|'payee'|'transfer'|'category'|'memo'|'outflow'|'inflow'|'cleared'|'repeat'`. Encodes ALL type inference (spec §3).
- `sourceRef(f) → string` — the ref currently acting as the source account for `f.type`.
- `editableCells(f) → object` — `{account, date, payee, category, memo, outflow, inflow, cleared}` booleans (adjustment/transfer restrictions).
- `firstEmptyCell(cells, hideAccount) → key` — which cell autofocuses.
- `keepForNext(f) → object` — the fields "Save and add another" carries over.

- [ ] **Step 1: Write the failing tests**

```js
// tests/tx-editor-state.test.js
import { describe, it, expect } from 'vitest';
import { cellsFromForm, editorPatch, sourceRef, editableCells, firstEmptyCell, keepForNext } from '../src/lib/txEditorState.js';
import { txDefaults, formFromTx } from '../src/drawers/openers.js';

const base = (over = {}) => ({ ...txDefaults('expense'), ...over });

describe('sourceRef', () => {
  it('reads the field the current type stores its source in', () => {
    expect(sourceRef(base({ type: 'expense', payWith: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'income', account: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'transfer', from: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'adjustment', account: 'acc:a1' }))).toBe('acc:a1');
  });
});

describe('editorPatch: amounts drive the type (spec §3)', () => {
  it('outflow → expense, source lands in payWith, inflow cleared', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '700' });
    expect(editorPatch(f, 'outflow', '1,024')).toEqual(
      { type: 'expense', amount: '1,024', payWith: 'acc:a1', account: '' });
  });
  it('inflow with no category → income (bank source moves to account)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: '' });
    expect(editorPatch(f, 'inflow', '500')).toEqual(
      { type: 'income', amount: '500', account: 'acc:a1', payWith: '' });
  });
  it('inflow with a category → refund (source stays in payWith)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: 'c9' });
    expect(editorPatch(f, 'inflow', '500')).toEqual(
      { type: 'refund', amount: '500', payWith: 'acc:a1', account: '' });
  });
  it('inflow onto a CARD source → refund regardless of category (income cannot land on a card)', () => {
    const f = base({ type: 'expense', payWith: 'card:k1', category: '' });
    expect(editorPatch(f, 'inflow', '500').type).toBe('refund');
  });
  it('outflow/inflow on a transfer only swaps direction, never the type', () => {
    const f = base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2' });
    expect(editorPatch(f, 'inflow', '900')).toEqual(
      { amount: '900', from: 'acc:a2', to: 'acc:a1' });
    expect(editorPatch(f, 'outflow', '900')).toEqual({ amount: '900' });
  });
  it('outflow/inflow on an adjustment maps to direction, type untouched', () => {
    const f = base({ type: 'adjustment', account: 'acc:a1' });
    expect(editorPatch(f, 'outflow', '45')).toEqual({ amount: '45', direction: 'decrease' });
    expect(editorPatch(f, 'inflow', '45')).toEqual({ amount: '45', direction: 'increase' });
  });
});

describe('editorPatch: payee and transfer', () => {
  it('picking a To/From payee flips to transfer and clears category/merchant', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', merchant: 'Subway', category: 'c9' });
    expect(editorPatch(f, 'transfer', 'acc:a2')).toEqual({
      type: 'transfer', from: 'acc:a1', to: 'acc:a2',
      merchant: '', category: '', splitOn: false, splits: undefined, repeat: 'never',
    });
  });
  it('typing a plain payee on a transfer converts back to expense', () => {
    const f = base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2', amount: '900' });
    expect(editorPatch(f, 'payee', 'Subway')).toEqual(
      { merchant: 'Subway', type: 'expense', payWith: 'acc:a1', from: '', to: '' });
  });
  it('typing a payee on a non-transfer just sets merchant', () => {
    expect(editorPatch(base({ payWith: 'acc:a1' }), 'payee', 'Subway')).toEqual({ merchant: 'Subway' });
  });
});

describe('editorPatch: category re-infers income vs refund while inflowing', () => {
  it('picking a category on an income flips to refund', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(f, 'category', 'c9')).toEqual(
      { category: 'c9', type: 'refund', payWith: 'acc:a1', account: '' });
  });
  it('clearing the category on a refund flips to income', () => {
    const f = base({ type: 'refund', payWith: 'acc:a1', category: 'c9', amount: '500' });
    expect(editorPatch(f, 'category', '')).toEqual(
      { category: '', type: 'income', account: 'acc:a1', payWith: '' });
  });
  it('on an expense it is a plain category set', () => {
    expect(editorPatch(base({ payWith: 'acc:a1' }), 'category', 'c9')).toEqual({ category: 'c9' });
  });
});

describe('editorPatch: the simple cells', () => {
  it('account writes into the field the type uses', () => {
    expect(editorPatch(base({ type: 'expense' }), 'account', 'acc:a1')).toEqual({ payWith: 'acc:a1' });
    expect(editorPatch(base({ type: 'transfer', to: 'acc:a2' }), 'account', 'acc:a1')).toEqual({ from: 'acc:a1' });
    expect(editorPatch(base({ type: 'income' }), 'account', 'acc:a1')).toEqual({ account: 'acc:a1' });
  });
  it('date / memo / cleared / repeat are direct', () => {
    expect(editorPatch(base(), 'date', '2026-08-17')).toEqual({ date: '2026-08-17' });
    expect(editorPatch(base(), 'memo', 'hi')).toEqual({ notes: 'hi' });
    expect(editorPatch(base(), 'cleared', false)).toEqual({ pending: true });
    expect(editorPatch(base(), 'repeat', 'monthly')).toEqual({ repeat: 'monthly' });
  });
});

describe('cellsFromForm round-trips formFromTx output', () => {
  it('expense', () => {
    const f = formFromTx({ id: 't1', type: 'expense', amount: 1024, date: '2026-08-17T12:00', status: 'cleared', merchant: 'Subway', category: 'c9', accountId: 'a1' });
    const c = cellsFromForm(f);
    expect(c).toMatchObject({ account: 'acc:a1', date: '2026-08-17', payee: 'Subway', category: 'c9', outflow: '1,024', inflow: '', cleared: true, transferTo: '' });
  });
  it('transfer puts the amount on the outflow side and fills transferTo', () => {
    const f = formFromTx({ id: 't2', type: 'transfer', amount: 900, date: '2026-08-17T12:00', status: 'pending', merchant: '', accountId: 'a1', toAccountId: 'a2' });
    expect(cellsFromForm(f)).toMatchObject({ account: 'acc:a1', transferTo: 'acc:a2', outflow: '900', inflow: '', cleared: false });
  });
  it('income lands on inflow', () => {
    const f = formFromTx({ id: 't3', type: 'income', amount: 700, date: '2026-08-17T12:00', status: 'cleared', merchant: 'Payer', accountId: 'a1' });
    expect(cellsFromForm(f)).toMatchObject({ inflow: '700', outflow: '' });
  });
  it('adjustment: sign decides the side', () => {
    const f = formFromTx({ id: 't4', type: 'adjustment', amount: -45, date: '2026-08-17T12:00', status: 'cleared', adjustmentReason: 'fix', accountId: 'a1' });
    expect(cellsFromForm(f)).toMatchObject({ outflow: '45', inflow: '' });
  });
});

describe('editableCells', () => {
  it('adjustments only expose date/memo/amounts/cleared', () => {
    const e = editableCells(base({ type: 'adjustment' }));
    expect(e).toEqual({ account: false, date: true, payee: false, category: false, memo: true, outflow: true, inflow: true, cleared: true });
  });
  it('transfers disable category, everything else on', () => {
    const e = editableCells(base({ type: 'transfer' }));
    expect(e.category).toBe(false);
    expect(e.payee).toBe(true);
  });
});

describe('firstEmptyCell / keepForNext', () => {
  it('focuses the first empty cell in column order', () => {
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('account');
    expect(firstEmptyCell({ account: 'acc:a1', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('payee');
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, true)).toBe('payee');
    expect(firstEmptyCell({ account: 'acc:a1', date: '2026-08-20', payee: 'x', category: 'c9', memo: 'm', outflow: '5', inflow: '' }, false)).toBe('payee');
  });
  it('keepForNext keeps source + date, drops the rest', () => {
    const f = base({ payWith: 'acc:a1', date: '2026-08-17', merchant: 'Subway', amount: '5', notes: 'x' });
    expect(keepForNext(f)).toEqual({ payWith: 'acc:a1', date: '2026-08-17' });
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (`pnpm test tests/tx-editor-state.test.js`)

- [ ] **Step 3: Implement**

```js
// src/lib/txEditorState.js
// The inline editor's pure brain. The row edits YNAB-vocabulary cells
// (account/date/payee/category/memo/outflow/inflow/cleared/repeat) but the
// form object underneath stays in TxForm's legacy shape, so useSubmit(),
// validate.transaction and buildTx run unchanged. Every translation between
// the two vocabularies — including the type inference the spec fixes
// (outflow→expense, inflow+category→refund, inflow+none→income,
// transfer-payee→transfer) — lives here, tested without a DOM.
import { formatAmountInput } from './amountInput.js';

// Where the CURRENT type keeps its source-account ref.
export function sourceRef(f) {
  const type = f.type || 'expense';
  if (type === 'transfer') return f.from || '';
  if (type === 'income' || type === 'adjustment') return f.account || '';
  return f.payWith || '';
}

// A patch that moves the source ref into the field `nextType` reads it from.
// Both source fields are always emitted (one filled, one cleared) so a stale
// ref can never linger in the field the type just left.
function retype(f, nextType, ref) {
  if (nextType === 'income') return { type: 'income', account: ref, payWith: '' };
  return { type: nextType, payWith: ref, account: '' }; // expense | refund
}
function sourceField(f) {
  const type = f.type || 'expense';
  return type === 'transfer' ? 'from' : (type === 'income' || type === 'adjustment') ? 'account' : 'payWith';
}

// Income cannot land on a card (validate: ownsAcc only), so an inflow with a
// card source is always a refund; with a bank source the category decides.
function inflowType(f, categoryOverride) {
  const cat = categoryOverride !== undefined ? categoryOverride : f.category;
  const onCard = String(sourceRef(f)).startsWith('card:');
  return onCard || (cat && cat !== 'rta') ? 'refund' : 'income';
}

export function editorPatch(f, key, value) {
  const type = f.type || 'expense';
  if (key === 'date') return { date: value };
  if (key === 'memo') return { notes: value };
  if (key === 'cleared') return { pending: !value };
  if (key === 'repeat') return { repeat: value };

  if (key === 'account') return { [sourceField(f)]: value };

  if (key === 'payee') {
    if (type !== 'transfer') return { merchant: value };
    // A typed payee ends the transfer: back to money-out from the old source.
    return { merchant: value, type: 'expense', payWith: f.from || '', from: '', to: '' };
  }

  if (key === 'transfer') {
    // To/From payee: become a transfer from the current source to `value`.
    // Transfers carry no category, no merchant, no split, no repeat.
    return {
      type: 'transfer', from: sourceRef(f), to: value,
      merchant: '', category: '', splitOn: false, splits: undefined, repeat: 'never',
    };
  }

  if (key === 'category') {
    if (type === 'income' && value) return { category: value, ...retype(f, 'refund', sourceRef(f)) };
    if (type === 'refund' && !value && !String(sourceRef(f)).startsWith('card:')) {
      return { category: '', ...retype(f, 'income', sourceRef(f)) };
    }
    return { category: value };
  }

  const amount = formatAmountInput(String(value));
  if (key === 'outflow') {
    if (type === 'transfer') return { amount };
    if (type === 'adjustment') return { amount, direction: 'decrease' };
    if (type === 'expense') return { amount };
    return { amount, ...retype(f, 'expense', sourceRef(f)) };
  }
  // key === 'inflow'
  if (type === 'transfer') {
    // Direction flip: money arrives INTO the row's account, so from/to swap.
    return f.to ? { amount, from: f.to, to: f.from } : { amount };
  }
  if (type === 'adjustment') return { amount, direction: 'increase' };
  const t = inflowType(f);
  if (t === type) return { amount };
  return { amount, ...retype(f, t, sourceRef(f)) };
}

// The editor cells for a form (add defaults or formFromTx output for edits).
export function cellsFromForm(f) {
  const type = f.type || 'expense';
  const amt = f.amount ? formatAmountInput(String(f.amount)) : '';
  // Which side the magnitude sits on mirrors txRowOf's outflow/inflow split.
  const inflowSide = type === 'income' || type === 'refund'
    || (type === 'adjustment' && f.direction === 'increase');
  return {
    account: sourceRef(f),
    date: f.date || '',
    payee: f.merchant || '',
    transferTo: type === 'transfer' ? (f.to || '') : '',
    category: f.category || '',
    memo: f.notes || '',
    outflow: inflowSide ? '' : amt,
    inflow: inflowSide ? amt : '',
    cleared: !f.pending,
    repeat: f.repeat || 'never',
  };
}

// Which cells this row exposes. Adjustments reconcile a balance: no payee, no
// category, and the account is fixed. Transfers have no category (the picker's
// Payment/Transfer label renders instead).
export function editableCells(f) {
  const type = f.type || 'expense';
  if (type === 'adjustment') {
    return { account: false, date: true, payee: false, category: false, memo: true, outflow: true, inflow: true, cleared: true };
  }
  return { account: true, date: true, payee: true, category: type !== 'transfer', memo: true, outflow: true, inflow: true, cleared: true };
}

// Autofocus target: the first empty cell in column order. Amounts count as
// one slot (either side filled = not empty). Memo/category never take first
// focus on a fresh row — payee is the natural resting place YNAB uses.
export function firstEmptyCell(cells, hideAccount) {
  if (!hideAccount && !cells.account) return 'account';
  if (!cells.date) return 'date';
  if (!cells.payee) return 'payee';
  if (!cells.outflow && !cells.inflow) return 'payee';
  return 'payee';
}

// "Save and add another" carries the source and date into the next row. The
// next row always starts as an expense (txDefaults('expense')), and an
// expense reads its source from payWith — so the ref lands there whatever
// field the finished row kept it in.
export function keepForNext(f) {
  return { payWith: sourceRef(f), date: f.date };
}
```

Note on `firstEmptyCell`: the test fixes the behavior — empty account wins, then payee; a filled row still lands on payee. Simplify the implementation if the tests stay green (the three trailing branches collapse); the tests are the contract.

- [ ] **Step 4: Run to verify PASS**, adjust until green, then full `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/txEditorState.js tests/tx-editor-state.test.js
git commit -m "txEditorState: pure cell<->form translation + YNAB type inference"
```

---

### Task 6: `payeeOptions.js` — payee dropdown sections

No payee entity exists (Spec 2 adds one). Suggestions derive from distinct past `merchant` values; the "Payments and Transfers" section synthesizes from accounts + credit cards.

**Files:**
- Create: `src/lib/payeeOptions.js`
- Test: `tests/payee-options.test.js`

**Interfaces:**
- Produces: `payeeSections(S, { sourceRef, query }) → [{ label, items }]` where items are `{ kind: 'transfer', ref, label }` or `{ kind: 'payee', name }`. Transfer refs are `'acc:<id>'`/`'card:<id>'`; the row's own source account is excluded. Section labels: `'Payments and Transfers'`, `'Payees'`. Case-insensitive `query` filter on both sections; empty sections are dropped.

- [ ] **Step 1: Failing tests**

```js
// tests/payee-options.test.js
import { describe, it, expect } from 'vitest';
import { payeeSections } from '../src/lib/payeeOptions.js';

const S = {
  accounts: [
    { id: 'a1', nickname: 'BankIslami', status: 'active' },
    { id: 'a2', nickname: 'Easypaisa', status: 'active' },
    { id: 'a3', nickname: 'Old', status: 'closed' },
  ],
  cards: [{ id: 'k1', nickname: 'Meezan Card', last4: '4242', type: 'credit', status: 'active' }],
  transactions: [
    { merchant: 'Subway' }, { merchant: 'subway' }, { merchant: 'Car Wash' },
    { merchant: '' }, { merchant: 'Balance adjustment', type: 'adjustment' },
  ],
};

it('lists To/From per active account and credit card, excluding the source', () => {
  const [transfers] = payeeSections(S, { sourceRef: 'acc:a1', query: '' });
  expect(transfers.label).toBe('Payments and Transfers');
  const labels = transfers.items.map(i => i.label);
  expect(labels).toContain('To/From Easypaisa');
  expect(labels).toContain('To/From Meezan Card ••4242');
  expect(labels).not.toContain('To/From BankIslami'); // the source itself
  expect(labels).not.toContain('To/From Old');        // closed account
});

it('derives distinct payees from merchants, case-insensitively, skipping blanks and adjustments', () => {
  const sections = payeeSections(S, { sourceRef: 'acc:a1', query: '' });
  const payees = sections.find(s => s.label === 'Payees').items.map(i => i.name);
  expect(payees).toEqual(['Car Wash', 'Subway']); // sorted, first-seen casing wins
});

it('filters both sections by query and drops empty sections', () => {
  const sections = payeeSections(S, { sourceRef: 'acc:a1', query: 'easy' });
  expect(sections.length).toBe(1);
  expect(sections[0].items[0].label).toBe('To/From Easypaisa');
});
```

- [ ] **Step 2: FAIL, then implement**

```js
// src/lib/payeeOptions.js
// Sections for the inline editor's payee combobox. There is no payee entity
// yet (Spec 2 adds one): "Payees" is the distinct set of past merchant
// strings, and "Payments and Transfers" synthesizes a To/From entry per
// active account and credit card — picking one turns the row into a transfer
// (see txEditorState.editorPatch 'transfer'). The row's own source account is
// excluded: you cannot transfer to where the money already is.
export function payeeSections(S, { sourceRef = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const hit = s => !q || s.toLowerCase().includes(q);

  const transfers = [
    ...S.accounts.filter(a => a.status === 'active').map(a => ({ kind: 'transfer', ref: 'acc:' + a.id, label: 'To/From ' + a.nickname })),
    ...S.cards.filter(c => c.type === 'credit' && c.status === 'active').map(c => ({ kind: 'transfer', ref: 'card:' + c.id, label: 'To/From ' + c.nickname + ' ••' + c.last4 })),
  ].filter(t => t.ref !== sourceRef && hit(t.label));

  // First-seen casing wins; adjustments' synthetic 'Balance adjustment' is
  // machine-written, not a payee the user should be offered.
  const seen = new Map();
  for (const t of S.transactions) {
    const name = (t.merchant || '').trim();
    if (!name || t.type === 'adjustment' || t.type === 'cardAdjustment') continue;
    const k = name.toLowerCase();
    if (!seen.has(k)) seen.set(k, name);
  }
  const payees = [...seen.values()].filter(hit).sort((a, b) => a.localeCompare(b))
    .map(name => ({ kind: 'payee', name }));

  return [
    { label: 'Payments and Transfers', items: transfers },
    { label: 'Payees', items: payees },
  ].filter(s => s.items.length > 0);
}
```

- [ ] **Step 3: PASS + full suite + commit**

```bash
git add src/lib/payeeOptions.js tests/payee-options.test.js
git commit -m "payeeOptions: transfer + derived-merchant sections for the payee combobox"
```

---

### Task 7: Base UI `Select` primitive + the Account cell

**Files:**
- Create: `src/ui/primitives/Select.jsx`
- Create: `src/ui/tx/inline/AccountCell.jsx`

**Interfaces:**
- Produces: `Select({ value, onValueChange, ariaLabel, renderValue, children, disabled })`, `SelectGroup({ label, children })`, `SelectItem({ value, children })` from the primitive; `AccountCell({ value, onChange, disabled })` where `value` is an `'acc:'/'card:'` ref and options come from `useTxOpts()` (already exported by `src/drawers/TxForm.jsx:35`).
- Consumes: `bankOpts`/`creditOpts` `{id, label}` from `useTxOpts()`.

- [ ] **Step 1: Check the actual Base UI API before writing**

Base UI has no docs bundled as markdown; the type defs are the truth. Run:

```bash
sed -n '1,80p' node_modules/@base-ui/react/select/root/SelectRoot.d.ts
sed -n '1,40p' node_modules/@base-ui/react/select/item/SelectItem.d.ts
```

Confirm the prop names used below (`value`, `onValueChange`, `items` optional; `Select.Item` takes `value`). If a name differs, follow the type defs — they win over this plan's code.

- [ ] **Step 2: Write the primitive**

```jsx
// src/ui/primitives/Select.jsx
// Tokened wrapper over Base UI's Select — same contract as Popover.jsx: Base
// UI supplies positioning, portal, keyboard nav, typeahead and ARIA; we keep
// "The Trusted Ledger" look. First consumer: the inline editor's account cell.
import { Select as BaseSelect } from '@base-ui/react/select';

const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 320, overflowY: 'auto', outline: 'none', minWidth: 'var(--anchor-width)',
};

export function Select({ value, onValueChange, ariaLabel, renderValue, disabled, children, triggerStyle }) {
  return (
    <BaseSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <BaseSelect.Trigger aria-label={ariaLabel} className="field" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        width: '100%', height: 28, padding: '0 8px', fontSize: 13, cursor: 'pointer',
        ...triggerStyle,
      }}>
        <BaseSelect.Value style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderValue}
        </BaseSelect.Value>
        <BaseSelect.Icon style={{ color: 'var(--muted)', fontSize: 10, flex: 'none' }}>▾</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} style={{ zIndex: 45 }}>
          <BaseSelect.Popup style={popupStyle}>{children}</BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export function SelectGroup({ label, children }) {
  return (
    <BaseSelect.Group>
      <BaseSelect.GroupLabel style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', padding: '6px 8px 2px' }}>
        {label}
      </BaseSelect.GroupLabel>
      {children}
    </BaseSelect.Group>
  );
}

export function SelectItem({ value, children }) {
  return (
    <BaseSelect.Item value={value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 22px', borderRadius: 6, fontSize: 13, cursor: 'pointer', position: 'relative' }} className="hv-elev">
      <BaseSelect.ItemIndicator style={{ position: 'absolute', left: 6, color: 'var(--accent)' }}>✓</BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
```

- [ ] **Step 3: Write the account cell**

```jsx
// src/ui/tx/inline/AccountCell.jsx
// The editor row's ACCOUNT cell: a grouped Base UI select over the same
// balance-annotated options the drawer used (useTxOpts). The picked ref lands
// in whichever legacy field the current type reads (txEditorState 'account').
import { Select, SelectGroup, SelectItem } from '../../primitives/Select.jsx';
import { useTxOpts } from '../../../drawers/TxForm.jsx';

export default function AccountCell({ value, onChange, disabled }) {
  const { bankOpts, creditOpts } = useTxOpts();
  const all = [...bankOpts, ...creditOpts];
  const picked = all.find(o => o.id === value);
  // Balance annotations stay in the LIST; the closed trigger shows the name
  // only (the row has no room for " — Rs 1,234,567").
  const nameOnly = label => label.split(' — ')[0];
  return (
    <Select value={value || null} onValueChange={v => onChange(v || '')} ariaLabel="Account" disabled={disabled}
      renderValue={() => picked ? nameOnly(picked.label) : 'account'}>
      <SelectGroup label="Cash Accounts">
        {bankOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectGroup>
      {creditOpts.length > 0 && (
        <SelectGroup label="Credit Cards">
          {creditOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectGroup>
      )}
    </Select>
  );
}
```

- [ ] **Step 4: Build + suite** (`pnpm test && pnpm build` — the components aren't mounted yet; this catches import/syntax errors and the no-inline-components scan).

- [ ] **Step 5: Commit**

```bash
git add src/ui/primitives/Select.jsx src/ui/tx/inline/AccountCell.jsx
git commit -m "Select primitive (Base UI) + inline editor AccountCell"
```

---

### Task 8: Base UI `Combobox` primitive + the Payee cell

**Files:**
- Create: `src/ui/primitives/Combobox.jsx`
- Create: `src/ui/tx/inline/PayeeCell.jsx`

**Interfaces:**
- Produces: `PayeeCell({ payee, transferTo, sourceRef, onPickPayee(name), onPickTransfer(ref), disabled })`. Free text commits as a payee on blur/close. `transferTo` non-empty renders the To/From label of that ref.
- Consumes: `payeeSections` (Task 6).

- [ ] **Step 1: Check the Combobox API**

```bash
sed -n '1,120p' node_modules/@base-ui/react/combobox/root/ComboboxRoot.d.ts
sed -n '1,40p' node_modules/@base-ui/react/combobox/item/ComboboxItem.d.ts
```

Confirm: `Combobox.Root` (`items`, `value`, `onValueChange`, `inputValue`, `onInputValueChange`, `filter`), `Combobox.Input`, `Combobox.Portal/Positioner/Popup/List/Group/GroupLabel/Item/Empty`. The type defs win over this plan's code if they differ. If `Combobox.Root`'s controlled API fights the free-text + two-kinds-of-item requirement (spend at most ~30 minutes), FALL BACK to composing the panel by hand inside `PopoverPanel` following `PlanCategoryPicker`'s input-is-the-field pattern — the primitive file then wraps that composition instead; keep the same exported contract either way.

- [ ] **Step 2: Write the primitive + cell**

```jsx
// src/ui/primitives/Combobox.jsx
// Thin tokened re-exports over Base UI's Combobox parts. Consumers compose
// Root/Input themselves (a combobox's controlled state is the consumer's
// business); this file only owns the look of the floating list.
import { Combobox as BaseCombobox } from '@base-ui/react/combobox';

export const Combobox = BaseCombobox;

const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 300, overflowY: 'auto', outline: 'none', width: 'var(--anchor-width)',
};

export function ComboboxPanel({ children, footer }) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner sideOffset={4} style={{ zIndex: 45 }}>
        <BaseCombobox.Popup style={popupStyle}
          onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
          <BaseCombobox.List>{children}</BaseCombobox.List>
          {footer}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}

export function ComboboxGroupLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 8px 2px' }}>{children}</div>;
}

export function ComboboxItem({ value, children, indent }) {
  return (
    <BaseCombobox.Item value={value} className="hv-elev"
      style={{ padding: '5px 8px', paddingLeft: indent ? 22 : 8, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
      {children}
    </BaseCombobox.Item>
  );
}
```

```jsx
// src/ui/tx/inline/PayeeCell.jsx
// The PAYEE cell: type-to-filter combobox over payeeSections. Free text is a
// valid payee (commits on blur / Enter); picking a To/From item makes the row
// a transfer instead. Item values are the section objects themselves — kind
// tells the pick handler which of the two events happened.
import { useMemo, useState } from 'react';
import { useStore } from '../../../store/StoreProvider.jsx';
import { payeeSections } from '../../../lib/payeeOptions.js';
import { Combobox, ComboboxPanel, ComboboxGroupLabel, ComboboxItem } from '../../primitives/Combobox.jsx';

export default function PayeeCell({ payee, transferTo, sourceRef, onPickPayee, onPickTransfer, disabled, autoFocus }) {
  const { data: S } = useStore();
  const [q, setQ] = useState(null); // null = closed, show the committed value
  const sections = useMemo(() => payeeSections(S, { sourceRef, query: q || '' }), [S, sourceRef, q]);
  const transferLabel = useMemo(() => {
    if (!transferTo) return '';
    const hit = sections.flatMap(s => s.items).find(i => i.kind === 'transfer' && i.ref === transferTo);
    return hit ? hit.label : 'To/From —';
  }, [sections, transferTo]);
  const shown = q !== null ? q : (transferTo ? transferLabel : payee);

  const pick = item => {
    if (!item) return;
    if (item.kind === 'transfer') onPickTransfer(item.ref);
    else onPickPayee(item.name);
    setQ(null);
  };
  const commitText = () => { if (q !== null) { onPickPayee(q); setQ(null); } };

  return (
    <Combobox.Root items={sections.flatMap(s => s.items)} onValueChange={pick} value={null} filter={null}>
      <Combobox.Input
        className="field" placeholder="payee" aria-label="Payee" disabled={disabled} autoFocus={autoFocus}
        value={shown}
        onChange={e => setQ(e.target.value)}
        onBlur={commitText}
        style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }}
      />
      <ComboboxPanel>
        {sections.map(s => (
          <Combobox.Group key={s.label} items={s.items}>
            <ComboboxGroupLabel>{s.label}</ComboboxGroupLabel>
            {s.items.map(i => (
              <ComboboxItem key={i.kind === 'transfer' ? i.ref : i.name} value={i} indent>
                {i.kind === 'transfer' ? i.label : i.name}
              </ComboboxItem>
            ))}
          </Combobox.Group>
        ))}
      </ComboboxPanel>
    </Combobox.Root>
  );
}
```

- [ ] **Step 3: Build + suite + commit**

```bash
git add src/ui/primitives/Combobox.jsx src/ui/tx/inline/PayeeCell.jsx
git commit -m "Combobox primitive (Base UI) + inline editor PayeeCell"
```

---

### Task 9: Date, Category, Amount and Status cells

**Files:**
- Create: `src/ui/tx/inline/DateCell.jsx`
- Create: `src/ui/tx/inline/AmountCell.jsx`
- Create: `src/ui/tx/inline/CategoryCell.jsx`
- Modify: `src/ui/PlanCategoryPicker.jsx` (one additive prop: `footer`)

**Interfaces:**
- Produces: `DateCell({ value, onChange, repeat, onRepeat, showRepeat, disabled })`; `AmountCell({ value, onCommit, placeholder, ariaLabel, disabled, autoFocus })` — commits a formatted amount string, evaluating `+ − × ÷` expressions via `applyCalcExpr`; `CategoryCell({ value, onChange, onCreate, onSplit, onTransferClick, isTransfer, disabled })`.
- Consumes: `calendarCells/shiftMonth` (Task 1), `PRESETS` from `src/lib/schedule.js`, `applyCalcExpr` from `src/lib/calcExpr.js`, `formatAmountInput` + `parseAmt`, `PlanCategoryPicker`, `Popover` primitives.

- [ ] **Step 1: DateCell**

```jsx
// src/ui/tx/inline/DateCell.jsx
// The DATE cell: dd/mm/yyyy trigger opening a calendar popover with month
// stepper, Today/Yesterday chips, and (when the row can become a rule) the
// Repeat preset dropdown — the same PRESETS the drawer used, so applyRepeat
// in the store needs no change. Escape closes the popover only (bubbling is
// stopped so DrawerProvider's session-level Escape does not also fire).
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { calendarCells, shiftMonth } from '../../../lib/calendar.js';
import { todayStr, addDays } from '../../../lib/dates.js';
import { PRESETS } from '../../../lib/schedule.js';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = ymd => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? ymd.slice(8) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4) : 'date');
const chip = on => ({ height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), background: on ? 'var(--soft)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text)' });

export default function DateCell({ value, onChange, repeat, onRepeat, showRepeat, disabled }) {
  const today = todayStr();
  const [month, setMonth] = useState(() => String(value || today).slice(0, 7));
  const cells = calendarCells(month, value, today);
  return (
    <Popover>
      <PopoverTrigger className="field tnum" disabled={disabled} aria-label="Date" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%', height: 28, padding: '0 8px', fontSize: 13, cursor: 'pointer' }}>
        <span>{dmy(value)}</span>
        <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </PopoverTrigger>
      <PopoverPanel width={272} arrow style={{ padding: 10 }}
        onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MN[+month.slice(5) - 1] + ' ' + month.slice(0, 4)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 2 }}>
          {cells.map(c => (
            <button key={c.iso} type="button" onClick={() => { onChange(c.iso); setMonth(c.iso.slice(0, 7)); }}
              aria-current={c.sel ? 'date' : undefined}
              style={{ height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                border: '1px solid ' + (c.today && !c.sel ? 'var(--accent)' : 'transparent'),
                background: c.sel ? 'var(--accent)' : 'transparent',
                color: c.sel ? 'var(--on-accent)' : c.out ? 'var(--border)' : 'var(--text)',
                fontWeight: c.sel || c.today ? 600 : 400 }}>{c.n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={() => { onChange(today); setMonth(today.slice(0, 7)); }} className="hv-soft" style={chip(value === today)}>Today</button>
          <button type="button" onClick={() => { onChange(addDays(today, -1)); }} className="hv-soft" style={chip(value === addDays(today, -1))}>Yesterday</button>
          {showRepeat && (
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>Repeat:</span>
              <select aria-label="Repeat" value={repeat || 'never'} onChange={e => onRepeat(e.target.value)}
                style={{ height: 24, minWidth: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, padding: '0 4px', cursor: 'pointer' }}>
                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </PopoverPanel>
    </Popover>
  );
}
```

Check first that `addDays` is exported from `src/lib/dates.js` (WhenField imports it from `src/lib/schedule.js` — use whichever module exports it; `grep -rn "export function addDays" src/lib/`).

- [ ] **Step 2: AmountCell (with the ＋−×÷ pad)**

```jsx
// src/ui/tx/inline/AmountCell.jsx
// OUTFLOW / INFLOW cells. Free typing is group-formatted like the drawer's
// AmountField; anything containing an operator is a calculator expression,
// folded left-to-right by applyCalcExpr on Enter/blur (seeded with the cell's
// prior committed value, same contract as the plan-cell calculator). The ⌗
// trigger opens a 2×2 op pad that appends the operator, YNAB-style.
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { applyCalcExpr } from '../../../lib/calcExpr.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import { parseAmt } from '../../../lib/format.js';

const OP_KEYS = /[+\-−×*÷/]/;

export default function AmountCell({ value, onCommit, placeholder, ariaLabel, disabled, autoFocus }) {
  const [draft, setDraft] = useState(null); // null = idle, mirror committed value
  const shown = draft !== null ? draft : (value || '');

  const commit = () => {
    if (draft === null) return;
    const s = draft.trim();
    if (!s) { onCommit(''); setDraft(null); return; }
    if (OP_KEYS.test(s)) {
      const r = applyCalcExpr(parseAmt(value || '') || 0, s);
      // Invalid expression: stay open with the draft so it can be corrected.
      if (r === null || r < 0) return;
      onCommit(formatAmountInput(String(r)));
    } else {
      onCommit(formatAmountInput(s));
    }
    setDraft(null);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Popover>
        <PopoverTrigger aria-label={'Calculator for ' + ariaLabel} disabled={disabled} tabIndex={-1} className="hv-soft"
          style={{ width: 18, height: 28, border: 'none', background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', flex: 'none', padding: 0 }}>
          ⌗
        </PopoverTrigger>
        <PopoverPanel width={92} arrow style={{ padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {['+', '−', '×', '÷'].map(op => (
              <button key={op} type="button" className="hv-soft"
                onClick={() => setDraft(d => (d !== null ? d : (value || '')) + op)}
                style={{ height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {op}
              </button>
            ))}
          </div>
        </PopoverPanel>
      </Popover>
      <input className="field tnum" inputMode="decimal" placeholder={placeholder} aria-label={ariaLabel}
        disabled={disabled} autoFocus={autoFocus} value={shown}
        onFocus={e => e.target.select()}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' && draft !== null && OP_KEYS.test(draft)) { e.preventDefault(); commit(); } }}
        style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right', minWidth: 0 }}
      />
    </span>
  );
}
```

Note the Enter rule: a plain number lets Enter bubble to the row (save); an expression consumes Enter to fold first. `parseAmt` location: check `grep -n "parseAmt" src/lib/format.js src/lib/util.js` — TxForm imports it from `format.js`, validate from `util.js`; import from `format.js`.

- [ ] **Step 3: `footer` prop on PlanCategoryPicker, then CategoryCell**

In `src/ui/PlanCategoryPicker.jsx`: add `footer` to the props destructuring (default `null`), and render it INSIDE the panel div, after the `.picker-scroll` list closes and only when `!creating`:

```jsx
              {footer && <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 8 }}>{footer}</div>}
```

(Existing consumers pass no footer — no behavior change.)

```jsx
// src/ui/tx/inline/CategoryCell.jsx
// CATEGORY cell: the existing PlanCategoryPicker combobox (search, groups,
// available amounts, inline ＋New Category) plus the YNAB footer — Split and
// Payment/Transfer. On a transfer row the picker is replaced by a static
// "Payment/Transfer" label (transfers carry no category).
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { currentMonth, nowIso } from '../../../lib/dates.js';
import { envelopeFor } from '../../../lib/envelope.js';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';

const footerBtn = { flex: 1, height: 30, border: 'none', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

export default function CategoryCell({ value, onChange, onCreate, onSplit, canSplit, isTransfer, catType, disabled }) {
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  if (isTransfer) {
    return <span className="field" style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>Payment/Transfer</span>;
  }
  const env = envelopeFor(S, month, nowIso());
  return (
    <PlanCategoryPicker
      env={env} S={S} month={month} money={money}
      catType={catType} showAmounts={catType === 'expense'} excludeRta heading={null}
      allowCreate showSelected placeholder="category"
      onCreate={onCreate}
      value={value} onChange={onChange}
      footer={canSplit ? (
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={onSplit} className="hv-soft" style={footerBtn}>Split</button>
      ) : null}
    />
  );
}
```

(The spec's Payment/Transfer footer button is intentionally NOT in the category footer — the payee combobox's "Payments and Transfers" section already provides the affordance, and a second path through the category cell would need its own account-target picker for no added capability. YAGNI; note this when reporting.)

The picker's own input is 34px tall vs the row's 28px fields — acceptable for v1; do not fork the component for 6px.

- [ ] **Step 4: Build + suite + commit**

```bash
git add src/ui/tx/inline/DateCell.jsx src/ui/tx/inline/AmountCell.jsx src/ui/tx/inline/CategoryCell.jsx src/ui/PlanCategoryPicker.jsx
git commit -m "Inline editor cells: date+repeat popover, amount+calc pad, category with Split footer"
```

---

### Task 10: TxEditorRow + inline shell wiring + Save and add another

The integration task: DrawerProvider stops rendering the desktop drawer for `addTx`, the register renders the editor row instead, and `useSubmit` reports success so "Save and add another" can chain.

**Files:**
- Create: `src/ui/tx/inline/TxEditorRow.jsx`
- Modify: `src/ui/DrawerProvider.jsx` (inlineTx branch)
- Modify: `src/drawers/TxForm.jsx` (`useSubmit` returns success booleans)
- Modify: `src/screens/Transactions.jsx` (render the row; add-position tbody)

**Interfaces:**
- Consumes: everything from Tasks 5–9; `txFormDef` (its `useSubmit`, `cta`), `useDrawer()`, `txDefaults` + `keepForNext`.
- Produces: `TxEditorRow({ hideAccount, colSpan })` — reads the drawer context itself; renders TWO `<tr>`s (cells row + action row). `useSubmit()`'s returned function now resolves `true` on save, `false` otherwise (DrawerShell/TxSheet ignore the value — additive).

- [ ] **Step 1: `useSubmit` returns success**

In `src/drawers/TxForm.jsx` `useSubmit()` (lines 398–458): add `return false;` after the three early-return guards (validation `fail(...)`, `setDup(...)`, and the type-change `if (!ok) return;`), and `return true;` after both save paths (the `splitting` branch's `flashRows(ids);` and the final `flashRows(rowId); if (repeated) ...`).

- [ ] **Step 2: DrawerProvider inline branch**

In `src/ui/DrawerProvider.jsx`:

```js
  // Desktop renders the addTx form INLINE in the register (TxEditorRow reads
  // this same context); no aside at all. Phone keeps TxSheet. Every desktop
  // addTx opener is responsible for being on (or navigating to) /transactions.
  const inlineTx = !phone && state?.name === 'addTx';
```

Change the render (line 133-135):

```jsx
      {state && def && (phoneTx
        ? <TxSheet key="tx-phone" def={def} state={state} requestClose={requestClose} />
        : inlineTx ? null
        : <DrawerShell key={state.name} def={def} state={state} closeDrawer={closeDrawer} requestClose={requestClose} />)}
```

The existing document-level Escape listener stays as-is — for the inline session it IS the row's Escape (requestClose with the dirty confirm). Cell popovers stopPropagation on Escape (Tasks 8–9) so an open dropdown closes without ending the session. Also expose `requestClose`: add it to the context `value` object (and its useMemo deps) — TxEditorRow's Cancel button needs the dirty-guarded close, and today only shells receive it as a prop.

- [ ] **Step 3: TxEditorRow**

```jsx
// src/ui/tx/inline/TxEditorRow.jsx
// The inline editor — the third shell over the drawer form (desktop drawer /
// phone TxSheet / this). Two <tr>s: the cells row aligned to the register's
// columns, and an action row (errors, dup warning, Cancel/Save/Save-and-add-
// another). All state lives in the drawer context; all translation lives in
// txEditorState. Enter saves (unless a popover consumed it), Escape is handled
// by DrawerProvider's session listener.
import { useMemo, useState } from 'react';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { txFormDef } from '../../../drawers/TxForm.jsx';
import { txDefaults } from '../../../drawers/openers.js';
import { ruleFromTx } from '../../../lib/schedule.js';
import { cellsFromForm, editorPatch, editableCells, firstEmptyCell, keepForNext, sourceRef } from '../../../lib/txEditorState.js';
import AccountCell from './AccountCell.jsx';
import DateCell from './DateCell.jsx';
import PayeeCell from './PayeeCell.jsx';
import CategoryCell from './CategoryCell.jsx';
import AmountCell from './AmountCell.jsx';
import Checkbox from '../../Checkbox.jsx';

const cellTd = { padding: '4px 4px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', background: 'var(--soft)' };
const btn = accent => ({ height: 30, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: accent ? 'none' : '1px solid var(--border)', background: accent ? 'var(--accent)' : 'var(--surface)', color: accent ? 'var(--on-accent)' : 'var(--text)' });

export default function TxEditorRow({ hideAccount, colSpan }) {
  const { drawer, setForm, setField, openDrawer, requestClose } = useDrawer();
  const { data: S } = useStore();
  const submit = txFormDef.useSubmit();
  const f = drawer.form;
  const cells = cellsFromForm(f);
  const can = editableCells(f);
  const isEdit = !!f.editId;
  const type = f.type || 'expense';
  const isTransfer = type === 'transfer';
  // Same visibility rules the drawer used (TxForm.jsx fx* truth table).
  const canSplit = type === 'expense' && !f.editId && !f.fromRecurring;
  const splitOn = canSplit && !!f.splitOn;
  const showRepeat = (type === 'expense' || type === 'income') && !f.fromRecurring && !ruleFromTx(S, f.editId) && !splitOn;
  const catType = type === 'income' ? 'income' : 'expense';
  // Computed once per session: which cell greets the keyboard.
  const [focusKey] = useState(() => firstEmptyCell(cellsFromForm(f), hideAccount));

  const patch = (key, value) => setForm(editorPatch(f, key, value));
  const saveAndAdd = async () => {
    const keep = keepForNext(f);
    if (await submit()) openDrawer('addTx', { ...txDefaults('expense'), ...keep });
  };
  const onRowKey = e => {
    if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') submit();
  };

  return (
    <>
      <tr onKeyDown={onRowKey} style={{ height: '2.5rem' }}>
        <td style={{ ...cellTd, padding: 0, minWidth: 34 }}>
          <Checkbox fill checked readOnly label="Editing this transaction" onChange={() => {}} />
        </td>
        {!hideAccount && (
          <td style={cellTd}>
            <AccountCell value={cells.account} disabled={!can.account} onChange={v => patch('account', v)} />
          </td>
        )}
        <td style={cellTd}>
          <DateCell value={cells.date} onChange={v => patch('date', v)} repeat={cells.repeat} onRepeat={v => patch('repeat', v)} showRepeat={showRepeat} disabled={!can.date} />
        </td>
        <td style={cellTd}>
          <PayeeCell payee={cells.payee} transferTo={cells.transferTo} sourceRef={sourceRef(f)}
            onPickPayee={v => patch('payee', v)} onPickTransfer={ref => patch('transfer', ref)}
            disabled={!can.payee} autoFocus={focusKey === 'payee'} />
        </td>
        <td style={cellTd}>
          {splitOn
            ? <span className="field" style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>Split ({(f.splits || []).length})</span>
            : <CategoryCell value={cells.category} catType={catType} isTransfer={isTransfer} disabled={!can.category}
                onChange={id => patch('category', id)}
                onCreate={({ name, groupId }) => setForm({ category: '__new', newCat: name, newCatGroup: groupId || '' })}
                canSplit={canSplit} onSplit={() => setForm({ splitOn: true, splits: [] })} />}
        </td>
        <td style={cellTd}>
          <input className="field" placeholder="memo" aria-label="Memo" disabled={!can.memo} value={cells.memo}
            onChange={e => patch('memo', e.target.value)}
            style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }} />
        </td>
        <td style={cellTd}>
          <AmountCell value={cells.outflow} onCommit={v => patch('outflow', v)} placeholder="outflow" ariaLabel="Outflow" disabled={!can.outflow} />
        </td>
        <td style={cellTd}>
          <AmountCell value={cells.inflow} onCommit={v => patch('inflow', v)} placeholder="inflow" ariaLabel="Inflow" disabled={!can.inflow} />
        </td>
        <td style={{ ...cellTd, textAlign: 'center' }}>
          <button type="button" onClick={() => patch('cleared', !cells.cleared)} aria-pressed={cells.cleared}
            aria-label={cells.cleared ? 'Cleared — click to unclear' : 'Uncleared — click to clear'} className="hv-soft"
            style={{ width: 22, height: 22, borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              border: cells.cleared ? 'none' : '1.25px solid var(--muted)',
              background: cells.cleared ? 'var(--pos)' : 'transparent',
              color: cells.cleared ? 'var(--on-pos)' : 'var(--muted)' }}>C</button>
        </td>
      </tr>
      <tr>
        <td colSpan={colSpan} style={{ padding: '6px 12px 10px', borderBottom: '1px solid var(--border)', background: 'var(--soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {drawer.errList.length > 0 && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--neg)', marginRight: 'auto' }}>{drawer.errList.join(' ')}</span>
            )}
            {drawer.dupMsg && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--warn)', marginRight: 'auto' }}>
                <b>Possible duplicate — </b>{drawer.dupMsg}
              </span>
            )}
            <button type="button" onClick={requestClose} className="hv-elev" style={btn(false)}>Cancel</button>
            <button type="button" onClick={submit} className="hv-accent" style={btn(true)}>{txFormDef.cta(drawer)}</button>
            {!isEdit && (
              <button type="button" onClick={saveAndAdd} className="hv-accent" style={btn(true)}>Save and add another</button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
```

(Split sub-rows come in Task 12; this task ships the `Split (n)` placeholder cell that Task 12 replaces with real sub-row `<tr>`s.)

- [ ] **Step 4: Render it in the register**

In `src/screens/Transactions.jsx`:

1. Import: `import TxEditorRow from '../ui/tx/inline/TxEditorRow.jsx';`
2. Below the `drawer` destructure (≈line 270), derive:

```js
  // The inline editor session (desktop only — phone renders TxSheet instead).
  const inlineTx = !phone && drawer?.name === 'addTx' ? drawer : null;
  const editingId = inlineTx ? inlineTx.form.editId : null;
```

3. **Add row**: immediately after `</thead>` (line 927), before the scheduled tbody:

```jsx
              {inlineTx && !editingId && (
                <tbody>
                  <TxEditorRow hideAccount={!!accountId} colSpan={gridColSpan} />
                </tbody>
              )}
```

4. **Edit-in-place**: in the recorded map (line 958) replace the body with:

```jsx
                {shownRows.map(t => (t.id === editingId
                  ? <TxEditorRow key={t.id} hideAccount={!!accountId} colSpan={gridColSpan} />
                  : <Row
                      key={t.id} t={t} selId={t.id} hideAccount={!!accountId}
                      checked={selected.has(t.id)} onToggleRow={toggleRow} focused={t.id === cursorId}
                      onCategorize={openRowCategorize} flash={flashIds.has(t.id)}
                    />))}
```

And the scheduled map (line 938) equivalently: `x.selId === editingId ? <TxEditorRow key={key} .../> : <Row .../>`.

5. The table renders only when `postedRows.length > 0 || scheduled.length > 0` (line 902) — an empty ledger's add row must still show. Change that condition to `(postedRows.length > 0 || scheduled.length > 0 || (inlineTx && !editingId))`, and gate the "Nothing recorded" empty state (line 990) with `&& !inlineTx`.

- [ ] **Step 5: Live smoke test, suite, build, commit**

Run `pnpm test && pnpm build`. Then start `pnpm dev` and manually confirm: Add Transaction opens the row under the header; typing an outflow + payee + Save records an expense and blinks it; Save-and-add-another keeps account+date; Cancel with edits asks the discard confirm; Escape closes; the drawer no longer appears on desktop.

```bash
git add src/ui/tx/inline/TxEditorRow.jsx src/ui/DrawerProvider.jsx src/drawers/TxForm.jsx src/screens/Transactions.jsx
git commit -m "Inline editor row: third shell over the drawer form, add + save-and-add-another"
```

---

### Task 11: Edit mode — second click, shortcuts, pill repoint

**Files:**
- Modify: `src/screens/Transactions.jsx` (toggleRow, needs-category pill handler)

**Interfaces:**
- Consumes: `openers.editTx` (unchanged — it opens the same `addTx` session, which now renders inline on desktop). BulkBar Edit and `Shift+E` already call it: they go inline with NO code change. Same for the scheduled bulk `Edit`.

- [ ] **Step 1: Second click on the sole-selected row opens the editor**

In `toggleRow` (line 407), before the `additive` computation, insert:

```js
    // YNAB edit gesture: the row is already the sole selection and is clicked
    // plainly again → open it in the inline editor instead of deselecting.
    // (Desktop only; phone taps already edit via TxSheet. cardAdjustment rows
    // are refused by openers.editTx itself.)
    if (!phone && e && !e.shiftKey && !e.metaKey && !e.ctrlKey
      && selected.size === 1 && selected.has(id)) {
      openers.editTx(S, id, openDrawer);
      return;
    }
```

Note this branch replaces the old "clicking the sole selection clears it" behavior for plain clicks — deselection still works via the checkbox, Escape, and ⌘/Ctrl+click. Scheduled future-dated rows use `toggleSched`, not `toggleRow` — add the same gesture there for keys that are tx ids (a `selId` exists):

```js
  const toggleSched = (key, on) => {
    if (!phone && schedSel.size === 1 && schedSel.has(key) && !String(key).startsWith('rule:')) {
      openers.editTx(S, key, openDrawer);
      return;
    }
    ...existing body...
  };
```

- [ ] **Step 2: Needs-category pill opens the inline editor**

The pill currently opens a category popover (`openRowCategorize`). Spec: repoint to the editor. In the `Row` call, this is already wired through `onCategorize` — change the handler (line 322):

```js
  const openRowCategorize = (id, el) => {
    if (!phone) { openers.editTx(S, id, openDrawer); return; }
    setCatTarget(id); setCatAnchor(el || null);
  };
```

(Phone keeps the sheet. The desktop bulk-Categorize popover is untouched — it's a multi-row action the editor can't do.)

- [ ] **Step 3: Confirm the shortcut/cursor suspension**

No code: `useShortcuts(txShortcuts, !drawer && ...)` (line 672), `useSequence(..., !drawer && ...)` and `navEnabled = !drawer && ...` (line 686) all key off `drawer` truthiness — an inline session sets it, so register chords, V-sequences and the row cursor suspend automatically while editing. Verify by reading; note it in the task report.

- [ ] **Step 4: Live check + suite + commit**

Manually: click a row (selects), click again (editor opens in place with values); edit the amount to the other column and confirm income↔refund/expense re-inference on save; Shift+E with one row selected opens inline; adjustment rows expose only date/memo/amount/status.

```bash
git add src/screens/Transactions.jsx
git commit -m "Inline edit: second-click gesture, pill repoint; chords auto-suspend"
```

---

### Task 12: Inline splits

**Files:**
- Create: `src/ui/tx/inline/SplitRows.jsx`
- Modify: `src/ui/tx/inline/TxEditorRow.jsx` (render SplitRows; replace the `Split (n)` placeholder with a summary + Un-split)

**Interfaces:**
- Consumes: `blankLine, splitRemainder, fillRemainderIndex, validateSplit, splitHalves` from `src/lib/splitTx.js` (exact API in `TxForm.jsx:20` imports); the `splitting` path in `useSubmit` (unchanged); `formatAmountInput`.
- Produces: `SplitRows({ colSpan, hideAccount })` — one `<tr>` per split line under the editor row: indented category picker + memo + amount, a remainder chip, "+ Add line" and per-line remove.

- [ ] **Step 1: Component**

```jsx
// src/ui/tx/inline/SplitRows.jsx
// Split sub-rows under the inline editor (YNAB's indented split lines). Each
// line is category + memo + amount; they must sum to the row's total before
// Save (validateSplit runs in useSubmit, and the remainder chip shows the gap
// live). Lines reuse the drawer's split helpers so the two entry paths cannot
// drift. NOTE: a split line's memo is not stored per-leg today (legs share the
// parent's notes) — the memo cell is omitted until the model carries it.
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { currentMonth, nowIso } from '../../../lib/dates.js';
import { envelopeFor } from '../../../lib/envelope.js';
import { blankLine, fillRemainderIndex, splitRemainder } from '../../../lib/splitTx.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';

const lineTd = { padding: '2px 4px', borderBottom: '1px solid var(--border)', background: 'var(--soft)', verticalAlign: 'middle' };

export default function SplitRows({ colSpan }) {
  const { drawer, setForm } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const env = envelopeFor(S, month, nowIso());
  const f = drawer.form;
  const lines = f.splits || [];
  const setLines = splits => setForm({ splits });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = i => {
    const rest = lines.filter((_, j) => j !== i);
    if (rest.length < 2) setForm({ splitOn: false, splits: undefined, category: rest[0]?.category || '' });
    else setLines(rest);
  };
  const rem = splitRemainder(f.amount, lines);
  const fillIdx = fillRemainderIndex(lines);
  return (
    <>
      {lines.map((l, i) => (
        <tr key={l.id}>
          <td style={lineTd} />
          <td colSpan={colSpan - 4} style={{ ...lineTd, paddingLeft: 34 }}>
            <PlanCategoryPicker env={env} S={S} month={month} money={money}
              catType="expense" showAmounts excludeRta heading={null} allowCreate showSelected placeholder="category"
              onCreate={({ name, groupId }) => setLine(i, { category: '__new', newCat: name, newCatGroup: groupId || '' })}
              value={l.category} onChange={id => setLine(i, { category: id, newCat: '', newCatGroup: '' })} />
          </td>
          <td style={lineTd}>
            <input className="field tnum" inputMode="decimal" aria-label={'Split line ' + (i + 1) + ' amount'}
              value={l.amount} onFocus={e => e.target.select()}
              onChange={e => setLine(i, { amount: formatAmountInput(e.target.value) })}
              style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right' }} />
          </td>
          <td style={lineTd} />
          <td style={{ ...lineTd, textAlign: 'center' }}>
            <button type="button" onClick={() => removeLine(i)} aria-label={'Remove split line ' + (i + 1)} className="hv-soft"
              style={{ width: 22, height: 22, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={colSpan} style={{ ...lineTd, padding: '4px 12px 8px 34px' }}>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            <button type="button" onClick={() => setLines([...lines, blankLine()])} className="hv-soft"
              style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Add line</button>
            {rem !== 0 && (
              <button type="button" className="tnum hv-soft" disabled={rem < 0 || fillIdx < 0}
                onClick={() => { if (rem > 0 && fillIdx >= 0) setLine(fillIdx, { amount: formatAmountInput(String(rem)) }); }}
                style={{ border: 'none', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, cursor: rem > 0 && fillIdx >= 0 ? 'pointer' : 'not-allowed', background: rem > 0 ? 'var(--elev)' : 'var(--neg-soft)', color: rem > 0 ? 'var(--muted)' : 'var(--neg)' }}>
                {rem > 0 ? money(rem) + ' left' : 'Over by ' + money(Math.abs(rem))}
              </button>
            )}
          </span>
        </td>
      </tr>
    </>
  );
}
```

Check `colSpan - 4` arithmetic against the actual column count (checkbox + N data columns; the category span must cover account..category on All Accounts and date..category on a single account — adjust with `hideAccount` if the math is off by one when you count the real `<td>`s).

- [ ] **Step 2: Wire into TxEditorRow**

In `TxEditorRow.jsx`: import `SplitRows`; seed the split with the drawer's 50/50 prefill when the footer button fires — replace `onSplit={() => setForm({ splitOn: true, splits: [] })}` with the drawer's exact seeding block (copy from `TxForm.jsx:174-185`, using `splitHalves`/`blankLine`/`formatAmountInput`); render after the cells `<tr>`, before the action `<tr>`:

```jsx
      {splitOn && <SplitRows colSpan={colSpan} />}
```

In the category cell placeholder for `splitOn`, add an Un-split affordance:

```jsx
            ? <button type="button" className="field hv-soft" onClick={() => setForm({ splitOn: false, splits: undefined, category: (f.splits || [])[0]?.category || '' })}
                style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', width: '100%' }}>
                Split ({(f.splits || []).length}) — un-split
              </button>
```

- [ ] **Step 3: Live check + suite + commit**

Manually: Split from the category footer seeds two half lines; remainder chip fills; Save with non-zero remainder is refused with the validation message in the action row; a balanced save records N legs, all flashing; undo removes all legs in one step.

```bash
git add src/ui/tx/inline/SplitRows.jsx src/ui/tx/inline/TxEditorRow.jsx
git commit -m "Inline splits: sub-rows with remainder chip via addSplitTransaction"
```

---

### Task 13: Entry-point rewiring — every desktop addTx path lands on the register

**Files:**
- Modify: `src/components/GlobalShortcuts.jsx` (Shift+N navigates first on desktop)
- Modify: every off-register `openers.addTx`/`openers.recordRule` caller found by grep

**Interfaces:**
- Consumes: `useIsPhone`, `useNavigate`.

- [ ] **Step 1: Find every opener call site**

Run: `grep -rn "openers.addTx\|openers.recordRule\|openers.editTx" src/ --include=*.jsx --include=*.js`

Expected sites: `GlobalShortcuts.jsx` (Shift+N), `Transactions.jsx` (toolbar, empty state, schedMore Record…, editTx paths — all already on the register, no change), `AddTxPill.jsx` (phone-only — no change), the Recurring screen (`recordRule`), possibly an account-detail screen. Treat the grep as the truth; handle each off-register desktop site.

- [ ] **Step 2: GlobalShortcuts**

```js
import { useIsPhone } from '../lib/useIsPhone.js';
// inside the component:
  const phone = useIsPhone();
// the addTx binding becomes:
    { spec: SPEC.addTx, when: () => !shortcutsOpen, run: () => {
        // Desktop addTx renders inline in the register, so get there first.
        if (!phone) nav('/transactions');
        openers.addTx(openDrawer);
      } },
```

- [ ] **Step 3: Off-register recordRule callers (e.g. the Recurring screen)**

At each desktop-reachable site, wrap the same way — `if (!phone) navigate('/transactions');` immediately before the opener call (add `useIsPhone`/`useNavigate` if missing). The session opens after navigation, and the register's `inlineTx` branch renders it prefilled. Manually verify each rewired site.

- [ ] **Step 4: Full suite + build + commit**

```bash
git add -A src/
git commit -m "Route every desktop addTx entry point to the register's inline editor"
```

---

### Task 14: Full verification pass

**Files:** none created — this is the gate.

- [ ] **Step 1: Suite + build**

Run: `pnpm test && pnpm build` — Expected: green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Live Playwright pass (delegate to a testing subagent, per the user's standing workflow)**

Have the subagent drive the dev server and verify, fixing what it finds:
1. Add: toolbar button → row under header, account preselected, Save records an expense, row blinks, undo label reads "Recorded expense".
2. Shift+N from the Budget page lands on /transactions with the row open.
3. Inference: inflow + category saves a refund; inflow + no category saves income; moving an amount to the other column on edit re-infers.
4. Transfer: To/From payee → category shows Payment/Transfer, save creates the linked transfer; editing it and typing a plain payee converts back.
5. Repeat: future date + Monthly → saved row appears in the SCHEDULED band; "Recurring rule created." toast.
6. Split: two lines, remainder fill, save → legs flash; unbalanced save refused.
7. Edit gesture: click selects, second click opens in place; Esc with edits → discard confirm; Cancel clean → closes silently.
8. Save and add another keeps account+date and refocuses.
9. Columns: outflow/inflow render on the correct sides; clicking OUTFLOW sorts, blanks sink.
10. Keyboard: register chords (C, ⇧D, arrows) dead while the editor is open, alive after.
11. Phone width: TxSheet still opens from the pill; no inline row renders.

- [ ] **Step 3: Commit any fixes, push the branch**

```bash
git push origin worktree-inline-tx-editor-spec
```

Do NOT open a PR (user rule). Report deviations (the split-edit note in Global Constraints, the Payment/Transfer footer omission in Task 9) to the user.
