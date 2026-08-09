// Reflect — pure data-layer helpers for the reporting section. All money is
// integer PKR; dates are 'YYYY-MM' / 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm' strings.
// Every function is pure: (store, ...args) => value. Nothing here touches the
// DOM or React — see tests/reports.test.js for the fixture pattern.
import {
  categorySpending, daysInMonth, hasOccurred, inMonth, largestExpenses, monthLabel, monthMetrics,
} from './calc.js';
import { monthsFor, nowIso } from './dates.js';

// categorySpending (calc.js) has no accountId filter of its own — scope the
// store's transactions to one account before handing it off, rather than
// reinventing the category-aggregation loop here.
function scopeToAccount(store, accountId) {
  if (!accountId) return store;
  return { ...store, transactions: store.transactions.filter(t => t.accountId === accountId) };
}

// Expense/refund outflows with no category at all. categorySpending() itself
// is not a safe source for this: it keys a plain object by `t.category`, so a
// null/undefined category coerces to the *string* "null"/"undefined" and
// would otherwise leak through as a fake category row.
function uncategorizedAmt(store, month, now) {
  return store.transactions
    .filter(t => inMonth(t, month) && t.status !== 'pending' && hasOccurred(t, now)
      && t.category == null && (t.type === 'expense' || t.type === 'refund'))
    .reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0);
}

// [{ id, name, icon, color, amt, pct }] — Spending Breakdown. Includes
// recoverable/advance categories by default (the reference total does).
export function spendingByCategory(store, month, opts = {}) {
  const now = opts.now || nowIso();
  const includeExcluded = opts.includeExcluded !== false;
  const scoped = scopeToAccount(store, opts.accountId || null);
  const catRows = categorySpending(scoped, month, { includeExcluded }, now)
    .filter(r => r.cat) // drop the "null"/"undefined" pseudo-categories described above
    .map(r => ({ id: r.cat.id, name: r.cat.name, icon: r.cat.icon, color: r.cat.color, amt: r.amt }));
  const rows = [...catRows, { id: 'uncategorized', name: 'Uncategorized', icon: null, color: null, amt: uncategorizedAmt(scoped, month, now) }];
  const total = rows.reduce((s, r) => s + r.amt, 0);
  return rows
    .map(r => ({ ...r, pct: total ? r.amt / total : 0 }))
    .sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
}

// Same rows, folded by category group. Unknown/missing group -> 'Other';
// Uncategorized is never folded into a group.
export function spendingByGroup(store, month, opts = {}) {
  const rows = spendingByCategory(store, month, opts);
  const total = rows.reduce((s, r) => s + r.amt, 0);
  const groups = {};
  const put = (id, name, amt) => {
    groups[id] = groups[id] || { id, name, amt: 0 };
    groups[id].amt += amt;
  };
  rows.forEach(r => {
    if (r.id === 'uncategorized') { put('uncategorized', 'Uncategorized', r.amt); return; }
    const cat = store.categories.find(c => c.id === r.id);
    const group = cat && cat.groupId && store.categoryGroups.find(g => g.id === cat.groupId);
    put(group ? group.id : 'other', group ? group.name : 'Other', r.amt);
  });
  return Object.values(groups)
    .map(g => ({ ...g, pct: total ? g.amt / total : 0 }))
    .sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name));
}

// { total, avgMonthly, avgDaily, mostFrequent: { cat, count } | null, largestOutflow: { merchant, amt } | null }
export function spendingStats(store, month, opts = {}) {
  const now = opts.now || nowIso();
  const includeExcluded = opts.includeExcluded !== false;
  const accountId = opts.accountId || null;
  const byCatOpts = { includeExcluded, accountId, now };

  const total = spendingByCategory(store, month, byCatOpts).reduce((s, r) => s + r.amt, 0);
  const avgDaily = Math.round(total / daysInMonth(month));

  const monthTotals = monthsFor(store).map(m => spendingByCategory(store, m, byCatOpts).reduce((s, r) => s + r.amt, 0));
  const avgMonthly = monthTotals.length ? Math.round(monthTotals.reduce((s, t) => s + t, 0) / monthTotals.length) : 0;

  const mtx = store.transactions.filter(t => inMonth(t, month) && (t.type === 'expense' || t.type === 'refund')
    && t.status !== 'pending' && hasOccurred(t, now) && t.category != null && (!accountId || t.accountId === accountId));
  const counts = {};
  mtx.forEach(t => {
    const e = counts[t.category] || (counts[t.category] = { count: 0, amt: 0 });
    e.count++; e.amt += t.amount;
  });
  let mostFrequent = null;
  Object.entries(counts).forEach(([id, v]) => {
    const cat = store.categories.find(c => c.id === id);
    if (!cat) return;
    const better = !mostFrequent || v.count > mostFrequent.count
      || (v.count === mostFrequent.count && (v.amt > mostFrequent.amt
        || (v.amt === mostFrequent.amt && cat.name.localeCompare(mostFrequent.cat.name) < 0)));
    if (better) mostFrequent = { cat, count: v.count, amt: v.amt };
  });

  const largest = largestExpenses(store, month, 1, now);
  const largestOutflow = largest.length ? { merchant: largest[0].merchant, amt: largest[0].amount } : null;

  return {
    total, avgMonthly, avgDaily,
    mostFrequent: mostFrequent ? { cat: mostFrequent.cat, count: mostFrequent.count } : null,
    largestOutflow,
  };
}

