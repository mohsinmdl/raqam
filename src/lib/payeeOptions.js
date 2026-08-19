// Sections for the inline editor's payee combobox. There is no payee entity
// yet (Spec 2 adds one): "Payees" is the distinct set of past merchant
// strings, and "Payments and Transfers" synthesizes a To/From entry per
// active account and credit card — picking one turns the row into a transfer
// (see txEditorState.editorPatch 'transfer'). The row's own source account is
// excluded: you cannot transfer to where the money already is.
export function payeeSections(S, { sourceRef = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const hit = s => !q || s.toLowerCase().includes(q);

  const transfers = [
    ...S.accounts.filter(a => a.status === 'active').map(a => ({ kind: 'transfer', ref: 'acc:' + a.id, label: 'To/From ' + a.nickname })),
    ...S.cards.filter(c => c.type === 'credit' && c.status === 'active').map(c => ({ kind: 'transfer', ref: 'card:' + c.id, label: 'To/From ' + c.nickname + ' ••' + c.last4 })),
  ].filter(t => t.ref !== sourceRef && hit(t.label));

  // First-seen casing wins; adjustments' synthetic 'Balance adjustment' is
  // machine-written, not a payee the user should be offered.
  const seen = new Map();
  for (const t of S.transactions) {
    const name = (t.merchant || '').trim();
    if (!name || t.type === 'adjustment' || t.type === 'cardAdjustment') continue;
    const k = name.toLowerCase();
    if (!seen.has(k)) seen.set(k, name);
  }
  const payees = [...seen.values()].filter(hit).sort((a, b) => a.localeCompare(b))
    .map(name => ({ kind: 'payee', name }));

  return [
    { label: 'Payments and Transfers', items: transfers },
    { label: 'Payees', items: payees },
  ].filter(s => s.items.length > 0);
}
