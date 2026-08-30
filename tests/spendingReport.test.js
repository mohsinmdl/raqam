// Reflect data-layer — tests the pure Spending Breakdown report engine
// (range-aware sibling of reports.js), mirroring the fixture/testing pattern
// in tests/reports.test.js.
import { describe, it, expect } from 'vitest';
import {
  PALETTE, MAX_SLICES, reportTxns, breakdownByCategory, breakdownByGroup,
  rangeMonths, breakdownStats, categoryTxRows, foldForDonut,
} from '../src/lib/spendingReport.js';
import { daysInMonth } from '../src/lib/calc.js';
import { addMonths, currentMonth } from '../src/lib/dates.js';

// Months are anchored to the REAL current month, never hardcoded literals.
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);
const PREV2 = addMonths(CUR, -2);

// Minimal store, same shape as tests/reports.test.js: Rent/Groceries (normal,
// grouped), Household advance (excluded, grouped), Legacy (expense, no
// groupId -> folds to Other).
function makeStore(transactions, overrides) {
  return {
    categories: [
      { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
      { id: 'groc', name: 'Groceries', icon: 'circle', color: '#0F766E', type: 'expense', status: 'active', groupId: 'living' },
      { id: 'adv', name: 'Household advance', icon: 'diamond', color: '#B7791F', type: 'expense', status: 'active', excludeFromBudget: true, groupId: 'living' },
      { id: 'legacy', name: 'Legacy cat', icon: 'triangle', color: '#2563EB', type: 'expense', status: 'active' },
      { id: 'salary', name: 'Salary', icon: 'square', color: '#15803D', type: 'income', status: 'active' },
    ],
    categoryGroups: [
      { id: 'housing', name: 'Housing', sortOrder: 1 },
      { id: 'living', name: 'Living', sortOrder: 2 },
    ],
    budgets: [],
    accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
    cards: [{ id: 'c1', nickname: 'Card', type: 'credit', status: 'active', openingOutstanding: { [CUR]: 0 } }],
    snapshots: [{ accountId: 'a1', month: CUR, amount: 100000, status: 'confirmed' }],
    recurring: [],
    audit: [],
    transactions,
    ...(overrides || {}),
  };
}
const tx = (over) => ({ id: '.', status: 'cleared', date: CUR + '-10T12:00', accountId: 'a1', ...over });

describe('reportTxns', () => {
  it('month-range inclusion: from:PREV,to:CUR picks both months, drops older', () => {
    const S = makeStore([
      tx({ id: 't0', type: 'expense', amount: 1000, category: 'rent', date: PREV2 + '-10T12:00' }),
      tx({ id: 't1', type: 'expense', amount: 2000, category: 'rent', date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 3000, category: 'rent', date: CUR + '-10T12:00' }),
    ]);
    const rows = reportTxns(S, { from: PREV, to: CUR });
    expect(rows.map(r => r.id).sort()).toEqual(['t1', 't2']);
  });

  it('excludes pending and future-dated transactions', () => {
    const now = CUR + '-15T12:00';
    const future = CUR + '-20T12:00';
    const S = makeStore([
      tx({ id: 'p1', type: 'expense', amount: 1000, category: 'rent', status: 'pending' }),
      tx({ id: 'f1', type: 'expense', amount: 1000, category: 'rent', date: future }),
      tx({ id: 'ok', type: 'expense', amount: 1000, category: 'rent', date: CUR + '-05T12:00' }),
    ]);
    const rows = reportTxns(S, { now });
    expect(rows.map(r => r.id)).toEqual(['ok']);
  });

  it('catIds: new Set(["uncategorized"]) matches only null-category txns', () => {
    const S = makeStore([
      tx({ id: 'u1', type: 'expense', amount: 1000, category: null }),
      tx({ id: 'c1', type: 'expense', amount: 1000, category: 'rent' }),
    ]);
    const rows = reportTxns(S, { catIds: new Set(['uncategorized']) });
    expect(rows.map(r => r.id)).toEqual(['u1']);
  });

  it('acctIds filters transactions to the given accounts', () => {
    const S = makeStore([
      tx({ id: 'a1tx', type: 'expense', amount: 1000, category: 'rent', accountId: 'a1' }),
      tx({ id: 'a2tx', type: 'expense', amount: 1000, category: 'rent', accountId: 'a2' }),
    ], { accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }, { id: 'a2', nickname: 'Side', status: 'active' }] });
    const rows = reportTxns(S, { acctIds: new Set(['a1']) });
    expect(rows.map(r => r.id)).toEqual(['a1tx']);
  });

  // An EMPTY Set is a real filter selecting nothing — distinct from `null`,
  // which means "no filter, everything passes". The screens rely on that
  // distinction (a filter pill that has deselected every item must show an
  // empty report, not the unfiltered one).
  // 'deleted' is a reserved key like 'uncategorized': the filter pill offers
  // it, so a Set containing it has to select the dangling-id transactions —
  // otherwise the row is visible on the page but impossible to filter to.
  it('catIds: new Set(["deleted"]) matches transactions whose category id has no record', () => {
    const S = makeStore([
      tx({ id: 'g1', type: 'expense', amount: 1000, category: 'ghost' }),
      tx({ id: 'g2', type: 'refund', amount: 200, category: 'phantom' }),
      tx({ id: 'c1', type: 'expense', amount: 1000, category: 'rent' }),
      tx({ id: 'u1', type: 'expense', amount: 1000, category: null }),
    ]);
    expect(reportTxns(S, { catIds: new Set(['deleted']) }).map(r => r.id).sort()).toEqual(['g1', 'g2']);
    // and a real-category Set still excludes them
    expect(reportTxns(S, { catIds: new Set(['rent']) }).map(r => r.id)).toEqual(['c1']);
  });

  it('an empty catIds/acctIds Set selects nothing (not everything)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent' }),
      tx({ id: 't2', type: 'expense', amount: 1000, category: null }),
    ]);
    expect(reportTxns(S, { catIds: new Set() })).toEqual([]);
    expect(reportTxns(S, { acctIds: new Set() })).toEqual([]);
  });
});

