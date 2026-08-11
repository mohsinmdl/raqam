import { describe, it, expect } from 'vitest';
import { addSplitTransaction } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'adv', name: 'Roommate advance', type: 'expense', status: 'active', groupId: 'g1', excludeFromBudget: true },
  ],
  accounts: [{ id: 'a1', nickname: 'Meezan', status: 'active' }],
  assignments: [], transactions: [], budgets: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

const form = over => ({
  type: 'expense', amount: '5000', payWith: 'acc:a1', merchant: 'Imtiaz',
  date: '2026-08-11', time: '12:00', pending: false, notes: '',
  ...(over || {}),
});

const legs = [
  { category: 'groc', amount: '2500', newCat: '', newCatGroup: '' },
  { category: 'adv', amount: '2500', newCat: '', newCatGroup: '' },
];

describe('addSplitTransaction', () => {
  it('creates one expense per leg sharing splitId, date, account, merchant', () => {
    const s = addSplitTransaction(store(), { form: form(), legs, amt: 5000 });
    expect(s.transactions).toHaveLength(2);
    const [t1, t2] = s.transactions;
    expect(t1.splitId).toBeTruthy();
    expect(t1.splitId).toBe(t2.splitId);
    expect(t1.id).not.toBe(t2.id);
    for (const t of [t1, t2]) {
      expect(t).toMatchObject({ type: 'expense', accountId: 'a1', merchant: 'Imtiaz', status: 'cleared', date: '2026-08-11T12:00' });
    }
    expect([t1.amount, t2.amount].sort()).toEqual([2500, 2500]);
    expect([t1.category, t2.category].sort()).toEqual(['adv', 'groc']);
  });
  it('writes exactly one audit entry summarizing the split', () => {
    const s = addSplitTransaction(store(), { form: form(), legs, amt: 5000 });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'transaction', action: 'create' });
    expect(s.audit[0].summary).toMatch(/split/i);
  });
  it('resolves an inline new category on a line', () => {
    const withNew = [
      { category: '__new', amount: '2000', newCat: 'Fuel', newCatGroup: 'g1' },
      { category: 'adv', amount: '3000', newCat: '', newCatGroup: '' },
    ];
    const s = addSplitTransaction(store(), { form: form(), legs: withNew, amt: 5000 });
    const fuel = s.categories.find(c => c.name === 'Fuel');
    expect(fuel).toBeTruthy();
    expect(s.transactions.some(t => t.category === fuel.id)).toBe(true);
  });
  it('pays with a card when the form says card', () => {
    const withCard = store({ cards: [{ id: 'c1', nickname: 'Visa', status: 'active' }] });
    const s = addSplitTransaction(withCard, { form: form({ payWith: 'card:c1' }), legs, amt: 5000 });
    expect(s.transactions.every(t => t.cardId === 'c1' && !t.accountId)).toBe(true);
  });
  it('does not mutate the input store', () => {
    const s0 = store();
    addSplitTransaction(s0, { form: form(), legs, amt: 5000 });
    expect(s0.transactions).toHaveLength(0);
    expect(s0.audit).toHaveLength(0);
  });
});

import { COLLECTIONS } from '../src/store/sync.js';

describe('transactions sync contract: splitId', () => {
  const entry = COLLECTIONS.find(c => c.name === 'transactions');
  const leg = { id: 't1', date: '2026-08-11T12:00', type: 'expense', amount: 2500, accountId: 'a1', category: 'groc', merchant: 'Imtiaz', notes: '', status: 'cleared', splitId: 'sp1' };
  it('round-trips splitId through toRow/fromRow', () => {
    const row = entry.toRow(leg);
    expect(row.split_id).toBe('sp1');
    expect(entry.fromRow(row).splitId).toBe('sp1');
  });
  it('emits explicit null when absent and strips it coming back', () => {
    const { splitId, ...plain } = leg;
    const row = entry.toRow(plain);
    expect(row.split_id).toBeNull();
    expect('splitId' in entry.fromRow(row)).toBe(false);
  });
});

import { txRowOf } from '../src/lib/txRow.js';

describe('txRowOf split flag', () => {
  const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => String(n) };
  const S2 = {
    accounts: [{ id: 'a1', nickname: 'Meezan' }], cards: [], categories: [{ id: 'groc', name: 'Groceries' }],
    transactions: [], recurring: [],
  };
  const base = { id: 't1', date: '2026-08-11T12:00', type: 'expense', amount: 2500, accountId: 'a1', category: 'groc', merchant: '', notes: '', status: 'cleared' };
  it('flags legs that carry a splitId', () => {
    expect(txRowOf({ ...base, splitId: 'sp1' }, S2, fmt).split).toBe(true);
    expect(txRowOf(base, S2, fmt).split).toBe(false);
  });
});
