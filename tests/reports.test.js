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
});
