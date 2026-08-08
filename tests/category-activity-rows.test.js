import { describe, it, expect } from 'vitest';
import { envelopeFor, categoryActivityRows } from '../src/lib/envelope.js';

const NOW = '2026-08-20T12:00:00.000Z';
const store = () => ({
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
  ],
  categoryGroups: [], assignments: [{ id: 'a', category: 'groc', month: '2026-08', amount: 10000 }],
  accounts: [{ id: 'acc', nickname: 'Cash', type: 'Current', status: 'active', instId: 'i1' }],
  snapshots: [{ id: 's', accountId: 'acc', month: '2026-07', balance: 0, amount: 0, status: 'confirmed' }],
  transactions: [
    { id: 't1', type: 'expense', category: 'groc', amount: 1500, date: '2026-08-05', status: 'confirmed', accountId: 'acc', payee: 'Store', notes: 'weekly' },
    { id: 't2', type: 'expense', category: 'groc', amount: 900, date: '2026-08-12', status: 'confirmed', accountId: 'acc', payee: 'Market' },
    { id: 't3', type: 'expense', category: 'groc', amount: 999, date: '2026-08-30', status: 'pending', accountId: 'acc' }, // pending, excluded
    { id: 't4', type: 'expense', category: 'groc', amount: 500, date: '2026-06-01', status: 'confirmed', accountId: 'acc' }, // pre-seed month (< 2026-07), excluded
    { id: 't5', type: 'expense', category: 'groc', amount: 40, date: '2026-08-01', status: 'confirmed', accountId: 'acc' },
  ],
  budgets: [], cards: [], recurring: [], audit: [],
});

