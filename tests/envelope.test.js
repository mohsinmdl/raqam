import { describe, it, expect } from 'vitest';
import { envelopeFor, assignedFor } from '../src/lib/envelope.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
  ],
  transactions: [], assignments: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const tx = (id, month, amount, cat, type = 'expense') =>
  ({ id, type, amount, category: cat, accountId: 'a1', status: 'cleared', date: month + '-05T12:00' });

describe('envelopeFor', () => {
  it('computes assigned + activity + available for the month', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 10000 }],
      transactions: [tx('t1', '2026-08', 4000, 'groc')],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ assigned: 10000, activity: -4000, available: 6000, carryIn: 0 });
  });

  it('carries positive available forward and resets overspend to zero', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-07', amount: 5000 },
        { id: 'x2', category: 'fun', month: '2026-07', amount: 1000 },
      ],
      transactions: [tx('t1', '2026-07', 2000, 'groc'), tx('t2', '2026-07', 3000, 'fun')],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ carryIn: 3000, available: 3000 });   // +3000 carried
    expect(e.rows.get('fun')).toMatchObject({ carryIn: 0, available: 0 });          // −2000 reset
  });

  it('RTA = income − assigned, minus LAST month’s overspend', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'fun', month: '2026-07', amount: 1000 }],
      transactions: [
        tx('i1', '2026-07', 100000, 'salary', 'income'),
        tx('t1', '2026-07', 3000, 'fun'),                       // overspends fun by 2000
        tx('i2', '2026-08', 50000, 'salary', 'income'),
      ],
    });
    expect(envelopeFor(S, '2026-07').rta).toBe(99000);           // 100000 − 1000
    expect(envelopeFor(S, '2026-08').rta).toBe(147000);          // 99000 + 50000 − 0 assigned − 2000 overspend
  });

  it('pending income and pending spending are excluded', () => {
    const S = store({
      transactions: [
        { ...tx('i1', '2026-08', 9999, 'salary', 'income'), status: 'pending' },
        { ...tx('t1', '2026-08', 500, 'groc'), status: 'pending' },
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.income).toBe(0);
    expect(e.rows.get('groc').activity).toBe(0);
  });

  it('group totals sum member rows; income categories are absent from rows', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-08', amount: 7000 },
        { id: 'x2', category: 'fun', month: '2026-08', amount: 3000 },
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.groupTotals.get('g1')).toMatchObject({ assigned: 10000, available: 10000 });
    expect(e.rows.has('salary')).toBe(false);
    expect(e.assignedTotal).toBe(10000);
  });
});

describe('assignedFor', () => {
  it('reads a single assignment, defaulting to 0', () => {
    const S = store({ assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 42 }] });
    expect(assignedFor(S, 'groc', '2026-08')).toBe(42);
    expect(assignedFor(S, 'fun', '2026-08')).toBe(0);
  });

  it('agrees with the fold: last (category, month) assignment wins', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-08', amount: 100 },
        { id: 'x2', category: 'groc', month: '2026-08', amount: 250 },
      ],
    });
    expect(assignedFor(S, 'groc', '2026-08')).toBe(250);
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc').assigned).toBe(250);
  });
});

