// The "Selected Total" net: inflows positive, outflows negative, one signed
// figure — and own-account transfers (bank→bank or bank→card) contribute
// ZERO: the money moved between the user's own accounts, never leaving the
// ledger, so counting a transfer's OUTFLOW-column figure made a selection
// look poorer than it is. Non-transfer rows sum from their DISPLAYED sides
// (outflowValue/inflowValue), never amtValue.
import { describe, it, expect } from 'vitest';
import { txRowOf, netTotal } from '../src/lib/txRow.js';

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
const tx = over => ({
  id: 't', type: 'expense', date: '2026-08-06T12:00', status: 'cleared',
  amount: 500, accountId: 'a1', category: 'rent', merchant: '', notes: '', ...(over || {}),
});
const row = over => txRowOf(tx(over), S, fmt);

describe('netTotal', () => {
  it('sums an expense negative and an income positive', () => {
    expect(netTotal([row({ amount: 300 }), row({ id: 'i', type: 'income', amount: 1000 })])).toBe(700);
  });

  it('counts a refund positive', () => {
    expect(netTotal([row({ type: 'refund', amount: 250 })])).toBe(250);
  });

  it('counts an own-account transfer as ZERO — the money never left the ledger', () => {
    expect(netTotal([row({ type: 'transfer', toAccountId: 'a2', category: undefined, amount: 5500 })])).toBe(0);
  });

  it('counts a card-payment transfer (bank → card) as zero too', () => {
    expect(netTotal([row({ type: 'transfer', toAccountId: undefined, toCardId: 'c1', isCardPayment: true, category: undefined, amount: 3000 })])).toBe(0);
  });

  it('follows an adjustment\'s stored sign', () => {
    expect(netTotal([row({ type: 'adjustment', amount: -400, category: undefined })])).toBe(-400);
    expect(netTotal([row({ type: 'adjustment', amount: 400, category: undefined })])).toBe(400);
  });

  it('nets a mixed selection — the transfer contributes nothing', () => {
    const rows = [
      row({ amount: 300 }),                                              // -300
      row({ id: 'i', type: 'income', amount: 1000 }),                    // +1000
      row({ id: 'tr', type: 'transfer', toAccountId: 'a2', category: undefined, amount: 200 }), // 0
    ];
    expect(netTotal(rows)).toBe(700);
  });

  it('is 0 for an empty selection and ignores rows with neither side', () => {
    expect(netTotal([])).toBe(0);
    expect(netTotal([{ outflowValue: null, inflowValue: null }])).toBe(0);
  });
});