describe('breakdownByCategory', () => {
  it('sums across months, nets refunds, floors at 0, keeps zero rows, rebases pct, counts txns, resolves colors, passes groupId', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 5000, category: 'groc', date: CUR + '-10T12:00' }),
      tx({ id: 't3', type: 'expense', amount: 35000, category: 'rent', date: CUR + '-10T12:00' }),
      tx({ id: 't4', type: 'refund', amount: 20000, category: 'rent', date: CUR + '-12T12:00' }), // nets rent down
      tx({ id: 't5', type: 'refund', amount: 9000, category: 'legacy', date: CUR + '-12T12:00' }), // no offsetting expense -> floors at 0
    ]);
    const rows = breakdownByCategory(S, { from: PREV, to: CUR });
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.groc.amt).toBe(13000); // 8000 + 5000, multi-month sum
    expect(byId.groc.txCount).toBe(2);
    expect(byId.rent.amt).toBe(15000); // refund netting: 35000 - 20000
    expect(byId.legacy).toMatchObject({ amt: 0, txCount: 1 }); // floored at 0, still counted
    expect(byId.adv).toMatchObject({ amt: 0, txCount: 0 }); // zero row present, no activity
    expect(byId.uncategorized).toMatchObject({ amt: 0, txCount: 0 }); // zero row present

    const total = rows.reduce((s, r) => s + r.amt, 0);
    expect(total).toBe(13000 + 15000);
    rows.forEach(r => expect(r.pct).toBeCloseTo(r.amt / total, 10));

    // colors: assigned by size RANK from PALETTE — a category's own saved color
    // is deliberately ignored (rent/groc carry custom hex in the fixture; the
    // report does not use them). Order is rent, groc, adv, legacy, uncategorized.
    expect(byId.rent.color).toBe(PALETTE[0]);
    expect(byId.groc.color).toBe(PALETTE[1]);
    expect(byId.uncategorized.color).toBe(PALETTE[4]);

    // groupId passthrough
    expect(byId.rent.groupId).toBe('housing');
    expect(byId.groc.groupId).toBe('living');
    expect(byId.legacy.groupId).toBeNull();
    expect(byId.uncategorized.groupId).toBeNull();

    // sorted amt desc then name
    expect(rows.map(r => r.id)).toEqual(['rent', 'groc', 'adv', 'legacy', 'uncategorized']);
  });

  it('includes an archived expense category with in-range spend, but not a zero-activity archived category', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 4000, category: 'oldcat' }),
    ], {
      categories: [
        { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
        { id: 'groc', name: 'Groceries', icon: 'circle', color: '#0F766E', type: 'expense', status: 'active', groupId: 'living' },
        { id: 'adv', name: 'Household advance', icon: 'diamond', color: '#B7791F', type: 'expense', status: 'active', excludeFromBudget: true, groupId: 'living' },
        { id: 'legacy', name: 'Legacy cat', icon: 'triangle', color: '#2563EB', type: 'expense', status: 'active' },
        { id: 'salary', name: 'Salary', icon: 'square', color: '#15803D', type: 'income', status: 'active' },
        { id: 'oldcat', name: 'Old Category', icon: 'diamond', color: '#DB2777', type: 'expense', status: 'archived', groupId: 'housing' },
        { id: 'oldzero', name: 'Old Zero', icon: 'diamond', color: '#8B5CF6', type: 'expense', status: 'archived', groupId: 'housing' },
      ],
    });
    const rows = breakdownByCategory(S, {});
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.oldcat).toMatchObject({ amt: 4000, txCount: 1, groupId: 'housing' });
    expect(byId.oldzero).toBeUndefined(); // zero-activity archived category stays out (no clutter)

    const total = rows.reduce((s, r) => s + r.amt, 0);
    expect(total).toBe(4000); // total includes the archived-with-spend row
  });

  it('an explicit catIds set still excludes an archived category (with spend) not in the set', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 4000, category: 'oldcat' }),
    ], {
      categories: [
        { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
        { id: 'oldcat', name: 'Old Category', icon: 'diamond', color: '#DB2777', type: 'expense', status: 'archived', groupId: 'housing' },
      ],
    });
    const rows = breakdownByCategory(S, { catIds: new Set(['rent']) });
    expect(rows.map(r => r.id)).not.toContain('oldcat');
  });

  it('an empty catIds Set yields no rows at all — not even the Uncategorized one', () => {
    const S = makeStore([tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent' })]);
    expect(breakdownByCategory(S, { catIds: new Set() })).toEqual([]);
  });

  // Guards the exact change this PR made: no `% PALETTE.length` wrap, so ranks
  // past the palette get color null (rendered gray), NOT a recycled hue. The
  // other color tests use <8 rows, where the null branch is never taken.
  it('colors by rank with no wrap: rows past PALETTE.length get color null', () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({
      id: 'k' + i, name: 'K' + i, icon: null, type: 'expense', status: 'active', color: '#0F766E',
    }));
    const S = makeStore(
      cats.map((c, i) => tx({ id: 't' + i, type: 'expense', amount: (10 - i) * 1000, category: c.id })),
      { categories: cats },
    );
    const rows = breakdownByCategory(S, {});
    // Descending amounts → k0..k9 then the zero-amt Uncategorized row; all carry
    // a saved '#0F766E' that is deliberately ignored in favor of rank.
    rows.forEach((r, i) => expect(r.color).toBe(i < PALETTE.length ? PALETTE[i] : null));
    expect(rows[PALETTE.length - 1].color).toBe(PALETTE[PALETTE.length - 1]); // last hued
    expect(rows[PALETTE.length].color).toBeNull();                            // first tail → gray
    expect(rows.length).toBeGreaterThan(PALETTE.length);                      // null branch actually exercised
  });

  // A transaction can outlive the category record it points at. Without the
  // synthetic row its spend vanishes from the page and the summary CSV while
  // still appearing in the transactions CSV — the two files stop reconciling.
  it('folds transactions whose category id matches no category record into one "Deleted category" row', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 3000, category: 'ghost' }),
      tx({ id: 't2', type: 'expense', amount: 1000, category: 'phantom' }), // a second dangling id folds into the SAME row
      tx({ id: 't3', type: 'refund', amount: 500, category: 'ghost' }),     // nets like any other category
      tx({ id: 't4', type: 'expense', amount: 9000, category: 'rent' }),
    ]);
    const rows = breakdownByCategory(S, {});
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.deleted).toMatchObject({
      name: 'Deleted category', icon: null, groupId: null,
      amt: 3000 + 1000 - 500, txCount: 3,
    });
    expect(PALETTE).toContain(byId.deleted.color); // no category color to inherit
    expect(rows.reduce((s, r) => s + r.amt, 0)).toBe(9000 + 3500); // counted in the Total
  });

  // spentIds in the filter bar is transaction-based, so an archived category
  // whose refunds exactly cancel its expenses appears in the Categories pill.
  // Keying the row set off activity (not off a nonzero net) keeps the page
  // and the filter list describing the same set of categories.
  it('keeps an archived category whose in-range spend nets to exactly zero', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 4000, category: 'oldcat' }),
      tx({ id: 't2', type: 'refund', amount: 4000, category: 'oldcat' }),
    ], {
      categories: [
        { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
        { id: 'oldcat', name: 'Old Category', icon: 'diamond', color: '#DB2777', type: 'expense', status: 'archived', groupId: 'housing' },
        { id: 'oldzero', name: 'Old Zero', icon: 'diamond', color: '#8B5CF6', type: 'expense', status: 'archived', groupId: 'housing' },
      ],
    });
    const byId = Object.fromEntries(breakdownByCategory(S, {}).map(r => [r.id, r]));
    expect(byId.oldcat).toMatchObject({ amt: 0, txCount: 2 }); // present, floored, still counted
    expect(byId.oldzero).toBeUndefined();                      // genuinely no activity -> still out
  });

  it('no "Deleted category" row when every transaction resolves to a real category', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent' }),
      tx({ id: 't2', type: 'expense', amount: 1000, category: null }),
    ]);
    expect(breakdownByCategory(S, {}).map(r => r.id)).not.toContain('deleted');
  });
});

