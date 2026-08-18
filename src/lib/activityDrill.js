// Drill-down target for a transaction clicked in the Activity modal.
//
// A bank-account txn opens that account's register (/transactions/:accountId),
// which pre-selects the account exactly like YNAB. A card-funded txn has no
// accountId and never appears in a per-account register, so it opens the
// all-accounts view (/transactions) — the only place card txns are listed.
//
// In both cases the txn id travels as a one-shot ?sel= query param that the
// Transactions screen consumes to check the row, scroll to it, and then clear.
// Returns a react-router `To` object so callers can navigate(target) directly.
export function activityDrillTarget(t) {
  const pathname = t.accountId ? '/transactions/' + t.accountId : '/transactions';
  return { pathname, search: '?sel=' + encodeURIComponent(t.id) };
}
