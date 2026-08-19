# YNAB-Parity Spending Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Reflect → Spending Breakdown (`/reflect` index) to match YNAB: local filter bar (date-range presets, searchable category/account multi-selects), interactive ECharts donut (hover dimming + live center readout + leader labels + click), Categories⇄Groups with group drill-down breadcrumb, per-category transaction popover, and a two-file CSV export — with phone parity.

**Architecture:** New pure data layer (`spendingReport.js`, `spendingExport.js`) beside the untouched `reports.js`; new UI kit under `src/ui/reflect/` built on the existing Base UI primitives (`Popover`, `Menu`, `BottomSheet`) and house components (`Checkbox`, `SearchField`, `FocusTrap`); `SpendingBreakdown.jsx` rewritten to own its filter state locally; `Reflect.jsx` hides its shared native selects on the index route only.

**Tech Stack:** React 18 + Vite, `@base-ui/react` ^1.7 (popover/menu/dialog), **echarts** (new dep, tree-shaken via `echarts/core`), vitest (node env, no jsdom — lib tests only).

**Spec:** `docs/superpowers/specs/2026-08-19-ynab-spending-breakdown-design.md`

## Global Constraints

- pnpm only (`pnpm add`, `pnpm test`, `pnpm build`); repo is pnpm@10.33.4.
- All interactive primitives on Base UI per repo rule (`src/ui/primitives/`); never hand-roll a popover/menu/dialog where a primitive exists.
- Money is integer PKR; format only via `useMoney()`'s `money()`. Dates are `'YYYY-MM'`/`'YYYY-MM-DD'` strings; chronological order is lexicographic.
- Phone breakpoint: `useIsPhone()` from `src/lib/useIsPhone.js` (≤700px). Desktop → anchored popover; phone → bottom sheet.
- Reports exclude `status === 'pending'` and not-yet-occurred transactions, include recoverable categories, net refunds against expenses — same conventions as `src/lib/reports.js`.
- No jsdom: unit tests cover pure libs only; UI is verified live afterward.
- Do not modify `src/lib/reports.js`, the Reflect outlet context, or the other four tabs.
- Commit after each task with the message given in the task.

## Reference — existing APIs consumed throughout

- `dateRange.js`: `rangeFor(presetId, today) → {from,to}`, `inRange(t, from, to)`, `presetOf(from, to, today)`, `rangeLabel(from, to, today)`, `shiftRange(from, to, delta, years) → {from,to}|null`, `yearOpts(store, today)`.
- `dates.js`: `addMonths(ym,k)`, `monthsBetween(fromYm,toYm) → int (signed, to-from)`, `currentMonth()`, `todayStr()`, `nowIso()`.
- `calc.js`: `hasOccurred(t, now)`, `daysInMonth(ym)`, `MN` (month names), `monthLabel(ym)`.
- `csv.js`: `toCsv(headerRow, rows) → string`, `downloadCsv(filename, csv)`.
- `useMoney()` (`src/lib/format.js`): `{ money }` — `money(n) → 'PKR-formatted'`.
- `catIcon.js`: `iconStyle(icon, color, size) → style object` for the shape swatch.
- Store shapes: category `{id,name,type:'expense'|'income',color,icon,groupId?,status,sortOrder}`; group `{id,name,sortOrder}`; account `{id,instId,nickname,status}`; institution `{id,name,kind}` + `kindLabel(kind)` in calc.js; transaction `{id,type:'expense'|'refund'|…,amount,date,status:'cleared'|'pending',accountId,category:catId|null,merchant,notes}`.
- Primitives: `Popover/PopoverTrigger/PopoverPanel` (trigger-anchored, no external anchor), `Menu/MenuTrigger/MenuPanel/MenuItem`, `BottomSheet/BottomSheetPanel` (Base UI Dialog; controlled `open/onOpenChange` works), `Checkbox {checked,indeterminate,onChange,label,disabled}`, `SearchField {value,onChange,placeholder,label}`, `FocusTrap` (`src/ui/FocusTrap.jsx` — verify export name before use), `ExplainDialog` pattern for centered modals.
- Test fixture pattern: copy `tests/reports.test.js` — `makeStore(transactions)` + `tx(over)` helpers, months anchored on `currentMonth()`.

---

### Task 1: Report date-range presets in `dateRange.js`

**Files:**
- Modify: `src/lib/dateRange.js`
- Test: `tests/dateRange.test.js` (append; create from the reports-test pattern if missing)

**Interfaces:**
- Produces: `REPORT_PRESETS: [{id,label}]` in order `month,last3,last6,last12,ytd,lastYear,all` with labels `This Month, Last 3 Months, Last 6 Months, Last 12 Months, Year To Date, Last Year, All Dates`; `rangeFor` gains cases `'last6'|'last12'|'ytd'`; `presetOf(from,to,today,presets=RANGE_PRESETS)` gains an optional presets param (back-compatible).

- [ ] **Step 1: Write the failing tests** (append to `tests/dateRange.test.js`)

