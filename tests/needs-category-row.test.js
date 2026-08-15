// Uncategorized transactions surface visibly in lists: txRowOf flags them so
// every category cell (desktop table, phone rows, dashboard recents) can swap
// the plain "—" for the warm "This needs a category" pill.
import { describe, it, expect } from 'vitest';
import { txRowOf, ruleRowOf } from '../src/lib/txRow.js';

const S = {
  categories: [{ id: 'c1', name: 'Groceries', type: 'expense', color: '#333' }],
  accounts: [{ id: 'a1', nickname: 'Meezan' }],
  cards: [],
  institutions: [],
  recurring: [],
  transactions: [],
};
const fmt = { money: n => String(n), moneyS: n => String(n) };
const tx = over => ({ id: 't1', date: '2026-08-16T10:00', status: 'cleared', amount: 100, accountId: 'a1', merchant: 'x', ...over });

describe('txRowOf.needsCategory', () => {
  it.each(['expense', 'income', 'refund'])('%s without a category is flagged', type => {
    const r = txRowOf(tx({ type }), S, fmt);
    expect(r.needsCategory).toBe(true);
    expect(r.catName).toBe('—');
  });
  it.each(['expense', 'income', 'refund'])('%s with a category is not flagged', type => {
    expect(txRowOf(tx({ type, category: 'c1' }), S, fmt).needsCategory).toBe(false);
  });
  it('transfers are never flagged (they have no category by design)', () => {
    expect(txRowOf(tx({ type: 'transfer', toAccountId: 'a1' }), S, fmt).needsCategory).toBe(false);
  });
  it('adjustments are never flagged', () => {
    expect(txRowOf(tx({ type: 'adjustment' }), S, fmt).needsCategory).toBe(false);
  });
  it('scheduled rule rows never carry the flag', () => {
    const r = ruleRowOf({ id: 'r1', name: 'Rent', type: 'expense', amount: 100, nextDate: '2026-08-20', schedule: { every: 1, unit: 'month', dayRules: [{ kind: 'dom', day: '20' }] } }, S, fmt, '2026-08-16T10:00');
    expect(r.needsCategory).toBeFalsy();
  });
});
