// How often each account/card has actually been used, from the transaction
// records themselves (buildTx's stored shape — actions.js) rather than the
// editor form's shape. A transfer touches TWO refs (source + destination) and
// bumps both once each: the money genuinely moved through both accounts, so
// counting only the source would undercount the destination's real usage.
// Refs use the same 'acc:'/'card:' prefix the account picker's option ids do
// (useTxOpts, TxForm.jsx), so the count Map keys straight into a sort by id.
export function accountUsageCounts(transactions) {
  const counts = new Map();
  const bump = ref => { if (ref) counts.set(ref, (counts.get(ref) || 0) + 1); };
  for (const t of transactions || []) {
    if (t.accountId) bump('acc:' + t.accountId);
    if (t.cardId) bump('card:' + t.cardId);
    if (t.toAccountId) bump('acc:' + t.toAccountId);
    if (t.toCardId) bump('card:' + t.toCardId);
  }
  return counts;
}

// Most-used-first, ties broken by leaving equally-used options in their
// original relative order (a stable sort — no alphabetical fallback needed,
// since a fresh, never-used, or perfectly tied account keeps whatever
// meaningful order the caller already had, e.g. account creation order).
export function byUsage(opts, counts) {
  return [...opts].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
}
