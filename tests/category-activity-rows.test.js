import { describe, it, expect } from 'vitest';
import { envelopeFor, categoryActivityRows } from '../src/lib/envelope.js';

const NOW = '2026-08-20T12:00:00.000Z';
const store = () => ({
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
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
});
