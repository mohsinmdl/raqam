import { describe, it, expect } from 'vitest';
import { accountRows } from '../src/lib/sidebarAccounts.js';

const MONTH = '2026-08';
const NOW = '2026-08-15T12:00:00';
const snap = (id, amount) => ({ accountId: id, month: MONTH, amount });
const store = (accounts, snapshots = [], transactions = []) => ({ accounts, snapshots, transactions, cards: [] });

describe('accountRows', () => {
  it('includes only active accounts', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }, { id: 'b', nickname: 'B', status: 'archived' }, { id: 'c', nickname: 'C', status: 'closed' }],
      [snap('a', 100), snap('b', 200), snap('c', 300)],
    );
    expect(accountRows(s, MONTH, NOW).rows.map(r => r.id)).toEqual(['a']);
  });

  it('sorts alphabetically by nickname (case-insensitive), regardless of balance', () => {
    // Input order (C, a, B) is neither alphabetical nor balance-sorted, and
    // balances would give a different order (Bravo, Charlie, alpha) — so a
    // clean alphabetical result proves the sort key is the nickname.
    const s = store(
      [{ id: 'c', nickname: 'Charlie', status: 'active' }, { id: 'a', nickname: 'alpha', status: 'active' }, { id: 'b', nickname: 'Bravo', status: 'active' }],
      [snap('c', 750), snap('a', 100), snap('b', 5000)],
    );
    const { rows } = accountRows(s, MONTH, NOW);
    expect(rows.map(r => r.nickname)).toEqual(['alpha', 'Bravo', 'Charlie']);
  });

  it('total equals the sum of the listed balances', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }, { id: 'b', nickname: 'B', status: 'active' }],
      [snap('a', 100), snap('b', 250)],
    );
    expect(accountRows(s, MONTH, NOW).total).toBe(350);
  });

  it('reflects the month\'s transactions in each balance', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }],
      [snap('a', 1000)],
      [{ id: 't1', date: '2026-08-10', type: 'expense', amount: 300, accountId: 'a', status: 'cleared' }],
    );
    const { rows, total } = accountRows(s, MONTH, NOW);
    expect(rows[0].balance).toBe(700);
    expect(total).toBe(700);
  });

  it('returns empty rows and zero total when there are no active accounts', () => {
    const { rows, total } = accountRows(store([]), MONTH, NOW);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});
