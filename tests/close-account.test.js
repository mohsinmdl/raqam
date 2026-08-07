import { describe, it, expect } from 'vitest';
import { closeAccount } from '../src/store/actions.js';

function store(over) {
  return {
    institutions: [{ id: 'u1', name: 'Cash', kind: 'Custom', own: true }],
    accounts: [{ id: 'a1', instId: 'u1', nickname: 'Cash', type: 'Cash', status: 'active' }],
    cards: [], cardProducts: [], categories: [], snapshots: [], transactions: [],
    budgets: [], recurring: [], audit: [],
    ...(over || {}),
  };
}

describe('closeAccount', () => {
  it('zeroes a positive balance with an adjustment and marks the account closed', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: 10660 });
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
    const adj = next.transactions.filter(t => t.type === 'adjustment' && t.accountId === 'a1');
    expect(adj).toHaveLength(1);
    expect(adj[0].amount).toBe(-10660);
  });

  it('closes a zero-balance account without creating an adjustment', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: 0 });
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
    expect(next.transactions.filter(t => t.type === 'adjustment')).toHaveLength(0);
  });

  it('offsets a negative balance with a positive adjustment', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: -360 });
    const adj = next.transactions.find(t => t.type === 'adjustment' && t.accountId === 'a1');
    expect(adj.amount).toBe(360);
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
  });

  it('is a no-op-safe on an unknown account id', () => {
    const S = store();
    expect(closeAccount(S, { accountId: 'nope', currentBalance: 100 }).accounts).toEqual(S.accounts);
  });

  it('does not mutate the input store', () => {
    const S = store();
    closeAccount(S, { accountId: 'a1', currentBalance: 500 });
    expect(S.transactions).toEqual([]);
    expect(S.accounts[0].status).toBe('active');
  });
});