```js
import { REPORT_PRESETS, rangeFor, presetOf } from '../src/lib/dateRange.js';

describe('report presets', () => {
  const T = '2026-08-19';
  it('defines the YNAB menu order', () => {
    expect(REPORT_PRESETS.map(p => p.id)).toEqual(['month', 'last3', 'last6', 'last12', 'ytd', 'lastYear', 'all']);
    expect(REPORT_PRESETS.find(p => p.id === 'ytd').label).toBe('Year To Date');
  });
  it('last6/last12 include the current month', () => {
    expect(rangeFor('last6', T)).toEqual({ from: '2026-03', to: '2026-08' });
    expect(rangeFor('last12', T)).toEqual({ from: '2025-09', to: '2026-08' });
  });
  it('ytd runs Jan..current month, distinct from This Year', () => {
    expect(rangeFor('ytd', T)).toEqual({ from: '2026-01', to: '2026-08' });
    expect(rangeFor('year', T)).toEqual({ from: '2026-01', to: '2026-12' });
  });
  it('presetOf round-trips every report preset', () => {
    for (const p of REPORT_PRESETS) {
      const { from, to } = rangeFor(p.id, T);
      expect(presetOf(from, to, T, REPORT_PRESETS)).toBe(p.id);
    }
  });
  it('year-crossing: last6 in February', () => {
    expect(rangeFor('last6', '2026-02-10')).toEqual({ from: '2025-09', to: '2026-02' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/dateRange.test.js` → FAIL (`REPORT_PRESETS` not exported).
- [ ] **Step 3: Implement.** In `dateRange.js`: add below `RANGE_PRESETS`:

```js
// YNAB-order presets for the Reflect reports' date menu. Separate list because
// the Transactions filter keeps Today/Yesterday, which a monthly report can't use.
export const REPORT_PRESETS = [
  { id: 'month', label: 'This Month' },
  { id: 'last3', label: 'Last 3 Months' },
  { id: 'last6', label: 'Last 6 Months' },
  { id: 'last12', label: 'Last 12 Months' },
  { id: 'ytd', label: 'Year To Date' },
  { id: 'lastYear', label: 'Last Year' },
  { id: 'all', label: 'All Dates' },
];
```

In `rangeFor`'s switch, after `case 'last3'`:

```js
    case 'last6': return { from: addMonths(month, -5), to: month };
    case 'last12': return { from: addMonths(month, -11), to: month };
    case 'ytd': return { from: year + '-01', to: month };
```

Change `presetOf` signature to `presetOf(from, to, today, presets = RANGE_PRESETS)` and search `presets` instead of `RANGE_PRESETS`.

- [ ] **Step 4: Run** `pnpm test tests/dateRange.test.js` → PASS, and `pnpm test` → whole suite green (proves back-compat of `presetOf`).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "dateRange: YNAB report presets (last6/last12/ytd) + presets param on presetOf"`

---

### Task 2: Pure report engine `src/lib/spendingReport.js`

**Files:**
- Create: `src/lib/spendingReport.js`
- Test: `tests/spendingReport.test.js`

**Interfaces:**
- Consumes: `inRange` (Task 1's file), `hasOccurred`, `daysInMonth`, `addMonths`, `monthsBetween`, `currentMonth`, `nowIso`.
- Produces (all pure; `opts = { from, to, acctIds: Set|null, catIds: Set|null, now? }`, null Set = all; the id `'uncategorized'` stands for `t.category == null`):
  - `PALETTE: string[8]`
  - `reportTxns(store, opts) → t[]`
  - `breakdownByCategory(store, opts) → [{id,name,icon,color,amt,pct,groupId,txCount}]` — every active expense category + Uncategorized, zero rows kept, amt floored at 0, sorted amt desc then name; colors resolved (cat color or palette by index).
  - `breakdownByGroup(store, opts) → [{id,name,amt,pct,color,catIds:string[]}]` — palette colors by sorted index.
  - `rangeMonths(store, from, to, now?) → ['YYYY-MM',…]` — null bounds resolved from data/current month.
  - `breakdownStats(store, opts) → {total, avgMonthly, avgDaily, mostFrequent:{name,count}|null, largestOutflow:{merchant,amt}|null}`.
  - `categoryTxRows(store, catId|catIds[], opts) → [{id,account,date,payee,memo,amt}]` date desc; `amt` signed (expense negative, refund positive) for YNAB-style display.

- [ ] **Step 1: Write the failing tests.** Copy the `makeStore`/`tx` fixture from `tests/reports.test.js` (same categories/groups/accounts). Cover, with exact assertions:
  - `reportTxns`: month-range inclusion (`from:PREV,to:CUR` picks both months, drops older), pending + future-dated excluded, `catIds:new Set(['uncategorized'])` matches only null-category txns, `acctIds` filtering.
  - `breakdownByCategory`: multi-month sum, refund netting, floor at 0, zero rows present with `amt:0`, `pct` re-based on the filtered total, `txCount` counts, colors: category color kept, `PALETTE[i]` fallback for colorless rows, groupId passthrough.
  - `breakdownByGroup`: folds by group, Uncategorized own bucket, missing group → `Other`, `catIds` lists member category ids, colors assigned `PALETTE[index]` after sort.
  - `rangeMonths`: `('2026-06','2026-08') → ['2026-06','2026-07','2026-08']`; `from:null` resolves to earliest transaction month; `to:null` → current month; store with no transactions → `[currentMonth()]`.
  - `breakdownStats`: `avgMonthly = total/months.length`; `avgDaily = total / Σ daysInMonth(months)` (This-Month range in a 31-day month divides by 31); `mostFrequent` by transaction count incl. Uncategorized; `largestOutflow` is the single largest expense's `{merchant, amt}`; empty range → total 0, null mostFrequent/largestOutflow.
  - `categoryTxRows`: maps account nickname, `date` sliced to `YYYY-MM-DD`, `payee` = merchant, `memo` = notes, sign convention, date-desc order, group form (array of catIds incl. `'uncategorized'`).
- [ ] **Step 2: Run** `pnpm test tests/spendingReport.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/spendingReport.js`:

```js
// Reflect — Spending Breakdown report engine. Range-aware sibling of
// reports.js (which stays single-month for the other tabs). Same conventions:
// integer PKR, refunds net against expenses, pending/future excluded,
// 'uncategorized' is the reserved id for a null category.
import { daysInMonth, hasOccurred } from './calc.js';
import { inRange } from './dateRange.js';
import { addMonths, currentMonth, monthsBetween, nowIso } from './dates.js';

