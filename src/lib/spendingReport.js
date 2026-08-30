// Reflect — Spending Breakdown report engine. Range-aware sibling of
// reports.js (which stays single-month for the other tabs). Same conventions:
// integer PKR, refunds net against expenses, pending/future excluded,
// 'uncategorized' is the reserved id for a null category.
import { daysInMonth, hasOccurred } from './calc.js';
import { inRange } from './dateRange.js';
import { addMonths, currentMonth, monthsBetween, nowIso } from './dates.js';

// Categorical chart palette, in a fixed slot order chosen for colorblind
// separation (validated with the data-viz validator against this app's light
// #FFFFFF and dark #161D1A surfaces: worst adjacent CVD ΔE 10.3, normal-vision
// 19.6, contrast ≥3:1 in both modes). Slot 1 is a punchier brand teal than the
// UI accent #0F766E, which sits just under the chroma floor and reads gray as a
// fill. Colors are assigned by size RANK, not per-category — see the .map()s
// below. Category-owned colors are deliberately ignored: many categories were
// saved with the accent teal, which collapsed the donut to one green.
export const PALETTE = ['#0A8C7E', '#B7791F', '#2563EB', '#C2413B', '#8B5CF6', '#0891B2', '#DB2777', '#65A30D'];

// Distinct-hue budget for the donut. The top MAX_SLICES categories get their own
// palette hue; the rest fold into one neutral-gray "Other" slice (see
// foldForDonut). Beyond PALETTE.length a row has no hue of its own (color: null)
// and renders in the theme's muted gray, same as Other.
export const MAX_SLICES = 7;

// The bucket a transaction belongs to, which is NOT always its raw category
// id. Two reserved keys stand in for the cases with no category record behind
// them: 'uncategorized' (category is null) and 'deleted' (an id no category
// record has any more). Store-aware because only the category list can tell
// the second case from a live id.
//
// Every consumer must key through this — the ids it invents are the ones the
// rows, the filter pill, the drill-down and both CSVs all address each other
// by, so a raw-id lookup anywhere would be a dead end for the deleted bucket.
// Returns a closure so the known-id Set is built once per call, not per
// transaction.
export function catKeyFn(store) {
  const known = new Set(store.categories.map(c => c.id));
  return t => (t.category == null ? 'uncategorized' : (known.has(t.category) ? t.category : 'deleted'));
}
const signed = t => (t.type === 'expense' ? t.amount : -t.amount);

export function reportTxns(store, opts = {}) {
  const { from = null, to = null, acctIds = null, catIds = null } = opts;
  const now = opts.now || nowIso();
  const catKey = catIds ? catKeyFn(store) : null; // only needed to answer the filter
  return store.transactions.filter(t =>
    (t.type === 'expense' || t.type === 'refund')
    && t.status !== 'pending' && hasOccurred(t, now)
    && inRange(t, from, to)
    && (!acctIds || acctIds.has(t.accountId))
    && (!catIds || catIds.has(catKey(t))));
}

export function breakdownByCategory(store, opts = {}) {
  const txns = reportTxns(store, opts);
  const catKey = catKeyFn(store);
  const sums = {}, counts = {};
  for (const t of txns) {
    const k = catKey(t); // dangling ids land under 'deleted' here, not on their own
    sums[k] = (sums[k] || 0) + signed(t);
    counts[k] = (counts[k] || 0) + 1;
  }
  const catIds = opts.catIds || null;
  // Base row set is active expense categories. Non-active (e.g. archived)
  // expense categories are ADDITIONALLY included when they have in-range
  // ACTIVITY, so a transaction whose category was later archived stays
  // visible everywhere downstream (donut/list/Total/CSVs/stats) instead of
  // only surviving in the transactions CSV. Keyed on activity rather than on
  // a nonzero net so that a category whose refunds exactly cancel its
  // expenses still gets its (zero) row — the filter pill lists it either way,
  // and the two must describe the same set. Categories with no in-range
  // transactions at all are left out to avoid clutter.
  const cats = store.categories.filter(c => c.type === 'expense'
    && (!catIds || catIds.has(c.id))
    && (c.status === 'active' || counts[c.id]));
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
  // A transaction can outlive the category record it points at. catKey has
  // already folded every such id into the one 'deleted' bucket; without a row
  // for it that spend would be invisible on the page and in the summary CSV
  // yet still listed in the transactions CSV, so the two files stop
  // reconciling. Unlike Uncategorized this row appears only when something is
  // actually in the bucket — a plan with no deleted categories should not
  // grow a permanent row advertising the concept.
  if (counts.deleted) {
    rows.push({
      id: 'deleted', name: 'Deleted category', icon: null, color: null, groupId: null,
      amt: Math.max(0, sums.deleted), txCount: counts.deleted,
    });
  }
  const total = rows.reduce((s, r) => s + r.amt, 0);
  // Color strictly by size rank from the fixed palette; a category's own saved
  // color is intentionally dropped (see PALETTE note). Rows past the palette get
  // no hue (null) and read as gray downstream, matching the donut's "Other".
  return rows
    .sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, pct: total ? r.amt / total : 0, color: i < PALETTE.length ? PALETTE[i] : null }));
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
    .map((g, i) => ({ ...g, pct: total ? g.amt / total : 0, color: i < PALETTE.length ? PALETTE[i] : null }));
}

// Collapse a sorted (desc) row set into a donut-ready slice list: the top `max`
// rows as-is, everything beyond folded into one neutral "Other" slice whose
// amt/pct are the summed tail (color: null → the donut paints it muted gray).
// Only folds when it collapses at least TWO rows, so "Other" is never just one
// category wearing a generic name — a set of `max + 1` is shown in full instead.
// Pure and list-agnostic: the page's category list still renders every row.
export function foldForDonut(rows, { max = MAX_SLICES } = {}) {
  if (rows.length <= max + 1) return rows;
  const head = rows.slice(0, max);
  const tail = rows.slice(max);
  const amt = tail.reduce((s, r) => s + r.amt, 0);
  const pct = tail.reduce((s, r) => s + (r.pct || 0), 0);
  return [...head, { id: '__other__', name: 'Other', icon: null, amt, pct, color: null, other: true }];
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
  // Through catKey, so a row's id always finds its transactions — including
  // the synthetic 'deleted', which no transaction carries literally.
  const catKey = catKeyFn(store);
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