describe('breakdownByGroup', () => {
  it('folds by group, keeps Uncategorized separate, missing group -> Other, lists member catIds, colors by sorted index', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }), // living
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent' }), // housing
      tx({ id: 't3', type: 'expense', amount: 700, category: 'legacy' }), // no groupId -> Other
      tx({ id: 't4', type: 'expense', amount: 5000, category: null }), // uncategorized
    ]);
    const rows = breakdownByGroup(S, {});
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.living.amt).toBe(8000); // groc(8000) + adv(0, zero row)
    expect(byId.living.catIds).toEqual(expect.arrayContaining(['groc', 'adv']));
    expect(byId.housing).toMatchObject({ amt: 35000, catIds: ['rent'] });
    expect(byId.other).toMatchObject({ name: 'Other', amt: 700, catIds: ['legacy'] });
    expect(byId.uncategorized).toMatchObject({ name: 'Uncategorized', amt: 5000, catIds: ['uncategorized'] });
    expect(byId.deleted).toBeUndefined(); // nothing dangling in this fixture

    const total = rows.reduce((s, r) => s + r.amt, 0);
    expect(total).toBe(8000 + 35000 + 700 + 5000);

    // colors assigned by rank from PALETTE (no wrap); a row past the palette
    // gets no hue (null) and renders gray, like the donut's folded "Other".
    rows.forEach((r, i) => expect(r.color).toBe(i < PALETTE.length ? PALETTE[i] : null));
  });

  it('the Deleted category row gets its own bucket, like Uncategorized', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 35000, category: 'rent' }), // housing
      tx({ id: 't2', type: 'expense', amount: 2000, category: 'ghost' }), // no category record
    ]);
    const byId = Object.fromEntries(breakdownByGroup(S, {}).map(r => [r.id, r]));
    expect(byId.deleted).toMatchObject({ name: 'Deleted category', amt: 2000, catIds: ['deleted'] });
    expect(byId.other.catIds).not.toContain('deleted'); // NOT folded in with the ungrouped categories
  });
});

