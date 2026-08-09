// Reflect data-layer — tests the pure report helpers directly, mirroring the
// fixture/testing pattern in tests/calc.test.js.
import { describe, it, expect } from 'vitest';
import {
  spendingByCategory, spendingByGroup, spendingStats,
  monthlySeries, netWorthSeries, incomeExpenseSeries, ageOfMoney,
} from '../src/lib/reports.js';
import { daysInMonth, monthMetrics } from '../src/lib/calc.js';
import { addMonths, currentMonth } from '../src/lib/dates.js';

// monthsFor(store) walks back from the REAL current month, so months are
// anchored to it rather than a hardcoded literal (unlike calc.test.js, which
// never touches monthsFor and can hardcode '2026-08' freely).
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);
const PREV2 = addMonths(CUR, -2);

// Minimal store: Rent/Groceries (normal, grouped), Household advance
// (excluded, grouped), Legacy (expense, no groupId at all -> folds to Other).
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

describe('spendingByCategory', () => {
  it('totals correct, includes recoverable by default, Uncategorized captured, sorted desc, pct sums to ~1', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }),
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent' }),
      tx({ id: 't3', type: 'expense', amount: 45386, category: 'adv' }),
      tx({ id: 't4', type: 'refund', amount: 20000, category: 'adv' }),
      tx({ id: 't5', type: 'expense', amount: 5000, category: null }),
    ]);
    const rows = spendingByCategory(S, CUR);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.rent.amt).toBe(35000);
    expect(byId.groc.amt).toBe(8000);
    expect(byId.adv.amt).toBe(25386); // recoverable INCLUDED by default (net of its refund)
    expect(byId.uncategorized.amt).toBe(5000);
    expect(rows.map(r => r.id)).toEqual(['rent', 'adv', 'groc', 'uncategorized']); // 35000 > 25386 > 8000 > 5000
    const pctSum = rows.reduce((s, r) => s + r.pct, 0);
    expect(pctSum).toBeCloseTo(1, 5);
  });

  it('includeExcluded: false drops the recoverable category entirely', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv' }),
      tx({ id: 't2', type: 'expense', amount: 8000, category: 'groc' }),
    ]);
    const rows = spendingByCategory(S, CUR, { includeExcluded: false });
    expect(rows.map(r => r.id)).not.toContain('adv');
  });

  it('accountId scopes category rows to one account', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', accountId: 'a1' }),
      tx({ id: 't2', type: 'expense', amount: 3000, category: 'groc', accountId: 'a2' }),
    ], { accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }, { id: 'a2', nickname: 'Side', status: 'active' }] });
    const rows = spendingByCategory(S, CUR, { accountId: 'a1' });
    expect(rows.find(r => r.id === 'groc').amt).toBe(8000);
  });

  it('always includes an Uncategorized row, zero allowed', () => {
    const S = makeStore([tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent' })]);
    const rows = spendingByCategory(S, CUR);
    expect(rows.find(r => r.id === 'uncategorized')).toMatchObject({ amt: 0 });
  });

  // Fix round 1, finding 1: a null-category refund with no offsetting
  // null-category expense used to net negative, pushing pct outside [0,1].
  it('Uncategorized is floored at 0 when null-category refunds exceed null-category expenses (no negative amt/pct)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'refund', amount: 5000, category: null }),
      tx({ id: 't2', type: 'expense', amount: 20000, category: 'rent' }),
    ]);
    const rows = spendingByCategory(S, CUR);
    expect(rows.find(r => r.id === 'uncategorized').amt).toBe(0);
    rows.forEach(r => {
      expect(r.pct).toBeGreaterThanOrEqual(0);
      expect(r.pct).toBeLessThanOrEqual(1);
    });
  });
});

