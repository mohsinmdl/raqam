import { payeeIndex, transferHidden } from './payees.js';

// Sections for the inline editor's payee combobox. "Saved Payees" is built
// from the payee index (Spec 2): the distinct set of past merchant strings,
// overlaid with any customized payee records (record casing wins), minus
// hidden ones. "Payments and Transfers" synthesizes a To/From entry per
// active account and credit card — picking one turns the row into a transfer
// (see txEditorState.editorPatch 'transfer'). The row's own source account is
// excluded: you cannot transfer to where the money already is. Hidden
// transfer payee records (visibility-only) drop the ref from this section too.
export function payeeSections(S, { sourceRef = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const hit = s => !q || s.toLowerCase().includes(q);

  const transfers = [
    ...S.accounts.filter(a => a.status === 'active').map(a => ({ kind: 'transfer', ref: 'acc:' + a.id, label: 'To/From ' + a.nickname })),
    ...S.cards.filter(c => c.type === 'credit' && c.status === 'active').map(c => ({ kind: 'transfer', ref: 'card:' + c.id, label: 'To/From ' + c.nickname + ' ••' + c.last4 })),
  ].filter(t => t.ref !== sourceRef && !transferHidden(S, t.ref) && hit(t.label));

  const payees = payeeIndex(S)
    .filter(p => !(p.record && p.record.hidden))
    .filter(p => hit(p.name))
    .map(p => ({ kind: 'payee', name: p.name }));

  return [
    { label: 'Payments and Transfers', items: transfers },
    { label: 'Saved Payees', items: payees },
  ].filter(s => s.items.length > 0);
}
