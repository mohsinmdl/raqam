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
  // Base row set is active expense categories. Non-active (e.g. archived)
  // expense categories are ADDITIONALLY included when they have nonzero
  // in-range spend, so a transaction whose category was later archived
  // stays visible everywhere downstream (donut/list/Total/CSVs/stats)
  // instead of only surviving in the transactions CSV. Zero-activity
  // archived categories are left out to avoid clutter.
  const cats = store.categories.filter(c => c.type === 'expense'
    && (!catIds || catIds.has(c.id))
    && (c.status === 'active' || sums[c.id]));
  // Floored at 0 on purpose, and only here: this is what the PAGE reports —
  // spending — and a category whose in-range refunds outweigh its expenses has
  // no spending to draw, no share of the total, and no meaningful percent. The
  // summary CSV deliberately does NOT floor (see spendingExport.js): it is a
  // net accounting matrix, so a net-refund month shows there as a positive
  // cell. The split is intentional; the two documents answer different
  // questions.
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
  // A transaction can outlive the category record it points at. Its spend
  // would otherwise land in a bucket that gets no row — invisible on the page
  // and in the summary CSV, yet still listed in the transactions CSV, so the
  // two files stop reconciling. Every such id folds into one synthetic row.
  // 'deleted' is a reserved id, like 'uncategorized'.
  const known = new Set(store.categories.map(c => c.id));
  let dAmt = 0, dCount = 0;
  for (const k of Object.keys(counts)) {
    if (k === 'uncategorized' || known.has(k)) continue;
    dAmt += sums[k];
    dCount += counts[k];
  }
  if (dCount) {
    rows.push({
      id: 'deleted', name: 'Deleted category', icon: null, color: null, groupId: null,
      amt: Math.max(0, dAmt), txCount: dCount,
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
    // Same treatment as Uncategorized: its own bucket, not folded into 'Other'
    // (which means "a real category with no group").
    if (r.id === 'deleted') { put('deleted', 'Deleted category', r); continue; }
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
    // Rounded to whole PKR, like reports.js and the CSV's Average column:
    // money is integer everywhere in this app, and money() would otherwise
    // render a mean as a long fraction.
    avgMonthly: months.length ? Math.round(total / months.length) : 0,
    avgDaily: days ? Math.round(total / days) : 0,
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