describe('spendingByGroup', () => {
  it('folds categories into their groups; unknown/missing group -> Other; Uncategorized preserved separately', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }), // living
      tx({ id: 't2', type: 'expense', amount: 45386, category: 'adv' }), // living (excluded, included by default)
      tx({ id: 't3', type: 'expense', amount: 35000, category: 'rent' }), // housing
      tx({ id: 't4', type: 'expense', amount: 700, category: 'legacy' }), // no groupId -> Other
      tx({ id: 't5', type: 'expense', amount: 5000, category: null }), // uncategorized
    ]);
    const rows = spendingByGroup(S, CUR);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.living.amt).toBe(8000 + 45386);
    expect(byId.housing.amt).toBe(35000);
    expect(byId.other).toMatchObject({ name: 'Other', amt: 700 });
    expect(byId.uncategorized).toMatchObject({ name: 'Uncategorized', amt: 5000 });
    const total = rows.reduce((s, r) => s + r.amt, 0);
    expect(total).toBe(8000 + 45386 + 35000 + 700 + 5000);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(1, 5);
  });
});

describe('spendingStats', () => {
  it('avgDaily === Math.round(total / daysInMonth)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }),
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent' }),
    ]);
    const stats = spendingStats(S, CUR);
    expect(stats.total).toBe(43000);
    expect(stats.avgDaily).toBe(Math.round(43000 / daysInMonth(CUR)));
  });

  it('mostFrequent picks the highest-count category, with its count', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 500, category: 'groc' }),
      tx({ id: 't2', type: 'expense', amount: 500, category: 'groc' }),
      tx({ id: 't3', type: 'expense', amount: 500, category: 'groc' }),
      tx({ id: 't4', type: 'expense', amount: 35000, category: 'rent' }),
      tx({ id: 't5', type: 'expense', amount: 35000, category: 'rent' }),
    ]);
    const stats = spendingStats(S, CUR);
    expect(stats.mostFrequent.count).toBe(3);
    expect(stats.mostFrequent.cat.id).toBe('groc');
  });

  it('ties on count are broken by the higher amount', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 100, category: 'groc' }),
      tx({ id: 't2', type: 'expense', amount: 200, category: 'rent' }),
    ]);
    expect(spendingStats(S, CUR).mostFrequent.cat.id).toBe('rent');
  });

  it('mostFrequent is null with no expense/refund activity', () => {
    expect(spendingStats(makeStore([]), CUR).mostFrequent).toBeNull();
  });

  // Fix round 2: the mostFrequent count loop ignored includeExcluded while
  // total/avgMonthly both honored it, so an excluded (recoverable) category
  // could win mostFrequent even in the "excluded" lens.
  it('mostFrequent honors includeExcluded — an excluded category with the highest count is skipped when includeExcluded is false', () => {
    const S = makeStore([
      tx({ id: 'a1', type: 'expense', amount: 100, category: 'adv' }),
      tx({ id: 'a2', type: 'expense', amount: 100, category: 'adv' }),
      tx({ id: 'a3', type: 'expense', amount: 100, category: 'adv' }),
      tx({ id: 'g1', type: 'expense', amount: 100, category: 'groc' }),
    ]);
    expect(spendingStats(S, CUR).mostFrequent.cat.id).toBe('adv'); // default lens: adv wins on count (3 vs 1)
    expect(spendingStats(S, CUR, { includeExcluded: false }).mostFrequent.cat.id).toBe('groc'); // excluded lens: adv skipped, groc is the highest remaining
  });

  it('largestOutflow is the single biggest expense (merchant + amt)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc', merchant: 'Metro' }),
      tx({ id: 't2', type: 'expense', amount: 35000, category: 'rent', merchant: 'Landlord' }),
    ]);
    expect(spendingStats(S, CUR).largestOutflow).toEqual({ merchant: 'Landlord', amt: 35000 });
  });

  it('largestOutflow is null with no expenses', () => {
    expect(spendingStats(makeStore([]), CUR).largestOutflow).toBeNull();
  });

  // Fix round 1, finding 3: largestOutflow used to ignore opts.accountId while
  // total/avgDaily/mostFrequent all honored it, so a per-account call could
  // return another account's biggest expense.
  it('largestOutflow is scoped to opts.accountId, like every other stat here', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 5000, category: 'groc', accountId: 'a1', merchant: 'A1 shop' }),
      tx({ id: 't2', type: 'expense', amount: 90000, category: 'rent', accountId: 'a2', merchant: 'A2 landlord' }),
    ], { accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }, { id: 'a2', nickname: 'Side', status: 'active' }] });
    expect(spendingStats(S, CUR, { accountId: 'a1' }).largestOutflow).toEqual({ merchant: 'A1 shop', amt: 5000 });
  });

  // Cheap coverage bump: avgMonthly across a real 2-month fixture.
  it('avgMonthly is the mean of spendingByCategory totals over monthsFor(store)', () => {
    const S = makeStore([
      tx({ id: 'e0', type: 'expense', amount: 10000, category: 'rent', date: PREV + '-06T12:00' }),
      tx({ id: 'e1', type: 'expense', amount: 30000, category: 'rent', date: CUR + '-06T12:00' }),
    ]);
    // monthsFor(store) = [PREV, CUR]; per-month totals = [10000, 30000]; mean = 20000.
    expect(spendingStats(S, CUR).avgMonthly).toBe(20000);
  });
});

