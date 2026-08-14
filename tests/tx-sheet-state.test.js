import { describe, it, expect } from 'vitest';
import { fieldsFor, tintFor, merchantLabel, payWithLabel, accountLabel } from '../src/ui/tx/phone/txSheetState.js';

// This table IS TxForm's fx* truth table (src/drawers/TxForm.jsx:56-70).
// If TxForm changes, this test is the tripwire that the phone editor must follow.
const T = {
  expense:    { merchant: true,  category: true,  payWith: true,  account: false, transfer: false, adjust: false },
  income:     { merchant: true,  category: true,  payWith: false, account: true,  transfer: false, adjust: false },
  // merchant:true here documents TxForm parity only — it does NOT mean TxSheet
  // renders a payee row for transfers. The phone editor's two-card from/to
  // layout intentionally omits fields.merchant for transfers (spec-sanctioned
  // layout deviation; see the comment at TxSheet.jsx's transfer branch), so
  // don't read this flag as "false assurance" that a merchant field renders.
  transfer:   { merchant: true,  category: false, payWith: false, account: false, transfer: true,  adjust: false },
  refund:     { merchant: true,  category: true,  payWith: true,  account: false, transfer: false, adjust: false },
  adjustment: { merchant: false, category: false, payWith: false, account: true,  transfer: false, adjust: true },
};
describe('fieldsFor', () => {
  for (const [type, expected] of Object.entries(T)) {
    it(type, () => expect(fieldsFor(type)).toEqual(expected));
  }
});
describe('labels and tint', () => {
  it('labels match TxForm copy', () => {
    expect(merchantLabel('income')).toBe('Payer / source');
    expect(merchantLabel('expense')).toBe('Paid to');
    expect(payWithLabel('refund')).toBe('Refund to');
    expect(payWithLabel('expense')).toBe('Paid with');
    expect(accountLabel('income')).toBe('Into account');
    expect(accountLabel('adjustment')).toBe('Account to adjust');
  });
  it('tint per type', () => {
    expect(tintFor('income')).toBe('var(--pos-soft)');
    expect(tintFor('refund')).toBe('var(--pos-soft)');
    expect(tintFor('transfer')).toBe('var(--soft)');
    expect(tintFor('expense')).toBe('var(--elev)');
    expect(tintFor('adjustment')).toBe('var(--elev)');
  });
});
