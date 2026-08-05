// The transfer counterparty is perspective-dependent, which acctLabel is not —
// acctLabel is always "source → destination" and never flips. On an account's
// own page that would answer the wrong question, so transferOther exists.
import { describe, it, expect } from 'vitest';
import { txRowOf } from '../src/lib/txRow.js';

const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n > 0 ? '+' : n < 0 ? '−' : '') + 'Rs ' + Math.abs(n) };
const S = {
  categories: [{ id: 'rent', name: 'Rent', color: '#000' }],
  accounts: [
    { id: 'a1', nickname: 'HBL Islamic' },
    { id: 'a2', nickname: 'Meezan' },
  ],
  cards: [{ id: 'c1', nickname: 'Visa', last4: '1234' }],
  recurring: [],
};
const transfer = over => ({
  id: 't1', type: 'transfer', date: '2026-08-06T12:00', status: 'cleared',
  amount: 5500, accountId: 'a1', toAccountId: 'a2', merchant: '', notes: '', ...(over || {}),
});

describe('transferOther', () => {
  it('names the destination when viewed from the source', () => {
    expect(txRowOf(transfer(), S, fmt, 'a1').transferOther).toEqual({ dir: 'to', name: 'Meezan' });
  });

  it('names the source when viewed from the destination', () => {
    expect(txRowOf(transfer(), S, fmt, 'a2').transferOther).toEqual({ dir: 'from', name: 'HBL Islamic' });
  });

  it('names the card on a card payment', () => {
    const t = transfer({ toAccountId: undefined, toCardId: 'c1', isCardPayment: true });
    expect(txRowOf(t, S, fmt, 'a1').transferOther).toEqual({ dir: 'to', name: 'Visa ••1234' });
  });

  it('is absent without an account perspective — those lists show acctLabel instead', () => {
    const row = txRowOf(transfer(), S, fmt);
    expect(row.transferOther).toBe(null);
    expect(row.acctLabel).toBe('HBL Islamic → Meezan');
  });

  it('is absent on transactions that are not transfers', () => {
    const expense = { id: 't2', type: 'expense', date: '2026-08-06T12:00', status: 'cleared', amount: 100, accountId: 'a1', category: 'rent', merchant: 'Shop', notes: '' };
    expect(txRowOf(expense, S, fmt, 'a1').transferOther).toBe(null);
  });

  it('survives a deleted counterparty rather than throwing', () => {
    const t = transfer({ toAccountId: 'gone' });
    expect(txRowOf(t, S, fmt, 'a1').transferOther).toEqual({ dir: 'to', name: '?' });
  });

  it('reads opposite to the amount sign on each side', () => {
    const from = txRowOf(transfer(), S, fmt, 'a1');
    const to = txRowOf(transfer(), S, fmt, 'a2');
    expect(from.transferOther.dir).toBe('to');
    expect(from.amtLabel.startsWith('−')).toBe(true);
    expect(to.transferOther.dir).toBe('from');
    expect(to.amtLabel.startsWith('+')).toBe(true);
  });
});

describe('chipIcon', () => {
  it('marks both a transfer and a card payment for the glyph', () => {
    expect(txRowOf(transfer(), S, fmt).chipIcon).toBe('transfer');
    const pay = transfer({ toAccountId: undefined, toCardId: 'c1', isCardPayment: true });
    const row = txRowOf(pay, S, fmt);
    expect(row.chipIcon).toBe('transfer');
    expect(row.chip).toBe('Card payment');
  });

  it('leaves non-transfers without an icon so their label still shows', () => {
    const refund = { id: 't3', type: 'refund', date: '2026-08-06T12:00', status: 'cleared', amount: 100, accountId: 'a1', category: 'rent', merchant: '', notes: '' };
    const row = txRowOf(refund, S, fmt);
    expect(row.chipIcon).toBe(null);
    expect(row.chip).toBe('Refund');
  });
});