describe('monthlySeries / incomeExpenseSeries / netWorthSeries', () => {
  const S = makeStore([
    tx({ id: 'i0', type: 'income', amount: 50000, category: 'salary', date: PREV2 + '-05T12:00' }),
    tx({ id: 'e0', type: 'expense', amount: 10000, category: 'rent', date: PREV2 + '-06T12:00' }),
    tx({ id: 'i1', type: 'income', amount: 60000, category: 'salary', date: PREV + '-05T12:00' }),
    tx({ id: 'e1', type: 'expense', amount: 20000, category: 'rent', date: PREV + '-06T12:00' }),
    tx({ id: 'i2', type: 'income', amount: 70000, category: 'salary', date: CUR + '-05T12:00' }),
    tx({ id: 'e2', type: 'expense', amount: 30000, category: 'rent', date: CUR + '-06T12:00' }),
  ], {
    snapshots: [{ accountId: 'a1', month: PREV2, amount: 100000, status: 'confirmed' }],
    cards: [{ id: 'c1', nickname: 'Card', type: 'credit', status: 'active', openingOutstanding: { [PREV2]: 5000 } }],
  });

  it('monthlySeries respects the window, returns months ascending, values match direct monthMetrics calls', () => {
    const series = monthlySeries(S, (s, m) => monthMetrics(s, m).income, { window: 2 });
    expect(series.length).toBeLessThanOrEqual(2);
    const months = series.map(r => r.month);
    expect(months).toEqual([...months].sort());
    series.forEach(r => expect(r.value).toBe(monthMetrics(S, r.month).income));
  });

  it('incomeExpenseSeries matches monthMetrics income/expense/net per month', () => {
    const series = incomeExpenseSeries(S, { window: 3 });
    expect(series).toHaveLength(3);
    expect(series.map(r => r.month)).toEqual([PREV2, PREV, CUR]);
    series.forEach(r => {
      const m = monthMetrics(S, r.month);
      expect(r).toMatchObject({ income: m.income, expense: m.expenses, net: m.net });
    });
  });

  it('netWorthSeries matches monthMetrics netWorth (assets minus card liability)', () => {
    const series = netWorthSeries(S, { window: 3 });
    series.forEach(r => {
      const m = monthMetrics(S, r.month);
      expect(r.value).toBe(m.netWorth);
      expect(m.netWorth).toBe(m.totalBank - m.cardLiability);
    });
  });

  // Fix round 2: netWorthSeries/incomeExpenseSeries used to call
  // monthMetrics(s, m, now) with no 4th arg, silently dropping opts.accountId
  // even when a caller passed one.
  it('opts.accountId threads into monthMetrics instead of being silently dropped', () => {
    const now = CUR + '-15T12:00'; // fixed, so this doesn't depend on the real wall clock
    const S2 = makeStore([
      tx({ id: 'i1', type: 'income', amount: 50000, category: 'salary', accountId: 'a1' }),
      tx({ id: 'i2', type: 'income', amount: 20000, category: 'salary', accountId: 'a2' }),
    ], {
      accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }, { id: 'a2', nickname: 'Side', status: 'active' }],
      snapshots: [
        { accountId: 'a1', month: CUR, amount: 100000, status: 'confirmed' },
        { accountId: 'a2', month: CUR, amount: 30000, status: 'confirmed' },
      ],
    });

    const nwAll = netWorthSeries(S2, { window: 1, now })[0].value;
    const nwA1 = netWorthSeries(S2, { window: 1, now, accountId: 'a1' })[0].value;
    expect(nwA1).toBe(monthMetrics(S2, CUR, now, 'a1').netWorth); // scoped call matches monthMetrics directly
    expect(nwA1).not.toBe(nwAll); // a1-only balance differs from the two-account total -> accountId is actually reaching monthMetrics

    // income/expense/net stay portfolio-wide regardless of accountId — that's
    // monthMetrics's own contract (its flow metrics are never account-scoped),
    // so equality here is correct, not evidence the fix did nothing.
    const ieAll = incomeExpenseSeries(S2, { window: 1, now })[0];
    const ieA1 = incomeExpenseSeries(S2, { window: 1, now, accountId: 'a1' })[0];
    expect(ieA1).toEqual(ieAll);
  });
});

