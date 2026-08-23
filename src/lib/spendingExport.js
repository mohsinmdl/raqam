// Reflect — Spending Breakdown's two-file CSV export, mirroring YNAB's shapes:
// a per-month summary matrix and a register-style transaction detail.
import { MN, fmtDate } from './calc.js';
import { downloadCsv, toCsv } from './csv.js';
import { todayStr } from './dates.js';
import { breakdownByCategory, catKeyFn, rangeMonths, reportTxns } from './spendingReport.js';

const monthCol = ym => MN[Number(ym.slice(5, 7)) - 1].slice(0, 3) + '-' + ym.slice(2, 4);
const ddmmyyyy = d => fmtDate(d); // the register detail's Date column follows the plan's date format
const base = () => 'raqam-reflect-spending-breakdown-' + todayStr();

// Category/group names carry user-typed emoji for on-screen identity (the
// in-name emoji doubles as the row's icon there); these exported sheets stay
// plain text. Merchant/memo/account nickname are untouched — out of scope.
const plainName = s => String(s)
  .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

export function buildSummaryCsv(store, opts = {}) {
  const months = rangeMonths(store, opts.from || null, opts.to || null, opts.now);
  // Zero rows stay: YNAB's summary lists every category, so an ACTIVE category
  // with no in-range spend still gets its all-zero row. Archived categories
  // appear only when they have in-range spend, and transactions pointing at a
  // deleted category fold into one 'Deleted category' row — both per
  // breakdownByCategory, which owns the row set.
  const rows = breakdownByCategory(store, opts);
  // The synthetic rows carry no group, same as Uncategorized.
  const groupName = r => {
    if (r.id === 'uncategorized' || r.id === 'deleted') return '';
    const g = r.groupId && store.categoryGroups.find(x => x.id === r.groupId);
    return g ? plainName(g.name) : 'Other';
  };
  // Per-month sums, netting refunds, keyed cat|month. NOT floored at 0, unlike
  // the page's per-category amounts (see spendingReport.js): this file is a net
  // accounting matrix, so a month whose refunds exceed its expenses is meant to
  // read as a positive, money-back cell. Keyed through catKeyFn so the cells
  // land under the very id breakdownByCategory gave the row — in particular
  // every dangling id collapses onto the one 'deleted' key.
  const catKey = catKeyFn(store);
  const cell = {};
  for (const t of reportTxns(store, opts)) {
    const k = catKey(t) + '|' + String(t.date).slice(0, 7);
    cell[k] = (cell[k] || 0) + (t.type === 'expense' ? t.amount : -t.amount);
  }
  const order = r => {
    if (r.id === 'uncategorized') return [-1, -1];
    // Right after Uncategorized, ahead of every real group (which use
    // non-negative sortOrder).
    if (r.id === 'deleted') return [-1, 0];

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
    // Rounded: money is whole-PKR everywhere else in the app, and an unrounded
    // mean writes cells like -4633.333333333333 into the CSV.
    return [groupName(r), plainName(r.name), ...cells, Math.round(total / months.length), total];
  });
  return {
    filename: base() + '.csv',
    csv: toCsv(['Category Group', 'Category', ...months.map(monthCol), 'Average', 'Total'], body),
  };
}

export function buildTransactionsCsv(store, opts = {}) {
  // An id with no category record is a deleted category. Naming it as such
  // beats leaking the raw id into a file a human opens, and matches the row
  // breakdownByCategory folds those transactions into.
  const catName = id => {
    if (id == null) return null;
    const c = store.categories.find(x => x.id === id);
    return c ? plainName(c.name) : 'Deleted category';
  };
  const groupOf = id => {
    const c = store.categories.find(x => x.id === id);
    const g = c && c.groupId && store.categoryGroups.find(x => x.id === c.groupId);
    return g ? plainName(g.name) : (c ? 'Other' : '');
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
