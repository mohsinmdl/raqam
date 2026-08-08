// Free-text search over a transaction.
//
// The searchable text is everything a person might reasonably type to find a
// row: the merchant and notes, the category, and the names of every account or
// card the row touches — including the far side of a transfer. The field's
// placeholder promises "Search All Accounts", so account and card names have to
// be in here; leaving them out was the bug this file fixes.
//
// Extracted from the Transactions predicate because the awkward cases — a
// transfer naming two accounts, a card payment naming an account and a card —
// are worth testing, and a component is not.

// Everything about a transaction that search should look through, lowered once.
export function txHaystack(t, S) {
  const catName = id => (S.categories.find(c => c.id === id) || {}).name || '';
  const acctName = id => (S.accounts.find(a => a.id === id) || {}).nickname || '';
  const cardName = id => {
    const c = S.cards.find(x => x.id === id);
    return c ? c.nickname + ' ' + (c.last4 || '') : '';
  };
  return [
    t.merchant, t.notes, t.adjustmentReason, catName(t.category),
    acctName(t.accountId), acctName(t.toAccountId),
    cardName(t.cardId), cardName(t.toCardId),
  ].filter(Boolean).join(' ').toLowerCase();
}

// Case- and whitespace-insensitive substring match. An empty query matches
// everything, so the caller need not special-case "no search".
export function matchesQuery(t, q, S) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return true;
  return txHaystack(t, S).includes(needle);
}