describe('foldForDonut', () => {
  // Rows as the report returns them: sorted desc, colored by rank (null past
  // the palette). n rows of decreasing amount.
  const mkRows = n => Array.from({ length: n }, (_, i) => ({
    id: 'c' + i, name: 'Cat ' + i, amt: (n - i) * 1000, pct: (n - i) / (n * (n + 1) / 2),
    color: i < PALETTE.length ? PALETTE[i] : null,
  }));

  it('passes rows through unchanged when there are max + 1 or fewer', () => {
    const rows = mkRows(MAX_SLICES + 1); // exactly max + 1: shown in full, no 1-item "Other"
    expect(foldForDonut(rows)).toBe(rows); // same reference — untouched
  });

  it('folds the tail into one "Other" slice when there are more than max + 1', () => {
    const rows = mkRows(MAX_SLICES + 3);
    const out = foldForDonut(rows);
    expect(out).toHaveLength(MAX_SLICES + 1);
    expect(out.slice(0, MAX_SLICES)).toEqual(rows.slice(0, MAX_SLICES)); // head untouched

    const other = out[out.length - 1];
    const tail = rows.slice(MAX_SLICES);
    expect(other).toMatchObject({ id: '__other__', name: 'Other', color: null, other: true });
    expect(other.amt).toBe(tail.reduce((s, r) => s + r.amt, 0));
    expect(other.pct).toBeCloseTo(tail.reduce((s, r) => s + r.pct, 0), 10);
  });

  it('folds a tail of exactly two — the minimal fold, at max + 2 rows', () => {
    // The first length that actually folds; guards the `<= max + 1` off-by-one.
    const rows = mkRows(MAX_SLICES + 2);
    const out = foldForDonut(rows);
    expect(out).toHaveLength(MAX_SLICES + 1);
    const other = out[out.length - 1];
    expect(other).toMatchObject({ id: '__other__', other: true });
    expect(other.amt).toBe(rows.slice(MAX_SLICES).reduce((s, r) => s + r.amt, 0));
  });

  it('honors a custom max', () => {
    const rows = mkRows(6);
    const out = foldForDonut(rows, { max: 3 });
    expect(out).toHaveLength(4);
    expect(out[3]).toMatchObject({ id: '__other__', other: true });
    expect(out[3].amt).toBe(rows.slice(3).reduce((s, r) => s + r.amt, 0));
  });
});