export const PALETTE = ['#0F766E', '#B7791F', '#2563EB', '#C2413B', '#8B5CF6', '#0891B2', '#DB2777', '#65A30D'];

const catKey = t => (t.category == null ? 'uncategorized' : t.category);
const signed = t => (t.type === 'expense' ? t.amount : -t.amount);

export function reportTxns(store, opts = {}) {
  const { from = null, to = null, acctIds = null, catIds = null } = opts;
  const now = opts.now || nowIso();
  return store.transactions.filter(t =>
    (t.type === 'expense' || t.type === 'refund')
    && t.status !== 'pending' && hasOccurred(t, now)
    && inRange(t, from, to)
    && (!acctIds || acctIds.has(t.accountId))
    && (!catIds || catIds.has(catKey(t))));
}

export function breakdownByCategory(store, opts = {}) {
  const txns = reportTxns(store, opts);
  const sums = {}, counts = {};
  for (const t of txns) {
    const k = catKey(t);
    sums[k] = (sums[k] || 0) + signed(t);
    counts[k] = (counts[k] || 0) + 1;
  }
  const catIds = opts.catIds || null;
  const cats = store.categories.filter(c => c.type === 'expense' && c.status === 'active'
    && (!catIds || catIds.has(c.id)));
  const rows = cats.map(c => ({
    id: c.id, name: c.name, icon: c.icon, color: c.color || null, groupId: c.groupId || null,
    amt: Math.max(0, sums[c.id] || 0), txCount: counts[c.id] || 0,
  }));
  if (!catIds || catIds.has('uncategorized')) {
    rows.push({
      id: 'uncategorized', name: 'Uncategorized', icon: null, color: null, groupId: null,
      amt: Math.max(0, sums.uncategorized || 0), txCount: counts.uncategorized || 0,
    });
  }
  const total = rows.reduce((s, r) => s + r.amt, 0);
  return rows
    .sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, pct: total ? r.amt / total : 0, color: r.color || PALETTE[i % PALETTE.length] }));
}

export function breakdownByGroup(store, opts = {}) {
  const rows = breakdownByCategory(store, opts);
  const total = rows.reduce((s, r) => s + r.amt, 0);
  const groups = {};
  const put = (id, name, r) => {
    groups[id] = groups[id] || { id, name, amt: 0, catIds: [] };
    groups[id].amt += r.amt;
    groups[id].catIds.push(r.id);
  };
  for (const r of rows) {
    if (r.id === 'uncategorized') { put('uncategorized', 'Uncategorized', r); continue; }
    const g = r.groupId && store.categoryGroups.find(x => x.id === r.groupId);
    put(g ? g.id : 'other', g ? g.name : 'Other', r);
  }
  return Object.values(groups)
    .sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name))
    .map((g, i) => ({ ...g, pct: total ? g.amt / total : 0, color: PALETTE[i % PALETTE.length] }));
}

export function rangeMonths(store, from, to, now) {
  const cur = (now || nowIso()).slice(0, 7);
  let lo = from && from.slice(0, 7);
  let hi = (to && to.slice(0, 7)) || cur;
  if (!lo) {
    const months = store.transactions.map(t => String(t.date || '').slice(0, 7)).filter(Boolean);
    lo = months.length ? months.reduce((a, b) => (a < b ? a : b)) : cur;
  }
  if (hi < lo) hi = lo;
  const n = monthsBetween(lo, hi) + 1;
  return Array.from({ length: n }, (_, i) => addMonths(lo, i));
}

export function breakdownStats(store, opts = {}) {
  const rows = breakdownByCategory(store, opts);
  const total = rows.reduce((s, r) => s + r.amt, 0);
  const months = rangeMonths(store, opts.from || null, opts.to || null, opts.now);
  const days = months.reduce((s, m) => s + daysInMonth(m), 0);
  const byCount = rows.filter(r => r.txCount > 0).sort((a, b) => b.txCount - a.txCount || b.amt - a.amt);
  const txns = reportTxns(store, opts).filter(t => t.type === 'expense');
  const largest = txns.reduce((best, t) => (!best || t.amount > best.amount ? t : best), null);
  return {
    total,
    avgMonthly: months.length ? total / months.length : 0,
    avgDaily: days ? total / days : 0,
    mostFrequent: byCount.length ? { name: byCount[0].name, count: byCount[0].txCount } : null,
    largestOutflow: largest ? { merchant: largest.merchant || '', amt: largest.amount } : null,
  };
}

