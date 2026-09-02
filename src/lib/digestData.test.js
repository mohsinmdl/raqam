// U4 insights-digest — buildDigestPayload / hasEnoughData (pure). Asserts the
// payload is key-for-key the DigestRequest wire shape (fixture lockstep), that
// NO raw transaction array ever rides along, that every figure equals the
// selector output, and that an empty month degrades to a guarded minimal payload.
import { afterAll, describe, expect, it, vi } from 'vitest';
import digestReq from '../../modal/fixtures/digest.request.json';
import { buildDigestPayload, hasEnoughData } from './digestData.js';
import { spendingByCategory, spendingStats, incomeExpenseSeries } from './reports.js';
import { addMonths, currentMonth } from './dates.js';

// Pin the clock. The fixtures below are dated the 10th (and later) of the
// CURRENT month, and the future-date guard drops anything after "today" —
// so on the 1st–9th of every real month they all vanished, the suite went
// red, and with it the deploy it gates. A frozen mid-month instant makes the
// month-relative fixtures deterministic on any calendar day. Only Date is
// faked; timers stay real.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0));
afterAll(() => vi.useRealTimers());

// monthsFor(store) walks back from the REAL current month (same as reports.test),
// so anchor the fixture store to it rather than a hardcoded literal.
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);

function makeStore(transactions) {
  return {
    categories: [
      { id: 'groc', name: 'Groceries', icon: 'circle', color: '#0F766E', type: 'expense', status: 'active', groupId: 'living' },
      { id: 'fuel', name: 'Fuel', icon: 'square', color: '#B7791F', type: 'expense', status: 'active', groupId: 'living' },
      { id: 'salary', name: 'Salary', icon: 'square', color: '#15803D', type: 'income', status: 'active' },
    ],
    categoryGroups: [{ id: 'living', name: 'Living', sortOrder: 1 }],
    budgets: [],
    accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
    cards: [],
    snapshots: [{ accountId: 'a1', month: CUR, amount: 500000, status: 'confirmed' }],
    recurring: [],
    audit: [],
    transactions,
  };
}
const tx = over => ({ id: '.', status: 'cleared', date: CUR + '-10T12:00', accountId: 'a1', ...over });

// A populated current + previous month so top-N, prevAmt, and the trend all fire.
function populated() {
  return makeStore([
    // current month
    tx({ id: 'c1', type: 'expense', amount: 88000, category: 'groc', merchant: 'Alfatah' }),
    tx({ id: 'c2', type: 'expense', amount: 30000, category: 'fuel', merchant: 'Shell' }),
    tx({ id: 'c3', type: 'expense', amount: 12000, category: 'groc', merchant: 'Imtiaz' }),
    tx({ id: 'ci', type: 'income', amount: 400000, category: 'salary', date: CUR + '-01T09:00' }),
    // previous month (for prevAmt deltas + the income/expense trend)
    tx({ id: 'p1', type: 'expense', amount: 61000, category: 'groc', date: PREV + '-10T12:00' }),
    tx({ id: 'p2', type: 'expense', amount: 28000, category: 'fuel', date: PREV + '-10T12:00' }),
    tx({ id: 'pi', type: 'income', amount: 400000, category: 'salary', date: PREV + '-01T09:00' }),
  ]);
}

describe('buildDigestPayload — wire shape (fixture lockstep)', () => {
  it('has exactly the DigestRequest top-level keys', () => {
    const p = buildDigestPayload(populated(), CUR);
    expect(Object.keys(p).sort()).toEqual(Object.keys(digestReq).sort());
    expect(Object.keys(p.stats).sort()).toEqual(Object.keys(digestReq.stats).sort());
    expect(Object.keys(p.byCategory[0]).sort()).toEqual(Object.keys(digestReq.byCategory[0]).sort());
    expect(Object.keys(p.incomeExpense[0]).sort()).toEqual(Object.keys(digestReq.incomeExpense[0]).sort());
  });

  it('carries NO raw transactions array anywhere in the payload', () => {
    const p = buildDigestPayload(populated(), CUR);
    expect(p).not.toHaveProperty('transactions');
    expect(p.stats).not.toHaveProperty('transactions');
    // Deep guard: the serialized body never contains a `transactions` key.
    expect(JSON.stringify(p)).not.toMatch(/"transactions"/);
  });

  it('every figure equals the corresponding selector output', () => {
    const S = populated();
    const p = buildDigestPayload(S, CUR);
    const st = spendingStats(S, CUR);
    const cats = spendingByCategory(S, CUR).filter(r => r.id !== 'uncategorized' && r.amt > 0);
    const prev = Object.fromEntries(spendingByCategory(S, PREV).map(r => [r.id, r.amt]));

    // stats
    expect(p.stats.total).toBe(st.total);
    expect(p.stats.avgDaily).toBe(st.avgDaily);
    expect(p.stats.mostFrequent).toEqual({ name: st.mostFrequent.cat.name, count: st.mostFrequent.count });
    expect(p.stats.largestOutflow).toEqual({ merchant: st.largestOutflow.merchant, amt: st.largestOutflow.amt });

    // byCategory — amounts, integer pct, and prevAmt straight from the selectors
    expect(p.byCategory).toEqual(cats.slice(0, 5).map(r => ({
      name: r.name, amt: r.amt, pct: Math.round(r.pct * 100), prevAmt: prev[r.id] || 0,
    })));
    // top row is Groceries (88000 + 12000) with prevAmt 61000
    expect(p.byCategory[0].name).toBe('Groceries');
    expect(p.byCategory[0].amt).toBe(100000);
    expect(p.byCategory[0].prevAmt).toBe(61000);
    expect(p.stats.largestOutflow.merchant).toBe('Alfatah');

    // incomeExpense mirrors the selector's month/income/expense (net + label dropped)
    const ie = incomeExpenseSeries(S).map(m => ({ month: m.month, income: m.income, expense: m.expense }));
    expect(p.incomeExpense).toEqual(ie);
    const curRow = p.incomeExpense.find(m => m.month === CUR);
    expect(curRow.income).toBe(400000);
    expect(curRow.expense).toBe(130000); // 88000 + 30000 + 12000
  });

  it('all money figures are integers (PKR)', () => {
    const p = buildDigestPayload(populated(), CUR);
    const ints = [p.stats.total, p.stats.avgDaily, p.stats.largestOutflow.amt,
      ...p.byCategory.flatMap(c => [c.amt, c.pct, c.prevAmt]),
      ...p.incomeExpense.flatMap(m => [m.income, m.expense])];
    ints.forEach(n => expect(Number.isInteger(n)).toBe(true));
  });
});

describe('hasEnoughData / empty month', () => {
  it('false with no transactions, and the payload is minimal but valid', () => {
    const S = makeStore([]);
    expect(hasEnoughData(S, CUR)).toBe(false);
    const p = buildDigestPayload(S, CUR);
    // Still the valid wire shape — just empty aggregates, never a throw.
    expect(Object.keys(p).sort()).toEqual(Object.keys(digestReq).sort());
    expect(p.stats.total).toBe(0);
    expect(p.stats.mostFrequent).toBeNull();
    expect(p.stats.largestOutflow).toBeNull();
    expect(p.byCategory).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/"transactions"/);
  });

  it('true once the month has spending', () => {
    expect(hasEnoughData(populated(), CUR)).toBe(true);
  });
});
