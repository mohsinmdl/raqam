import { describe, it, expect } from 'vitest';
import { buildTx } from '../src/store/actions.js';
import { txRowOf } from '../src/lib/txRow.js';

// "Paid to" was rendered for every type, including Balance adjustment — where
// it is both the wrong question (an adjustment is not paid to anyone) and a
// dead one: buildTx overwrites merchant with 'Balance adjustment' whatever is
// typed. These pin the labelling both creation paths rely on, so hiding the
// field cannot leave an adjustment row rendering as a bare dash.
const form = over => ({
  date: '2026-08-07', time: '12:00', amount: '3200', account: 'acc:cash',
  direction: 'increase', reason: 'Counted the tin', notes: '', merchant: '', ...(over || {}),
});
const S = {
  categories: [], accounts: [{ id: 'cash', nickname: 'Cash' }], cards: [], recurring: [],
};
const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };

describe('an adjustment labels itself', () => {
  it('is called Balance adjustment even when nothing was typed', () => {
    expect(buildTx(form(), 'adjustment', 3200, 0, null).merchant).toBe('Balance adjustment');
  });

  it('ignores a merchant if one somehow arrives in the form', () => {
    // The field is hidden now, but stale form state or an edit of a converted
    // row could still carry one. The label must not become user-controlled.
    expect(buildTx(form({ merchant: 'Imtiaz Super Market' }), 'adjustment', 3200, 0, null).merchant)
      .toBe('Balance adjustment');
  });

  it('keeps the reason, which is where the explanation belongs', () => {
    expect(buildTx(form(), 'adjustment', 3200, 0, null).adjustmentReason).toBe('Counted the tin');
  });

  it('renders with a real name in the ledger, never a bare dash', () => {
    const t = buildTx(form(), 'adjustment', 3200, 0, null);
    expect(txRowOf({ ...t, accountId: 'cash' }, S, fmt).merchant).toBe('Balance adjustment');
  });

  it('still honours the sign of a decrease', () => {
    expect(buildTx(form({ direction: 'decrease' }), 'adjustment', 3200, 0, null).amount).toBe(-3200);
  });
});

describe('other types keep their merchant', () => {
  it('an expense records what the user typed', () => {
    const f = form({ merchant: 'Imtiaz Super Market', payWith: 'acc:cash' });
    expect(buildTx(f, 'expense', 500, 0, 'groc').merchant).toBe('Imtiaz Super Market');
  });

  it('an income records its payer', () => {
    const f = form({ merchant: 'CodingCops' });
    expect(buildTx(f, 'income', 100000, 0, 'salary').merchant).toBe('CodingCops');
  });

  it('a transfer carries no merchant and reads as an own-account transfer', () => {
    const f = form({ from: 'acc:cash', to: 'acc:bank', merchant: '' });
    const t = buildTx(f, 'transfer', 1000, 0, null);
    expect(t.merchant).toBe('');
    expect(txRowOf(t, { ...S, accounts: [{ id: 'cash', nickname: 'Cash' }, { id: 'bank', nickname: 'Bank' }] }, fmt).merchant)
      .toBe('Own-account transfer');
  });
});