export function categoryTxRows(store, catIdOrIds, opts = {}) {
  const wanted = new Set(Array.isArray(catIdOrIds) ? catIdOrIds : [catIdOrIds]);
  const name = id => {
    const a = store.accounts.find(x => x.id === id);
    return a ? a.nickname : id;
  };
  return reportTxns(store, opts)
    .filter(t => wanted.has(catKey(t)))
    .map(t => ({
      id: t.id, account: name(t.accountId), date: String(t.date).slice(0, 10),
      payee: t.merchant || '', memo: t.notes || '', amt: t.type === 'expense' ? -t.amount : t.amount,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run** `pnpm test tests/spendingReport.test.js` → PASS; fix implementation (not tests) until green.
- [ ] **Step 5: Commit** — `git commit -am "spendingReport: range-aware breakdown engine (categories, groups, stats, drill rows)"`

---

### Task 3: CSV builders `src/lib/spendingExport.js`

**Files:**
- Create: `src/lib/spendingExport.js`
- Test: `tests/spendingExport.test.js`

**Interfaces:**
- Consumes: `toCsv` (csv.js), `reportTxns`, `breakdownByCategory`, `rangeMonths` (Task 2), `MN` (calc.js), `todayStr` (dates.js).
- Produces: `buildSummaryCsv(store, opts) → {filename, csv}`, `buildTransactionsCsv(store, opts) → {filename, csv}`, `exportSpendingReport(store, opts)` (browser-only: downloads both via `downloadCsv`).

- [ ] **Step 1: Write the failing tests.** Same fixture. Assert exactly:
  - Summary header for a two-month range: `['Category Group','Category','Jul-26','Aug-26','Average','Total']` (month label = `MN[m-1].slice(0,3) + '-' + yy`).
  - Row order: Uncategorized first (blank group cell), then groups by `sortOrder` with their categories by `sortOrder`, ungrouped categories under `Other` last.
  - Cell math: outflows **negative** per month (`-amt`), `Total` = sum of month cells, `Average` = total ÷ month count; a category with no spend emits `0` cells.
  - Transactions CSV header: `['Account','Flag','Date','Payee','Category Group/Category','Category Group','Category','Memo','Outflow','Inflow','Cleared']`.
  - Transaction rows: date `dd/mm/yyyy`, `Category Group/Category` = `'Bills: Rent'` form (`'Uncategorized'` alone when no category, group blank), expense → Outflow=amount/Inflow=0, refund → Outflow=0/Inflow=amount, `Cleared` from status, newest first.
  - Filenames: `raqam-reflect-spending-breakdown-<todayStr()>.csv` / same + `-transactions`.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/spendingExport.js`:

```js
// Reflect — Spending Breakdown's two-file CSV export, mirroring YNAB's shapes:
// a per-month summary matrix and a register-style transaction detail.
import { MN } from './calc.js';
import { downloadCsv, toCsv } from './csv.js';
import { todayStr } from './dates.js';
import { breakdownByCategory, rangeMonths, reportTxns } from './spendingReport.js';

const monthCol = ym => MN[Number(ym.slice(5, 7)) - 1].slice(0, 3) + '-' + ym.slice(2, 4);
const ddmmyyyy = d => { const [y, m, day] = d.slice(0, 10).split('-'); return day + '/' + m + '/' + y; };
const base = () => 'raqam-reflect-spending-breakdown-' + todayStr();

export function buildSummaryCsv(store, opts = {}) {
  const months = rangeMonths(store, opts.from || null, opts.to || null, opts.now);
  // Zero rows stay: YNAB's summary lists every category in the plan.
  const rows = breakdownByCategory(store, opts);
  const groupName = r => {
    if (r.id === 'uncategorized') return '';
    const g = r.groupId && store.categoryGroups.find(x => x.id === r.groupId);
    return g ? g.name : 'Other';
  };
  // Per-month sums, netting refunds, keyed cat|month.
  const cell = {};
  for (const t of reportTxns(store, opts)) {
    const k = (t.category == null ? 'uncategorized' : t.category) + '|' + String(t.date).slice(0, 7);
    cell[k] = (cell[k] || 0) + (t.type === 'expense' ? t.amount : -t.amount);
  }
  const order = r => {
    if (r.id === 'uncategorized') return [-1, -1];
    const g = r.groupId && store.categoryGroups.find(x => x.id === r.groupId);
    const cat = store.categories.find(c => c.id === r.id);
    return [g ? (g.sortOrder ?? 0) : 1e9, cat ? (cat.sortOrder ?? 0) : 0];
  };
  const sorted = [...rows].sort((a, b) => {
    const [ga, ca] = order(a), [gb, cb] = order(b);
    return ga - gb || ca - cb || a.name.localeCompare(b.name);
  });
  const body = sorted.map(r => {
    const cells = months.map(m => -(cell[r.id + '|' + m] || 0));
    const total = cells.reduce((s, v) => s + v, 0);
    return [groupName(r), r.name, ...cells, total / months.length, total];
  });
  return {
    filename: base() + '.csv',
    csv: toCsv(['Category Group', 'Category', ...months.map(monthCol), 'Average', 'Total'], body),
  };
}

export function buildTransactionsCsv(store, opts = {}) {
  const catName = id => {
    if (id == null) return null;
    const c = store.categories.find(x => x.id === id);
    return c ? c.name : id;
  };
  const groupOf = id => {
    const c = store.categories.find(x => x.id === id);
    const g = c && c.groupId && store.categoryGroups.find(x => x.id === c.groupId);
    return g ? g.name : (c ? 'Other' : '');
  };
  const acct = id => { const a = store.accounts.find(x => x.id === id); return a ? a.nickname : id; };
  const body = reportTxns(store, opts)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)))
    .map(t => {
      const cn = catName(t.category), gn = t.category == null ? '' : groupOf(t.category);
      return [
        acct(t.accountId), '', ddmmyyyy(String(t.date)), t.merchant || '',
        cn == null ? 'Uncategorized' : (gn ? gn + ': ' + cn : cn), gn, cn == null ? '' : cn,
        t.notes || '',
        t.type === 'expense' ? t.amount : 0, t.type === 'refund' ? t.amount : 0,
        t.status === 'cleared' ? 'Cleared' : 'Uncleared',
      ];
    });
  return {
    filename: base() + '-transactions.csv',
    csv: toCsv(['Account', 'Flag', 'Date', 'Payee', 'Category Group/Category', 'Category Group', 'Category', 'Memo', 'Outflow', 'Inflow', 'Cleared'], body),
  };
}

export function exportSpendingReport(store, opts = {}) {
  const a = buildSummaryCsv(store, opts);
  const b = buildTransactionsCsv(store, opts);
  downloadCsv(a.filename, a.csv);
  downloadCsv(b.filename, b.csv);
}
```

- [ ] **Step 4: Run** `pnpm test tests/spendingExport.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "spendingExport: YNAB-shape summary + transactions CSV builders"`

---

### Task 4: ECharts donut `src/ui/reflect/SpendingDonut.jsx`

**Files:**
- Modify: `package.json` (via `pnpm add echarts`)
- Create: `src/ui/reflect/SpendingDonut.jsx`

**Interfaces:**
- Consumes: Task 2 row shape `{id,name,amt,pct,color}`.
- Produces: `<SpendingDonut slices total money size onSliceClick(id, virtualAnchor) />` — `slices` already amt>0-filtered by the caller; `virtualAnchor` is `{getBoundingClientRect(): DOMRect}` at the click point (feeds Base UI popover `anchor`). Hover handled internally: siblings blur + center readout swaps.

- [ ] **Step 1:** `pnpm add echarts` (runtime dep). Verify `pnpm test` still green.
- [ ] **Step 2: Implement** (no unit test — no jsdom; verified live in Task 10):

```jsx
// Reflect — YNAB-style interactive donut. ECharts (tree-shaken) draws the ring,
// leader labels and hover blur; the center readout is a React overlay because
// it must re-render with money()'s masking and the hovered slice.
import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

use([PieChart, CanvasRenderer]);

const cssVar = name => (typeof window === 'undefined' ? '#fff'
  : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff');
const pctLabel = p => (p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%');

export default function SpendingDonut({ slices = [], total = 0, money, size = 380, onSliceClick }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const [hover, setHover] = useState(null); // a slice object or null

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const surface = cssVar('--surface');
    const text = cssVar('--text');
    const muted = cssVar('--muted');
    chart.setOption({
      animationDuration: 300,
      series: [{
        type: 'pie', radius: ['58%', '84%'], center: ['50%', '50%'],
        itemStyle: { borderColor: surface, borderWidth: 3, borderRadius: 3 },
        label: {
          show: true, position: 'outside', color: text, lineHeight: 18,
          formatter: p => p.data.slice.name + '\n' + p.data.sub,
          rich: {},
        },
        labelLine: { length: 14, length2: 10, lineStyle: { color: muted } },
        emphasis: { scale: true, scaleSize: 4, focus: 'self' },
        blur: { itemStyle: { opacity: 0.25 }, label: { opacity: 0.3 } },
        data: slices.map(s => ({
          value: s.amt, name: s.name, slice: s,
          sub: money(s.amt) + ' (' + pctLabel(s.pct) + ')',
          itemStyle: { color: s.color },
        })),
      }],
    }, { notMerge: true });
    const over = e => { if (e.seriesIndex === 0) setHover(e.data.slice); };
    const out = () => setHover(null);
    const click = e => {
      if (e.seriesIndex !== 0 || !onSliceClick) return;
      const me = e.event && e.event.event; // the raw browser MouseEvent
      const x = me ? me.clientX : 0, y = me ? me.clientY : 0;
      onSliceClick(e.data.slice.id, {
        getBoundingClientRect: () => ({ x, y, top: y, left: x, bottom: y, right: x, width: 0, height: 0 }),
      });
    };
    chart.on('mouseover', over); chart.on('mouseout', out); chart.on('click', click);
    return () => { chart.off('mouseover', over); chart.off('mouseout', out); chart.off('click', click); };
  }, [slices, money, onSliceClick]);

  const center = hover
    ? { top: hover.name, mid: money(hover.amt), sub: pctLabel(hover.pct) }
    : { top: 'Total Spending', mid: money(total), sub: null };

  return (
    <div style={{ position: 'relative', width: '100%', height: size }}>
      <div ref={boxRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center',
      }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>{center.top}</div>
        <div className="tnum" style={{ fontSize: 26, fontWeight: 700 }}>{center.mid}</div>
        {center.sub && <div style={{ color: 'var(--muted)', fontSize: 14 }}>{center.sub}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** `pnpm build` → succeeds (echarts imports resolve, tree-shaken bundle builds).
- [ ] **Step 4: Commit** — `git commit -am "SpendingDonut: ECharts ring with hover blur, live center readout, leader labels, slice clicks"`

---

### Task 5: Searchable multi-select `src/ui/reflect/FilterMultiSelect.jsx`

**Files:**
- Create: `src/ui/reflect/FilterMultiSelect.jsx`

**Interfaces:**
- Consumes: `Popover/PopoverTrigger/PopoverPanel`, `BottomSheet/BottomSheetPanel`, `Checkbox`, `SearchField`, `useIsPhone`, `iconStyle`.
- Produces: `<FilterMultiSelect pillLabel searchPlaceholder sections selected onApply />` where `sections = [{id, name, items: [{id, name, icon?, color?}]}]` (a section with `id:null` renders its items at root level, e.g. Uncategorized), `selected = null | Set<itemId>` (null = all), `onApply(next: null | Set)` — called on Done only; Cancel/dismiss discards. Selecting everything normalizes back to `null`.

- [ ] **Step 1: Implement.** Requirements the code must satisfy (structure below):
  - Staged selection: on open, `staged = selected ? new Set(selected) : allIds`; checkbox toggles mutate `staged` only.
  - Section checkbox: checked when every child in `staged`, `indeterminate` when some; toggling adds/removes all children.
  - Search filters items by name (case-insensitive); a section stays visible while any child matches; Select All / Select None act on **all** items (not just filtered), matching YNAB.
  - Footer: `Select All · Select None` left, `Cancel · Done` right (Done = accent pill button).
  - Desktop: `Popover` primitive with the pill as `PopoverTrigger` (render pill as `<button class="hv-soft">` with label + caret ▾, accent text like the register toolbar buttons); panel width 340, maxHeight 420 scroll area.
  - Phone: same pill toggles a controlled `BottomSheet`; identical content inside `BottomSheetPanel`, search at top, footer sticky bottom.
  - Open state controlled locally: `const [open, setOpen] = useState(false)`; `Popover open={open} onOpenChange={o => { if (o) reset(); setOpen(o); }}` (reset = rebuild staged + clear query). Done → `onApply(staged.size === allIds.size ? null : new Set(staged))`, close.

Skeleton (implementer completes styling with existing tokens `var(--accent)`, `var(--border)`, `var(--muted)`, `hv-soft`):

```jsx
export default function FilterMultiSelect({ pillLabel, searchPlaceholder, sections, selected, onApply }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const allIds = useMemo(() => new Set(sections.flatMap(s => s.items.map(i => i.id))), [sections]);
  const [staged, setStaged] = useState(() => new Set(allIds));
  const reset = () => { setStaged(selected ? new Set(selected) : new Set(allIds)); setQ(''); };
  const toggle = (ids, on) => setStaged(prev => {
    const next = new Set(prev);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const done = () => { onApply(staged.size === allIds.size ? null : new Set(staged)); setOpen(false); };
  // body = SearchField + section/item checkbox rows (items indented 26px, icon
  // swatch via iconStyle when present) + footer; identical between shells.
  // Desktop shell: <Popover open onOpenChange><PopoverTrigger render pill/><PopoverPanel width={340}>{body}</PopoverPanel></Popover>
  // Phone shell: pill <button onClick={() => { reset(); setOpen(true); }}> + <BottomSheet open onOpenChange><BottomSheetPanel label={pillLabel}>{body}</BottomSheetPanel></BottomSheet>
}
```

- [ ] **Step 2:** `pnpm build` → compiles.
- [ ] **Step 3: Commit** — `git commit -am "FilterMultiSelect: searchable staged checkbox-tree filter (popover/sheet)"`

---

### Task 6: Date pill + filter bar `src/ui/reflect/ReportFilterBar.jsx`

**Files:**
- Create: `src/ui/reflect/ReportFilterBar.jsx` (includes the date-range menu; one file — they share layout)

**Interfaces:**
- Consumes: `Menu/MenuTrigger/MenuPanel/MenuItem`, `BottomSheet`, `useIsPhone`, `REPORT_PRESETS/rangeFor/presetOf/rangeLabel/shiftRange/yearOpts` (Task 1), `monthsBetween`, `FilterMultiSelect` (Task 5).
- Produces: `<ReportFilterBar store range onRangeChange catSel onCatSel acctSel onAcctSel />`. Internally builds the two `sections` adapters:
  - categories: `[{id:null, name:'', items:[{id:'uncategorized', name:'Uncategorized Transactions'}]}, ...store.categoryGroups (by sortOrder) as {id,name,items: member cats {id,name,icon,color} by sortOrder}, {id:'other', name:'Other', items: ungrouped active expense cats}]` (omit empty sections).
  - accounts: active accounts sectioned by institution kind: `kindLabel(inst.kind)` headers, items `{id, name: nickname}`.
- Pill labels: `catSel ? catSel.size + (catSel.size === 1 ? ' Category' : ' Categories') : 'All Categories'`; same for accounts.

- [ ] **Step 1: Implement.** Date pill group: `‹` button · calendar-glyph + `rangeLabel(range.from, range.to)` as the `MenuTrigger` (accent text) · `›` button, in one bordered rounded pill (match the screenshot's segmented look: internal 1px dividers). Arrows: `const width = range.from && range.to ? monthsBetween(range.from, range.to) + 1 : 1; const next = shiftRange(range.from, range.to, dir * width, yearOpts(store)); if (next) onRangeChange(next);` — disable the button when `shiftRange` returns null. Menu items: `REPORT_PRESETS.map(p => <MenuItem onClick={() => onRangeChange(rangeFor(p.id))}>{label + (presetOf(range.from, range.to, undefined, REPORT_PRESETS) === p.id ? ' ✓' : '')}</MenuItem>)` with the check right-aligned (flex spacer). Phone: the same preset list in a controlled `BottomSheet` opened by the label button. Then the two `FilterMultiSelect`s. Bar layout: `display:flex, gap:10, flexWrap:'wrap'`.
- [ ] **Step 2:** `pnpm build` → compiles.
- [ ] **Step 3: Commit** — `git commit -am "ReportFilterBar: date-range preset pill + category/account multi-select filters"`

---

### Task 7: Transaction drill-down popover `src/ui/reflect/TransactionPopover.jsx`

**Files:**
- Create: `src/ui/reflect/TransactionPopover.jsx`

**Interfaces:**
- Consumes: `@base-ui/react/popover` directly (external-anchor pattern copied from `src/components/CategoryPickerPopover.jsx:40-45`), `BottomSheet` for phone, `useIsPhone`, `iconStyle`.
- Produces: `<TransactionPopover open onClose anchor title rows money />` — `anchor`: element or virtual `{getBoundingClientRect}`; `title = {name, icon, color}`; `rows` from `categoryTxRows` (`{id,account,date,payee,memo,amt}`).

- [ ] **Step 1: Implement.** Desktop: `BasePopover.Root open onOpenChange={o => !o && onClose()}` → `Portal` → `Positioner anchor={anchor} side="top" align="center" sideOffset={10}` with `collisionAvoidance={{side:'flip', align:'shift'}}`, panel `width: 560, maxWidth: '92vw'` styled like `PopoverPanel` (surface/border/radius 12/shadow, zIndex 40). Content: header row (icon swatch via `iconStyle(title.icon, title.color, 16)` + `title.name`, fontWeight 700); table with uppercase muted 11px header `ACCOUNT · DATE · PAYEE · MEMO · AMOUNT` (grid `1fr 90px 1fr 1fr 110px`), body rows `maxHeight: 300, overflowY: 'auto'`, date shown `dd/mm/yyyy`, amount right-aligned `.tnum` via `money(r.amt)` (signed value renders the minus, matching YNAB's `-50,000.00`); footer right-aligned accent **Close** button. Phone: controlled `BottomSheet` + `BottomSheetPanel label={title.name}` with the same table (memo column dropped under 700px to fit: grid `1fr 84px 1fr 96px`).
- [ ] **Step 2:** `pnpm build` → compiles.
- [ ] **Step 3: Commit** — `git commit -am "TransactionPopover: anchored category transaction detail (popover/sheet)"`

---

### Task 8: Export modal `src/ui/reflect/ExportModal.jsx`

**Files:**
- Create: `src/ui/reflect/ExportModal.jsx`

**Interfaces:**
- Consumes: `FocusTrap` (verify import style from `src/ui/ConfirmDialog.jsx` and copy its overlay/a11y structure), `Checkbox`, `useIsPhone`, `BottomSheet`.
- Produces: `<ExportModal open onCancel onExport(dontShowAgain: boolean) />`. The **caller** owns the localStorage skip logic (Task 9); this component only reports the checkbox state.

- [ ] **Step 1: Implement.** Centered card modeled on ConfirmDialog/ExplainDialog: fixed overlay `var(--scrim)` zIndex 70, card `width 520, maxWidth '92vw'`, radius 14. Header: `Export Report` (700) + top-right ✕ (accent). Body copy: `Your data is just that — yours. The report will be exported as CSV files, easy to open in other applications.` Footer row: `Checkbox` labeled `Don't show again` (local state) on the left; `Cancel` (soft pill) and `Export` (accent pill) on the right. Escape + overlay click → `onCancel`. Phone: `BottomSheet` shell, same content.
- [ ] **Step 2:** `pnpm build` → compiles.
- [ ] **Step 3: Commit** — `git commit -am "ExportModal: YNAB-style export confirm with don't-show-again"`

---

### Task 9: Rewire the page — `SpendingBreakdown.jsx` + `Reflect.jsx`

**Files:**
- Modify: `src/screens/reflect/SpendingBreakdown.jsx` (rewrite)
- Modify: `src/screens/reflect/Reflect.jsx` (hide shared FilterRow on index route)
- Delete: nothing (`ui/charts/Donut.jsx` stays — Dashboard/other tabs may use it)

**Interfaces:**
- Consumes: everything from Tasks 1–8; `useOutletContext` (only `month` for the initial range seed), `useStore`, `useMoney`, `useIsPhone`.
- Produces: the finished route. Component-local state exactly:

```js
const [range, setRange] = useState(() => ({ from: month, to: month })); // month from outlet context
const [catSel, setCatSel] = useState(null);   // null | Set
const [acctSel, setAcctSel] = useState(null); // null | Set
const [lens, setLens] = useState('categories');
const [drillGroupId, setDrillGroupId] = useState(null);
const [focus, setFocus] = useState(null);     // { id, catIds, anchor } | null
const [exportOpen, setExportOpen] = useState(false);
```

- [ ] **Step 1: Rewire `Reflect.jsx`.** `import { useLocation } from 'react-router-dom'`; in the shell: `const { pathname } = useLocation(); const onBreakdown = pathname.replace(/\/+$/, '') === '/reflect';` and render `{!onBreakdown && <FilterRow …/>}`. Nothing else changes (outlet context intact for other tabs).
- [ ] **Step 2: Rewrite `SpendingBreakdown.jsx`.** Derivations:

```js
const opts = { from: range.from, to: range.to, acctIds: acctSel, catIds: catSel };
const catRows = useMemo(() => breakdownByCategory(S, opts), [S, range, catSel, acctSel]);
const groupRows = useMemo(() => breakdownByGroup(S, opts), [S, range, catSel, acctSel]);
const drill = drillGroupId ? groupRows.find(g => g.id === drillGroupId) : null;
// Visible rows: categories lens → catRows; groups lens → groupRows; drilled →
// catRows subset re-based so pct is within the group (YNAB: 82%/13%/5% inside Needs).
const rows = useMemo(() => {
  if (lens === 'categories') return catRows;
  if (!drill) return groupRows;
  const member = catRows.filter(r => drill.catIds.includes(r.id));
  const t = member.reduce((s, r) => s + r.amt, 0);
  return member.map(r => ({ ...r, pct: t ? r.amt / t : 0 }));
}, [lens, drill, catRows, groupRows]);
const total = rows.reduce((s, r) => s + r.amt, 0);
const slices = rows.filter(r => r.amt > 0);
const stats = useMemo(() => breakdownStats(S, drill
  ? { ...opts, catIds: new Set(drill.catIds.filter(id => !catSel || catSel.has(id))) }
  : opts), [S, range, catSel, acctSel, drill]);
```

  Guards (spec's error handling): one `useEffect` clearing `focus` whenever `range/catSel/acctSel/lens/drillGroupId` change; another resetting `drillGroupId` when it no longer resolves (`drillGroupId && !groupRows.some(g => g.id === drillGroupId)`).

  Layout: header row = title (or breadcrumb: accent button `All Groups` + `›` + group name when `drill`) with Export button top-right (reuse the existing export-button styling; `disabled={total === 0 && !slices.length}`). Filter bar: `<ReportFilterBar store={S} range={range} onRangeChange={r => setRange(clampRange(r.from, r.to))} …/>`. Grid: desktop `1.4fr 1fr` two cards, phone single column (`useIsPhone`). Left card: `Total Spending` + amount + `ViewToggle` (keep the existing Categories|Groups toggle component; switching lens also clears `drillGroupId`), `<SpendingDonut slices={slices} total={total} money={money} onSliceClick={openFocus} />`, stat grid (reuse existing 2×2 markup fed from `stats`, `mostFrequent.name` + `plural(count,'transaction')`, `largestOutflow.merchant` + amount). Right card: rows list — each row a `<button>` (icon swatch `iconStyle(r.icon, r.color, 12)`, name, amount `.tnum`, progress bar `width: pct*100%` colored `r.color`, pct label; keep the current `pctLabel` `<1%` rule); zero-amt rows render without a bar (YNAB's drilled `Fuel 0.00`); top-level lists hide zero rows (`rows.filter(r => r.amt > 0)`), drilled list shows all. Row click:

```js
const rowClick = (r, e) => {
  if (lens === 'groups' && !drill) { setDrillGroupId(r.id); return; }
  openFocus(r.id, e.currentTarget);
};
const openFocus = (id, anchor) => {
  const g = lens === 'groups' && !drill ? groupRows.find(x => x.id === id) : null;
  if (g) { setDrillGroupId(id); return; } // donut slice click in groups lens drills too
  setFocus({ id, anchor });
};
```

  Focused row gets the YNAB ring: `outline: '2px solid var(--accent)', background: 'var(--soft)'` when `focus?.id === r.id`. Popover: `<TransactionPopover open={!!focus} anchor={focus?.anchor} onClose={() => setFocus(null)} title={focusRow} rows={focus ? categoryTxRows(S, focus.id, opts) : []} money={money} />` (for drilled rows `opts` without catIds narrowing beyond the id itself; `focusRow` = the visible row object for name/icon/color). Export flow:

```js
const SKIP_KEY = 'raqam.reflect.exportConfirmSkip';
const exportNow = () => exportSpendingReport(S, opts);
const onExportClick = () => (localStorage.getItem(SKIP_KEY) ? exportNow() : setExportOpen(true));
const onExportConfirm = skip => { if (skip) localStorage.setItem(SKIP_KEY, '1'); setExportOpen(false); exportNow(); };
```

- [ ] **Step 3:** `pnpm test` → full suite green; `pnpm build` → clean.
- [ ] **Step 4:** Manual smoke via dev server (`pnpm dev`): page renders, no console errors on load.
- [ ] **Step 5: Commit** — `git commit -am "Spending Breakdown: YNAB-parity page (local filters, ECharts donut, drill-down, export)"`

---

### Task 10: Live browser verification (Playwright subagent)

**Files:** none created — fixes land wherever the bugs are.

- [ ] **Step 1:** Dispatch the Playwright testing subagent (standing memory: always delegate live browser testing; the subagent fixes what it finds). Script: start `pnpm dev`, auth per `verifying-ui-without-jsdom` memory if the auth gate blocks, then verify each spec behavior: (1) preset menu selection updates pill label + data; (2) ‹/› step by window width and disable on All Dates; (3) category filter: search, group checkbox indeterminate, Select None → Done → empty state, Cancel discards; (4) account filter narrows totals; (5) Categories⇄Groups toggle; group row click → breadcrumb `All Groups › <name>`, back link restores; (6) row click → popover with transaction table + Close; slice click same via virtual anchor; (7) hover slice → siblings dim, center swaps to name/amount/pct, mouseout restores Total; (8) Export → modal → two CSV downloads with expected filenames; Don't-show-again skips the modal on next click; (9) 390px viewport: filters open as bottom sheets, layout single-column, popover renders as sheet.
- [ ] **Step 2:** Re-run `pnpm test` + `pnpm build` after any fixes.
- [ ] **Step 3: Commit** — `git commit -am "Spending Breakdown: fixes from live browser verification"` (only if fixes were made).

---

## Self-Review (done at write time)

- **Spec coverage:** filters→T5/T6, donut behaviors→T4, drill-down→T9, popover→T7, export modal+CSVs→T3/T8/T9, stats→T2/T9, range math→T1/T2, mobile→T5–T9 phone shells, Reflect FilterRow hiding→T9, empty/guard states→T9. No gaps.
- **Type consistency:** row shape `{id,name,icon,color,amt,pct,groupId,txCount}` used in T2/T4/T9; `sections` shape identical in T5/T6; `opts` `{from,to,acctIds,catIds}` everywhere; `onSliceClick(id, virtualAnchor)` matches `openFocus(id, anchor)`.
- **Placeholder scan:** T5/T6/T7/T8 give structural code + exhaustive behavioral requirements rather than final JSX (styling tokens are the repo's existing ones); every data-layer function is full code. No TBDs.