describe('rangeMonths', () => {
  it('returns the inclusive contiguous month list between explicit bounds', () => {
    const S = makeStore([]);
    const from = addMonths(CUR, -2), to = CUR;
    expect(rangeMonths(S, from, to)).toEqual([from, addMonths(CUR, -1), CUR]);
  });

  it('from:null resolves to the earliest transaction month', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent', date: PREV2 + '-05T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 1000, category: 'rent', date: CUR + '-05T12:00' }),
    ]);
    expect(rangeMonths(S, null, CUR)).toEqual([PREV2, PREV, CUR]);
  });

  it('to:null resolves to the current month', () => {
    const S = makeStore([]);
    expect(rangeMonths(S, PREV, null)).toEqual([PREV, CUR]);
  });

  it('a store with no transactions and no bounds resolves to just [currentMonth()]', () => {
    const S = makeStore([]);
    expect(rangeMonths(S, null, null)).toEqual([currentMonth()]);
  });
});

describe('breakdownStats', () => {
  // Rounded to whole PKR, like the CSV's Average column and reports.js: money
  // is integer everywhere in this app, and money() would render an unrounded
  // mean as a long fraction.
  it('avgMonthly = round(total/months.length); avgDaily = round(total/Σ daysInMonth(months))', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent', date: CUR + '-10T12:00' }),
    ]);
    const stats = breakdownStats(S, { from: PREV, to: CUR });
    const months = [PREV, CUR];
    const days = months.reduce((s, m) => s + daysInMonth(m), 0);
    expect(stats.total).toBe(43000);
    expect(stats.avgMonthly).toBe(Math.round(43000 / 2));
    expect(stats.avgDaily).toBe(Math.round(43000 / days));
  });

  it('a non-divisible total rounds rather than emitting a fraction', () => {
    const S = makeStore([tx({ id: 't1', type: 'expense', amount: 10000, category: 'rent', date: PREV2 + '-10T12:00' })]);
    const stats = breakdownStats(S, { from: PREV2, to: CUR }); // 3 months
    expect(stats.avgMonthly).toBe(3333); // 10000/3 = 3333.33…
    expect(Number.isInteger(stats.avgDaily)).toBe(true);
  });

  it('a single-month (This-Month) range divides avgDaily by that month\'s own day count', () => {
    const S = makeStore([tx({ id: 't1', type: 'expense', amount: 3100, category: 'rent' })]);
    const stats = breakdownStats(S, { from: CUR, to: CUR });
    expect(stats.avgDaily).toBe(Math.round(3100 / daysInMonth(CUR)));
  });

  it('mostFrequent is the highest-txCount row, including Uncategorized', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 100, category: null }),
      tx({ id: 't2', type: 'expense', amount: 100, category: null }),
      tx({ id: 't3', type: 'expense', amount: 100, category: null }),
      tx({ id: 't4', type: 'expense', amount: 100, category: 'rent' }),
    ]);
    expect(breakdownStats(S, {}).mostFrequent).toEqual({ name: 'Uncategorized', count: 3 });
  });

  it('largestOutflow is the single largest expense, as {merchant, amt}', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', merchant: 'Metro' }),
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent', merchant: 'Landlord' }),
      tx({ id: 't3', type: 'refund', amount: 90000, category: 'rent', merchant: 'BigRefund' }), // refund, not an expense
    ]);
    expect(breakdownStats(S, {}).largestOutflow).toEqual({ merchant: 'Landlord', amt: 35000 });
  });

  // Drilling the Deleted category group narrows stats to catIds
  // Set(['deleted']); if that Set matched nothing the page would show a real
  // amount in the list beside a zero total (and export empty CSVs).
  it('scopes to the Deleted category bucket when catIds is Set(["deleted"])', () => {
    const S = makeStore([
      tx({ id: 'g1', type: 'expense', amount: 2500, category: 'ghost', merchant: 'Gone' }),
      tx({ id: 'c1', type: 'expense', amount: 9000, category: 'rent', merchant: 'Landlord' }),
    ]);
    const stats = breakdownStats(S, { catIds: new Set(['deleted']) });
    expect(stats.total).toBe(2500);
    expect(stats.mostFrequent).toEqual({ name: 'Deleted category', count: 1 });
    expect(stats.largestOutflow).toEqual({ merchant: 'Gone', amt: 2500 });
  });

  it('an empty range yields total 0 and null mostFrequent/largestOutflow', () => {
    const S = makeStore([]);
    const stats = breakdownStats(S, {});
    expect(stats.total).toBe(0);
    expect(stats.mostFrequent).toBeNull();
    expect(stats.largestOutflow).toBeNull();
  });
});