// Fix round 1, finding 2: these three helpers used to destructure `opts.now`
// with no fallback, threading `undefined` into `monthMetrics`/`pick` — which
// reads as "count every transaction regardless of date," silently pulling
// future-dated rows into the current month's figures. They must default to
// nowIso(), matching spendingByCategory/spendingStats/ageOfMoney.
describe('series helpers default `now` to the real clock, not undefined', () => {
  it('monthlySeries threads a real ISO `now` into `pick` when opts.now is omitted', () => {
    const series = monthlySeries(makeStore([]), (s, m, now) => now, {});
    expect(series.length).toBeGreaterThan(0);
    series.forEach(r => expect(r.value).toMatch(/^\d{4}-\d{2}-\d{2}/));
  });

  // Rewritten to pass an explicit fixed `now` (both helpers accept opts.now)
  // instead of deriving "tomorrow" from the wall clock — the old version
  // self-disabled (a bare `return`, asserting nothing) whenever a test run
  // landed on the last calendar day of the month, and even on every other day
  // it was implicitly at the mercy of the real clock rather than asserting
  // anything deterministic.
  it('incomeExpenseSeries/netWorthSeries exclude a transaction dated after an explicit "now" within the same month', () => {
    const early = CUR + '-05T09:00';
    const late = CUR + '-20T09:00'; // every month has at least 28 days
    const S = makeStore([
      tx({ id: 'e1', type: 'income', amount: 99999, category: 'salary', date: late }),
    ]);
    expect(incomeExpenseSeries(S, { window: 1, now: early })[0].income).toBe(0); // now < tx date -> excluded
    expect(incomeExpenseSeries(S, { window: 1, now: late })[0].income).toBe(99999); // now >= tx date -> included

    const nwEarly = netWorthSeries(S, { window: 1, now: early })[0].value;
    const nwLate = netWorthSeries(S, { window: 1, now: late })[0].value;
    expect(nwLate).toBe(nwEarly + 99999); // the same income only lands in totalBank once `now` reaches its date
  });
});