describe('categoryActivityRows', () => {
  it('selects the same rows the fold counts and totals to the ACTIVITY figure', () => {
    const S = store();
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-08', NOW);
    expect(rows.map(r => r.t.id)).toEqual(['t2', 't1', 't5']); // newest first, no pending, no pre-seed
    const foldActivity = envelopeFor(S, '2026-08', NOW).rows.get('groc').activity;
    expect(total).toBe(foldActivity);
    expect(total).toBe(-2440);
  });
  it('is empty for a category with no counted transactions that month', () => {
    const S = store();
    expect(categoryActivityRows(S, 'groc', '2026-09', NOW)).toEqual({ rows: [], total: 0 });
  });

  it('a refund (txBudgetImpact != t.amount) contributes a positive impact and total still matches the fold', () => {
    const S = store();
    // Refund's txBudgetImpact is -t.amount, so its activity contribution
    // (-impact) is POSITIVE — it reduces net spending, the opposite sign of
    // an expense's contribution. This is exactly the case where t.amount
    // would silently disagree with the real impact if the modal reimplemented
    // the fold instead of sharing it.
    S.transactions.push(
      { id: 't6', type: 'refund', category: 'groc', amount: 300, date: '2026-08-15', status: 'confirmed', accountId: 'acc', payee: 'Return' },
    );
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-08', NOW);
    const refundRow = rows.find(r => r.t.id === 't6');
    expect(refundRow).toBeTruthy();
    expect(refundRow.impact).toBe(300);
    const foldActivity = envelopeFor(S, '2026-08', NOW).rows.get('groc').activity;
    expect(total).toBe(foldActivity);
    // Hand-derived: -2440 (t1+t2+t5 expenses, as above) + 300 (t6 refund) = -2140.
    expect(total).toBe(-2140);
  });

  it('returns empty for a non-expense or dangling catId, matching the fold (which never gives such an id a row)', () => {
    const S = store();
    expect(categoryActivityRows(S, 'no-such-cat', '2026-08', NOW)).toEqual({ rows: [], total: 0 });
    expect(categoryActivityRows(S, 'salary', '2026-08', NOW)).toEqual({ rows: [], total: 0 });
    expect(envelopeFor(S, '2026-08', NOW).rows.has('no-such-cat')).toBe(false);
    expect(envelopeFor(S, '2026-08', NOW).rows.has('salary')).toBe(false);
  });

  it('includes a transaction dated within the seed month itself (seed.month > m is false when equal)', () => {
    const S = {
      categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
      categoryGroups: [], assignments: [],
      accounts: [{ id: 'acc', nickname: 'Cash', type: 'Current', status: 'active', instId: 'i1' }],
      snapshots: [{ id: 's', accountId: 'acc', month: '2026-07', balance: 0, amount: 0, status: 'confirmed' }],
      transactions: [
        // Dated IN the seed month itself (not before it) — seededAfter uses
        // `seed.month > m`, and '2026-07' > '2026-07' is false, so this is
        // NOT pre-seed and must be counted.
        { id: 't1', type: 'expense', category: 'groc', amount: 800, date: '2026-07-15', status: 'confirmed', accountId: 'acc' },
      ],
      budgets: [], cards: [], recurring: [], audit: [],
    };
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-07', NOW);
    expect(rows.map(r => r.t.id)).toEqual(['t1']);
    // Hand-derived: single 800 expense, impact 800 -> activity contribution -800.
    expect(total).toBe(-800);
    expect(total).toBe(envelopeFor(S, '2026-07', NOW).rows.get('groc').activity);
  });

  it('applies seededAfter per account when two accounts have different seed months', () => {
    const S = {
      categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
      categoryGroups: [], assignments: [],
      accounts: [
        { id: 'accA', nickname: 'A', type: 'Current', status: 'active', instId: 'i1' },
        { id: 'accB', nickname: 'B', type: 'Current', status: 'active', instId: 'i2' },
      ],
      snapshots: [
        { id: 'sA', accountId: 'accA', month: '2026-05', balance: 0, amount: 0, status: 'confirmed' },
        { id: 'sB', accountId: 'accB', month: '2026-08', balance: 0, amount: 0, status: 'confirmed' },
      ],
      transactions: [
        // accA's seed is 2026-05, which is NOT after the queried 2026-07 ->
        // counted.
        { id: 'tA', type: 'expense', category: 'groc', amount: 500, date: '2026-07-01', status: 'confirmed', accountId: 'accA' },
        // accB's seed is 2026-08, which IS after the queried 2026-07 -> this
        // transaction predates accB's own snapshot and must be excluded, even
        // though it's dated the same month as tA.
        { id: 'tB', type: 'expense', category: 'groc', amount: 300, date: '2026-07-02', status: 'confirmed', accountId: 'accB' },
      ],
      budgets: [], cards: [], recurring: [], audit: [],
    };
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-07', NOW);
    expect(rows.map(r => r.t.id)).toEqual(['tA']);
    // Hand-derived: only tA counts (500 expense) -> activity contribution -500.
    expect(total).toBe(-500);
    expect(total).toBe(envelopeFor(S, '2026-07', NOW).rows.get('groc').activity);
  });

  it('excludes income and transfer-with-fee rows (only expense/refund count toward a category)', () => {
    const S = {
      categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
      categoryGroups: [], assignments: [],
      accounts: [
        { id: 'accA', nickname: 'A', type: 'Current', status: 'active', instId: 'i1' },
        { id: 'accB', nickname: 'B', type: 'Current', status: 'active', instId: 'i2' },
      ],
      snapshots: [],
      transactions: [
        // Income rows are never routed through a category's activity, even
        // when (as here) one happens to carry the same category id.
        { id: 'inc1', type: 'income', category: 'groc', amount: 1000, date: '2026-07-10', status: 'confirmed', accountId: 'accA' },
        // Transfer fee is a real outflow, but it comes off RTA directly
        // (uncategorizedByMonth in the fold), never a category's activity.
        { id: 'xfer1', type: 'transfer', category: 'groc', amount: 200, fee: 50, date: '2026-07-12', status: 'confirmed', accountId: 'accA', toAccountId: 'accB' },
      ],
      budgets: [], cards: [], recurring: [], audit: [],
    };
    const { rows, total } = categoryActivityRows(S, 'groc', '2026-07', NOW);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
    expect(total).toBe(envelopeFor(S, '2026-07', NOW).rows.get('groc').activity);
  });
});
