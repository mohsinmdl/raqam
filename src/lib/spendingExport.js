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
