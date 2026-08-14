// Per-type presentation facts for the phone tx editor. The booleans mirror
// TxForm's fx* flags (src/drawers/TxForm.jsx:56-70) — one truth table, tested.
export function fieldsFor(type) {
  return {
    merchant: type !== 'adjustment',
    category: type === 'expense' || type === 'income' || type === 'refund',
    payWith: type === 'expense' || type === 'refund',
    account: type === 'income' || type === 'adjustment',
    transfer: type === 'transfer',
    adjust: type === 'adjustment',
  };
}
export function tintFor(type) {
  if (type === 'income' || type === 'refund') return 'var(--pos-soft)';
  if (type === 'transfer') return 'var(--soft)';
  return 'var(--elev)';
}
export const merchantLabel = type => (type === 'income' ? 'Payer / source' : 'Paid to');
export const payWithLabel = type => (type === 'refund' ? 'Refund to' : 'Paid with');
export const accountLabel = type => (type === 'income' ? 'Into account' : 'Account to adjust');