describe('categoryTxRows', () => {
  it('maps account nickname, date to YYYY-MM-DD, payee/memo, signed amt, date-desc order', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', merchant: 'Metro', notes: 'weekly', date: CUR + '-05T09:30', accountId: 'a1' }),
      tx({ id: 't2', type: 'refund', amount: 2000, category: 'groc', merchant: 'Metro', notes: 'return', date: CUR + '-10T09:30', accountId: 'a1' }),
    ]);
    const rows = categoryTxRows(S, 'groc', {});
    expect(rows.map(r => r.id)).toEqual(['t2', 't1']); // date desc
    expect(rows[1]).toEqual({ id: 't1', account: 'Main', date: CUR + '-05', payee: 'Metro', memo: 'weekly', amt: -8000 });
    expect(rows[0]).toMatchObject({ amt: 2000 }); // refund is positive (YNAB-style sign convention)
  });

  // Clicking the Deleted category row opens the popover with this call. The
  // row's id is the synthetic 'deleted', which no transaction carries — so
  // the lookup has to resolve through the same key function the rows do.
  it('resolves the synthetic "deleted" id to the dangling-id transactions', () => {
    const S = makeStore([
      tx({ id: 'g1', type: 'expense', amount: 2500, category: 'ghost', merchant: 'Gone', date: CUR + '-05T09:30' }),
      tx({ id: 'g2', type: 'expense', amount: 700, category: 'phantom', merchant: 'Also gone', date: CUR + '-08T09:30' }),
      tx({ id: 'c1', type: 'expense', amount: 9000, category: 'rent', date: CUR + '-09T09:30' }),
    ]);
    const rows = categoryTxRows(S, 'deleted', {});
    expect(rows.map(r => r.id)).toEqual(['g2', 'g1']); // date desc, both dangling ids
    expect(rows[1]).toMatchObject({ payee: 'Gone', amt: -2500 });
  });

  it('accepts an array of catIds, e.g. a group form including "uncategorized"', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', date: CUR + '-05T09:30' }),
      tx({ id: 't2', type: 'expense', amount: 1000, category: null, date: CUR + '-08T09:30' }),
      tx({ id: 't3', type: 'expense', amount: 1000, category: 'rent', date: CUR + '-09T09:30' }), // excluded from the group
    ]);
    const rows = categoryTxRows(S, ['groc', 'uncategorized'], {});
    expect(rows.map(r => r.id).sort()).toEqual(['t1', 't2']);
  });
});
