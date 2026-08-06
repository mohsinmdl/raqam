import { describe, it, expect } from 'vitest';
import { postTransactionNow } from '../src/store/actions.js';
import { accountBalance } from '../src/lib/calc.js';
import { txGroups } from '../src/lib/txRow.js';

const NOW = '2026-08-06T10:00';

const ahead = {
  id: 'ahead', date: '2026-08-30T09:00', type: 'expense', amount: 5000, status: 'cleared',
  accountId: 'a1', category: 'groc', merchant: 'Mepco', notes: '',
};
const past = { ...ahead, id: 'past', date: '2026-08-02T09:00', amount: 1000, merchant: 'Shop' };

const store = over => ({
  institutions: [], cardProducts: [],
  categories: [{ id: 'groc', name: 'Groceries', color: '#c33', type: 'expense', status: 'active' }],
  accounts: [{ id: 'a1', nickname: 'Main', type: 'Current', status: 'active' }],
  cards: [], budgets: [], recurring: [], audit: [],
  snapshots: [{ accountId: 'a1', month: '2026-08', amount: 100000, status: 'confirmed' }],
  transactions: [past, ahead],
  ...(over || {}),
});
const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };

describe('postTransactionNow', () => {
  it('re-dates the row to now and changes nothing else', () => {
    const s = postTransactionNow(store(), { id: 'ahead', now: NOW });
    const t = s.transactions.find(x => x.id === 'ahead');
    expect(t.date).toBe(NOW);
    expect(t.amount).toBe(5000);
    expect(t.merchant).toBe('Mepco');
    expect(t.status).toBe('cleared');
    expect(t.category).toBe('groc');
  });

  it('stamps the edit like any other transaction change', () => {
    const t = postTransactionNow(store(), { id: 'ahead', now: NOW }).transactions.find(x => x.id === 'ahead');
    expect(t.editedAt).toBeTruthy();
    expect(t.editCount).toBe(1);
  });

  it('audits the date move, before and after', () => {
    const s = postTransactionNow(store(), { id: 'ahead', now: NOW });
    const a = s.audit[0];
    expect(a.entityType).toBe('transaction');
    expect(a.entityId).toBe('ahead');
    expect(a.action).toBe('update');
    expect(a.summary).toMatch(/Posted now/);
    expect(a.before.date).toBe('2026-08-30T09:00');
    expect(a.after.date).toBe(NOW);
  });

  it('leaves the other rows untouched', () => {
    const s = postTransactionNow(store(), { id: 'ahead', now: NOW });
    expect(s.transactions.find(x => x.id === 'past')).toEqual(past);
    expect(s.transactions).toHaveLength(2);
  });

  it('does not mutate the store it was given', () => {
    const S = store();
    postTransactionNow(S, { id: 'ahead', now: NOW });
    expect(S.transactions.find(x => x.id === 'ahead').date).toBe('2026-08-30T09:00');
    expect(S.audit).toHaveLength(0);
  });

  it('is a same-reference no-op for an unknown id', () => {
    const S = store();
    expect(postTransactionNow(S, { id: 'nope', now: NOW })).toBe(S);
  });

  it('is a same-reference no-op for a row already in the past — a double click cannot re-stamp it', () => {
    const S = store();
    expect(postTransactionNow(S, { id: 'past', now: NOW })).toBe(S);
    const once = postTransactionNow(S, { id: 'ahead', now: NOW });
    expect(postTransactionNow(once, { id: 'ahead', now: NOW })).toBe(once);
  });

  it('is a same-reference no-op without a now, rather than dating something to undefined', () => {
    const S = store();
    expect(postTransactionNow(S, { id: 'ahead' })).toBe(S);
  });

  it('moves the row out of Scheduled and into Recorded — the only thing the date has to do', () => {
    const RANGE = { from: '2026-08', to: '2026-08' };
    const before = txGroups(store().transactions, store(), fmt, NOW, RANGE, false);
    expect(before.scheduled.map(x => x.selId)).toEqual(['ahead']);

    const s = postTransactionNow(store(), { id: 'ahead', now: NOW });
    const after = txGroups(s.transactions, s, fmt, NOW, RANGE, false);
    expect(after.scheduled).toEqual([]);
    expect(after.postedRows.map(r => r.id).sort()).toEqual(['ahead', 'past']);
  });

  it('starts counting in the balance, which is the point of posting it', () => {
    const S = store();
    expect(accountBalance(S.accounts[0], S, '2026-08', NOW)).toBe(99000);
    const s = postTransactionNow(S, { id: 'ahead', now: NOW });
    expect(accountBalance(s.accounts[0], s, '2026-08', NOW)).toBe(94000);
  });
});