// [{ month, label, value }] over the last opts.window months of monthsFor(store).
export function monthlySeries(store, pick, opts = {}) {
  const { window = 12, now } = opts;
  return monthsFor(store).slice(-window).map(month => ({ month, label: monthLabel(month), value: pick(store, month, now) }));
}

export function netWorthSeries(store, opts = {}) {
  return monthlySeries(store, (s, m, now) => monthMetrics(s, m, now).netWorth, opts);
}

// [{ month, label, income, expense, net }]
export function incomeExpenseSeries(store, opts = {}) {
  const { window = 12, now } = opts;
  return monthsFor(store).slice(-window).map(month => {
    const m = monthMetrics(store, month, now);
    return { month, label: monthLabel(month), income: m.income, expense: m.expenses, net: m.net };
  });
}

// Calendar-day distance between two date/date-time strings, ignoring time of day.
function daysBetween(a, b) {
  const [ay, am, ad] = a.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = b.slice(0, 10).split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

// FIFO "age of money" ledger: every outflow paired with the age (in days) of
// the oldest inflow money it drew on, oldest-inflow-first. Built once over the
// whole store; `ageOfMoney` below just windows/averages it per month.
function buildAgeRecords(store, now) {
  const inflows = [];
  store.transactions.forEach(t => {
    if (t.type === 'income' && t.status !== 'pending' && hasOccurred(t, now)) {
      inflows.push({ date: t.date, remaining: t.amount });
    }
  });
  store.accounts.forEach(acc => {
    const opening = store.snapshots
      .filter(s => s.accountId === acc.id && s.status === 'confirmed')
      .sort((a, b) => a.month.localeCompare(b.month))[0];
    if (opening && opening.amount > 0) inflows.push({ date: opening.month + '-01', remaining: opening.amount });
  });
  inflows.sort((a, b) => a.date.localeCompare(b.date));

  const outflows = [];
  store.transactions.forEach(t => {
    if (t.status === 'pending' || !hasOccurred(t, now)) return;
    if (t.type === 'expense' || t.type === 'refund') outflows.push({ date: t.date, amount: t.amount });
    else if (t.type === 'transfer' && t.fee > 0) outflows.push({ date: t.date, amount: t.fee });
  });
  outflows.sort((a, b) => a.date.localeCompare(b.date));

  const records = [];
  let head = 0;
  outflows.forEach(out => {
    let need = out.amount;
    let oldestDate = null;
    while (need > 0 && head < inflows.length) {
      const inflow = inflows[head];
      if (inflow.remaining <= 0) { head++; continue; }
      if (oldestDate === null) oldestDate = inflow.date;
      const take = Math.min(inflow.remaining, need);
      inflow.remaining -= take;
      need -= take;
      if (inflow.remaining <= 0) head++;
    }
    records.push({ date: out.date, age: oldestDate === null ? 0 : daysBetween(oldestDate, out.date) });
  });
  return records;
}

function aomAsOf(records, month, sample) {
  const cutoff = month + '-' + String(daysInMonth(month)).padStart(2, '0');
  const upto = records.filter(r => r.date.slice(0, 10) <= cutoff);
  if (!upto.length) return 0;
  const recent = upto.slice(-sample);
  return Math.round(recent.reduce((s, r) => s + r.age, 0) / recent.length);
}

// { current, series: [{ month, label, value }] }
export function ageOfMoney(store, month, opts = {}) {
  const now = opts.now || nowIso();
  const sample = opts.sample || 10;
  const window = opts.window || 12;
  const records = buildAgeRecords(store, now);
  return {
    current: aomAsOf(records, month, sample),
    series: monthsFor(store).slice(-window).map(m => ({ month: m, label: monthLabel(m), value: aomAsOf(records, m, sample) })),
  };
}
