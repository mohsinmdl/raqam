// Low-balance hint: an active account whose balance falls below the user's
// threshold gets a subtle "top up" marker beside its amount (sidebar, Overview
// Accounts card, Accounts screen). The threshold is a user preference
// (`prefs.lowBalanceThreshold`), editable on the Settings page; unset falls back
// to LOW_BALANCE_DEFAULT, and 0 turns the hint off. Pure — no React.

export const LOW_BALANCE_DEFAULT = 5000;

// The effective threshold from prefs: a finite, non-negative number wins (0
// means "disabled"); anything missing or malformed falls back to the default.
export function lowBalanceThreshold(prefs) {
  const v = prefs && prefs.lowBalanceThreshold;
  return Number.isFinite(v) && v >= 0 ? v : LOW_BALANCE_DEFAULT;
}

// Whether `balance` should show the hint. Negatives count (they most need a top
// up); an exact match sits on the line and does not. A threshold of 0 (or less)
// disables it entirely.
export function isLowBalance(balance, threshold) {
  return Number.isFinite(balance) && threshold > 0 && balance < threshold;
}