describe('ageOfMoney', () => {
  it('one income dated D0, one expense N days later -> current === N', () => {
    const N = 5;
    const d0 = CUR + '-01T09:00';
    const d1 = CUR + '-' + String(1 + N).padStart(2, '0') + 'T09:00';
    const S = makeStore([
      tx({ id: 'i1', type: 'income', amount: 100000, category: 'salary', date: d0 }),
      tx({ id: 'e1', type: 'expense', amount: 20000, category: 'rent', date: d1 }),
    ], { snapshots: [] });
    const { current } = ageOfMoney(S, CUR);
    expect(current).toBe(N);
  });

  it('a snapshot opening balance seeds the queue as an inflow dated the month start', () => {
    const N = 3;
    const d1 = CUR + '-' + String(1 + N).padStart(2, '0') + 'T09:00';
    const S = makeStore([
      tx({ id: 'e1', type: 'expense', amount: 20000, category: 'rent', date: d1 }),
    ], { snapshots: [{ accountId: 'a1', month: CUR, amount: 100000, status: 'confirmed' }] });
    expect(ageOfMoney(S, CUR).current).toBe(N);
  });

  it('empty store has no outflows -> current and series values are 0', () => {
    const S = makeStore([], { snapshots: [] });
    const { current, series } = ageOfMoney(S, CUR);
    expect(current).toBe(0);
    expect(series.every(r => r.value === 0)).toBe(true);
  });

  // Cheap coverage bump: a non-trivial series, spanning two months, computed
  // independently in the test via the same calendar-day-distance rule.
  it('series carries a distinct, correctly-averaged value per month across a multi-month fixture', () => {
    const dayDiff = (a, b) => {
      const [ay, am, ad] = a.split('-').map(Number);
      const [by, bm, bd] = b.split('-').map(Number);
      return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
    };
    const S = makeStore([
      tx({ id: 'i0', type: 'income', amount: 100000, category: 'salary', date: PREV + '-01T09:00' }),
      tx({ id: 'e0', type: 'expense', amount: 20000, category: 'rent', date: PREV + '-05T09:00' }),
      tx({ id: 'e1', type: 'expense', amount: 20000, category: 'rent', date: CUR + '-03T09:00' }),
    ], { snapshots: [] });
    const ageE0 = dayDiff(PREV + '-01', PREV + '-05');
    const ageE1 = dayDiff(PREV + '-01', CUR + '-03');
    const { series } = ageOfMoney(S, CUR, { window: 2 });
    expect(series.map(r => r.month)).toEqual([PREV, CUR]);
    expect(series.find(r => r.month === PREV).value).toBe(ageE0);
    expect(series.find(r => r.month === CUR).value).toBe(Math.round((ageE0 + ageE1) / 2));
  });

  // Fix round 2, finding 1: a refund used to be pushed into the outflow
  // queue (aging like a spend). It must instead join the inflow queue, so a
  // later expense can draw on it.
  it('a refund adds to the inflow queue rather than aging like a spend — a later expense can be sourced from it', () => {
    const N = 6;
    const d0 = CUR + '-02T09:00';
    const d1 = CUR + '-' + String(2 + N).padStart(2, '0') + 'T09:00';
    const now = CUR + '-28T23:59'; // fixed, so hasOccurred() doesn't depend on the real wall-clock day
    const S = makeStore([
      tx({ id: 'r1', type: 'refund', amount: 20000, category: 'adv', date: d0 }),
      tx({ id: 'e1', type: 'expense', amount: 5000, category: 'rent', date: d1 }),
    ], { snapshots: [] });
    // If the refund were still treated as an outflow (the bug), it would add
    // its own age-0 record and drag the average down to ~N/2 instead of N.
    expect(ageOfMoney(S, CUR, { now }).current).toBe(N);
  });

  it('an outflow larger than the oldest inflow ages to the OLDEST inflow date; the next outflow ages to the next inflow once the first is exhausted', () => {
    const dayDiff = (a, b) => {
      const [ay, am, ad] = a.split('-').map(Number);
      const [by, bm, bd] = b.split('-').map(Number);
      return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
    };
    const S = makeStore([
      tx({ id: 'i0', type: 'income', amount: 10000, category: 'salary', date: PREV + '-01T09:00' }),
      tx({ id: 'i1', type: 'income', amount: 50000, category: 'salary', date: PREV + '-03T09:00' }),
      // 15000 > i0's 10000: drains i0 fully, then 5000 of i1.
      tx({ id: 'e0', type: 'expense', amount: 15000, category: 'rent', date: PREV + '-10T09:00' }),
      // Drawn entirely from i1's remaining 45000, now the oldest inflow left.
      tx({ id: 'e1', type: 'expense', amount: 20000, category: 'rent', date: CUR + '-05T09:00' }),
    ], { snapshots: [] });
    const age0 = dayDiff(PREV + '-01', PREV + '-10'); // ages to i0 (the oldest), not i1
    const age1 = dayDiff(PREV + '-03', CUR + '-05'); // ages to i1, the oldest remaining inflow
    const now = CUR + '-28T23:59'; // fixed, so hasOccurred() doesn't depend on the real wall-clock day
    const { series } = ageOfMoney(S, CUR, { window: 2, now });
    expect(series.find(r => r.month === PREV).value).toBe(age0); // only e0 has landed by PREV's cutoff
    expect(series.find(r => r.month === CUR).value).toBe(Math.round((age0 + age1) / 2)); // both records by CUR's cutoff
  });

  // Fix round 2, finding 2: an outflow the FIFO queue couldn't source at all
  // used to be recorded as a fake age 0, diluting the average.
  it('an outflow with no available inflow is excluded from the average, not counted as age 0', () => {
    const now = CUR + '-28T23:59'; // fixed, so hasOccurred() doesn't depend on the real wall-clock day
    const S = makeStore([
      tx({ id: 'i0', type: 'income', amount: 3000, category: 'salary', date: CUR + '-01T09:00' }),
      tx({ id: 'e0', type: 'expense', amount: 3000, category: 'rent', date: CUR + '-05T09:00' }), // exactly exhausts i0
      tx({ id: 'e1', type: 'expense', amount: 5000, category: 'rent', date: CUR + '-10T09:00' }), // no inflow left at all
    ], { snapshots: [] });
    const age0 = 4; // CUR-01 -> CUR-05
    // If e1 were counted as a fake age 0 (the bug), current would average to
    // round((4 + 0) / 2) = 2 instead of staying at e0's own age.
    expect(ageOfMoney(S, CUR, { now }).current).toBe(age0);
  });

  it('a transfer with fee>0 consumes the queue by the fee amount only', () => {
    const N = 7;
    const d0 = CUR + '-01T09:00';
    const d1 = CUR + '-' + String(1 + N).padStart(2, '0') + 'T09:00';
    const now = CUR + '-28T23:59'; // fixed, so hasOccurred() doesn't depend on the real wall-clock day
    const S = makeStore([
      tx({ id: 'i0', type: 'income', amount: 10000, category: 'salary', date: d0 }),
      tx({ id: 't0', type: 'transfer', amount: 4000, fee: 2000, accountId: 'a1', toAccountId: 'a1', date: d1 }),
    ], { snapshots: [] });
    // The fee (2000) is the outflow; the 4000 principal never touches the
    // ledger, so the age is driven purely by the fee's own draw on i0.
    expect(ageOfMoney(S, CUR, { now }).current).toBe(N);
  });

  it('sample cap: current reflects only the last `sample` (10) outflow ages, not the whole history', () => {
    // Fixed `now` (day 20) rather than the default real clock: all 12
    // outflows below are dated within the first 13 days of CUR, and without
    // an explicit `now` they'd be silently excluded by hasOccurred() on any
    // test run before the 13th of the real current month.
    const now = CUR + '-20T23:59';
    const outflows = [];
    for (let day = 2; day <= 13; day++) { // 12 outflows, well within the same month
      outflows.push(tx({ id: 'e' + day, type: 'expense', amount: 100, category: 'rent', date: CUR + '-' + String(day).padStart(2, '0') + 'T09:00' }));
    }
    const S = makeStore([
      tx({ id: 'i0', type: 'income', amount: 1000000, category: 'salary', date: CUR + '-01T09:00' }), // sources all 12 with room to spare
      ...outflows,
    ], { snapshots: [] });
    const ages = outflows.map((_, idx) => idx + 1); // day (2+idx) - day 1 = idx + 1
    const last10Avg = Math.round(ages.slice(-10).reduce((s, a) => s + a, 0) / 10);
    const allAvg = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
    expect(last10Avg).not.toBe(allAvg); // sanity: the two windows actually differ
    expect(ageOfMoney(S, CUR, { now }).current).toBe(last10Avg);
  });
});