describe('envelopeFor — robustness and RTA semantics', () => {
  it('charges an overspend exactly once, not again in a later month', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'fun', month: '2026-06', amount: 1000 }],
      transactions: [
        tx('i0', '2026-06', 100000, 'salary', 'income'),
        tx('t0', '2026-06', 3000, 'fun'),               // overspends fun by 2000 in June
        tx('i1', '2026-07', 50000, 'salary', 'income'),
        tx('i2', '2026-08', 20000, 'salary', 'income'),
      ],
    });
    const rtaJun = envelopeFor(S, '2026-06').rta;          // 100000 − 1000 = 99000
    const rtaJul = envelopeFor(S, '2026-07').rta;          // 99000 + 50000 − 2000 (June overspend) = 147000
    const rtaAug = envelopeFor(S, '2026-08').rta;          // 147000 + 20000 − 0 (no new overspend) = 167000
    expect(rtaJun).toBe(99000);
    expect(rtaJul).toBe(147000);
    expect(rtaAug).toBe(rtaJul + 20000); // the June overspend must not be re-subtracted here
  });

  it('a viewed month earlier than all data has empty rows and rta 0', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }],
      transactions: [tx('t1', '2026-08', 1000, 'groc')],
    });
    const e = envelopeFor(S, '2026-06');
    expect(e.rows.get('groc')).toMatchObject({ assigned: 0, activity: 0, available: 0, carryIn: 0 });
    expect(e.rta).toBe(0);
    expect(e.income).toBe(0);
    expect(e.openingTotal).toBe(0);
  });

  it('carries a positive balance forward across three consecutive months', () => {
    const S = store({
      assignments: [
        { id: 'x1', category: 'groc', month: '2026-06', amount: 5000 },
        { id: 'x2', category: 'groc', month: '2026-07', amount: 1000 },
      ],
      transactions: [
        tx('t1', '2026-06', 2000, 'groc'), // avail end of June: 3000
        tx('t2', '2026-07', 500, 'groc'),  // avail end of July: 3000 + 1000 − 500 = 3500
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ carryIn: 3500, assigned: 0, activity: 0, available: 3500 });
  });

  it('excludes future-dated transactions when `now` is supplied', () => {
    const S = store({
      transactions: [
        tx('i1', '2026-08', 10000, 'salary', 'income'),
        tx('t1', '2026-08-20', 4000, 'groc'), // dated after `now`
      ],
    });
    const e = envelopeFor(S, '2026-08', '2026-08-08T10:00');
    expect(e.income).toBe(10000);
    expect(e.rows.get('groc').activity).toBe(0);
  });

  it('groupTotals buckets groupId-less categories under "other" and includes negative available', () => {
    const S = store({
      categories: [
        { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
        { id: 'misc', name: 'Misc', type: 'expense', status: 'active' }, // no groupId
      ],
      transactions: [tx('t1', '2026-08', 1500, 'misc')], // no assignment -> overspent, negative available
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('misc')).toMatchObject({ assigned: 0, activity: -1500, available: -1500, carryIn: 0 });
    expect(e.groupTotals.get('other')).toMatchObject({ assigned: 0, activity: -1500, available: -1500 });
  });

  it('an uncategorized expense and a transfer fee reduce rta; cardAdjustment does not', () => {
    const S = store({
      transactions: [
        tx('i1', '2026-08', 100000, 'salary', 'income'),
        { ...tx('t1', '2026-08', 1200, null), category: null },          // uncategorized expense
        { id: 't2', type: 'transfer', amount: 5000, fee: 300, accountId: 'a1', toAccountId: 'a2', status: 'cleared', date: '2026-08-06T12:00' },
        { id: 't3', type: 'cardAdjustment', amount: 9000, cardId: 'c1', status: 'cleared', date: '2026-08-06T12:00' },
      ],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.uncategorized).toBe(1200 + 300); // 1500
    expect(e.rta).toBe(100000 - 1200 - 300);  // cardAdjustment excluded entirely
  });

  it('seeds rta/openingTotal from only the EARLIEST confirmed snapshot per account', () => {
    const S = store({
      accounts: [{ id: 'a1', name: 'Bank', status: 'active' }],
      snapshots: [
        { id: 's1', accountId: 'a1', month: '2026-06', amount: 20000, status: 'confirmed' },
        { id: 's2', accountId: 'a1', month: '2026-07', amount: 999999, status: 'confirmed' }, // restates, must NOT add again
      ],
    });
    const eJun = envelopeFor(S, '2026-06');
    expect(eJun.openingTotal).toBe(20000);
    expect(eJun.rta).toBe(20000);
    const eAug = envelopeFor(S, '2026-08');
    expect(eAug.openingTotal).toBe(0);
    expect(eAug.rta).toBe(20000); // only June's seed ever entered rta
  });

  it('a malformed transaction date is ignored rather than zeroing every month', () => {
    const S = store({
      assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 10000 }],
      transactions: [
        tx('t1', '2026-08', 4000, 'groc'),
        { id: 'bad', type: 'expense', amount: 500, category: 'groc', accountId: 'a1', status: 'cleared', date: 'not-a-date' },
      ],
    });
    expect(() => envelopeFor(S, '2026-08')).not.toThrow();
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.get('groc')).toMatchObject({ assigned: 10000, activity: -4000, available: 6000, carryIn: 0 });
  });

  it('an archived category keeps its historical assigned amount in assignedTotal', () => {
    const S = store({
      categories: [
        { id: 'groc', name: 'Groceries', type: 'expense', status: 'archived', groupId: 'g1' },
        { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
      ],
      assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 4000 }],
    });
    const e = envelopeFor(S, '2026-08');
    expect(e.rows.has('groc')).toBe(true);
    expect(e.assignedTotal).toBe(4000);
  });
});
