// Sorting for the transactions table.
//
// Everything here sorts the *presenter rows* (txRowOf / ruleRowOf output), not
// the raw transactions. That is deliberate: the sort key is then the same value
// the cell renders, so the column always reads monotonically top to bottom —
// the one property a reader checks to believe a sort worked. It also means one
// comparator serves both reminders and transactions, and there is no second
// formatting path to drift out of sync.

// Case- and accent-insensitive, with natural number ordering so "Item 2" comes
// before "Item 10". One instance: constructing a Collator is expensive.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

// A row's Details/Category/Account cell can be genuinely empty, or the presenter
// may have already substituted an em dash for "nothing here". Both mean blank,
// and blanks sink to the bottom in BOTH directions — a blank is not "less than"
// anything, it is the absence of a value, so flipping direction must not float
// it to the top.
const isBlank = v => v == null || String(v).trim() === '' || String(v).trim() === '—';

// Status sorts by meaning, never alphabetically — alphabetical would give
// Cancelled, Cleared, Failed, Overdue, which tells the reader nothing. Lower
// rank = needs your attention sooner. Ascending puts work first.
export const STATUS_RANK = {
  overdue: 0, failed: 1, scheduled: 2, pending: 3, cleared: 4, cancelled: 5,
};
const statusRank = row => {
  const r = STATUS_RANK[String(row.stLabel || '').trim().toLowerCase()];
  // An unrecognised future status sorts after everything known, but before
  // blanks, rather than silently colliding with rank 0.
  return r == null ? 90 : r;
};

// key: what the column sorts on. defaultDir: the direction a first click gives.
export const SORT_COLUMNS = {
  date: { defaultDir: 'desc', type: 'text', get: r => r.sortAt },
  details: { defaultDir: 'asc', type: 'collate', get: r => r.merchant },
  category: { defaultDir: 'asc', type: 'collate', get: r => r.catName },
  account: { defaultDir: 'asc', type: 'collate', get: r => r.acctLabel },
  status: { defaultDir: 'asc', type: 'number', get: statusRank },
  // Amount has two modes, because they answer different questions.
  //
  // `size` ignores the sign — "what were my biggest transactions?" — and is
  // what the AMOUNT header sorts by, since that is the common one. Direction
  // is still legible while it sorts, because the amount is coloured.
  //
  // `signed` ranks by effect on the balance — "what moved my position most?" —
  // and lives in the Sort by dropdown. It has no header of its own, so it is
  // never reachable by clicking; nextSortState only ever produces `size`.
  size: { defaultDir: 'desc', type: 'number', get: r => (Number.isFinite(r.amtValue) ? Math.abs(r.amtValue) : null) },
  signed: { defaultDir: 'desc', type: 'number', get: r => r.amtValue },
};

export const isSortable = key => Object.prototype.hasOwnProperty.call(SORT_COLUMNS, key);

// The table's resting state, and what clearing a sort returns to.
export const DEFAULT_SORT = { key: 'date', dir: 'desc' };

// Header click cycle: inactive -> the column's default direction -> the
// opposite -> cleared (back to DEFAULT_SORT). For Date, "cleared" and "default"
// are the same thing, so it reads as a plain two-state toggle.
export function nextSortState(sort, key) {
  if (!isSortable(key)) return sort;
  const def = SORT_COLUMNS[key].defaultDir;
  if (!sort || sort.key !== key) return { key, dir: def };
  if (sort.dir === def) return { key, dir: def === 'asc' ? 'desc' : 'asc' };
  return { ...DEFAULT_SORT };
}

function compareValues(a, b, type) {
  if (type === 'number') {
    const na = Number.isFinite(a) ? a : null;
    const nb = Number.isFinite(b) ? b : null;
    if (na == null && nb == null) return 0;
    if (na == null) return 1;   // blanks bottom, sign-flipped back by the caller
    if (nb == null) return -1;
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = isBlank(a) ? null : String(a).trim();
  const sb = isBlank(b) ? null : String(b).trim();
  if (sa == null && sb == null) return 0;
  if (sa == null) return 1;
  if (sb == null) return -1;
  return type === 'collate' ? collator.compare(sa, sb) : (sa < sb ? -1 : sa > sb ? 1 : 0);
}

// Whether a comparison of two values was decided by one of them being blank.
// Those results must survive the descending flip so blanks stay at the bottom.
const blankDecided = (a, b, type) => type === 'number'
  ? (!Number.isFinite(a)) !== (!Number.isFinite(b))
  : isBlank(a) !== isBlank(b);

// Tie-breakers, applied in order after the selected column. Timestamps tie
// constantly in real data (minute precision, and the entry drawer defaults to
// 12:00 — nine rows share one timestamp in the owner's ledger), so without this
// chain the same data would render in different orders on different runs.
// `id` is unique per user, so the chain always terminates.
function compareFallbacks(x, y, primaryKey) {
  if (primaryKey !== 'date') {
    const d = compareValues(y.sortAt, x.sortAt, 'text'); // newest first
    if (d) return d;
  }
  if (primaryKey !== 'details') {
    const m = compareValues(x.merchant, y.merchant, 'collate');
    if (m) return m;
  }
  return compareValues(x.sortId, y.sortId, 'text');
}

export function compareRows(x, y, sort) {
  const s = sort && isSortable(sort.key) ? sort : DEFAULT_SORT;
  const col = SORT_COLUMNS[s.key];
  const a = col.get(x);
  const b = col.get(y);
  const primary = compareValues(a, b, col.type);
  if (primary !== 0) {
    // Descending flips real comparisons but never blank placement.
    if (s.dir === 'desc' && !blankDecided(a, b, col.type)) return -primary;
    return primary;
  }
  return compareFallbacks(x, y, s.key);
}

export function sortRows(rows, sort) {
  return [...rows].sort((x, y) => compareRows(x, y, sort));
}

// Scheduled rows read forward in time: "newest first" is meaningless for
// something that has not happened, so a Date sort there always means soonest
// first. Every other column sorts normally, so the two groups stay comparable.
export function scheduledSort(sort) {
  const s = sort && isSortable(sort.key) ? sort : DEFAULT_SORT;
  return s.key === 'date' ? { key: 'date', dir: 'asc' } : s;
}

export function sortLabel(sort) {
  const s = sort && isSortable(sort.key) ? sort : DEFAULT_SORT;
  return {
    date: { asc: 'Oldest first', desc: 'Newest first' },
    details: { asc: 'Details A–Z', desc: 'Details Z–A' },
    category: { asc: 'Category A–Z', desc: 'Category Z–A' },
    account: { asc: 'Account A–Z', desc: 'Account Z–A' },
    status: { asc: 'Needs action first', desc: 'Settled first' },
    size: { asc: 'Smallest first', desc: 'Largest first' },
    signed: { asc: 'Lowest first', desc: 'Highest first' },
  }[s.key][s.dir];
}
