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
});
