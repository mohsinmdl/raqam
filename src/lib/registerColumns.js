// Register column visibility — pure, so the container-query breakpoints get
// a direct test without mounting the table. COLUMNS (Transactions.jsx) drives
// <colgroup>, the header row and the body cells from ONE array; this filters
// that same array by the register wrapper's measured inline size (the
// resizable sidebar changes available content width, not the viewport — same
// convention as .dash-cols/.plan-grid in theme.css, container-type driven,
// just resolved here in JS instead of pure CSS) so all three stay in
// lockstep instead of a CSS-only hide desyncing colgroup from the cells.
// accountScoped mirrors the existing accountId filter (every row is that one
// account, so ACCOUNT is redundant regardless of width).
export const MEMO_MIN_WIDTH = 1000;
export const ACCOUNT_MIN_WIDTH = 900;
// BALANCE is the widest of the optional columns to earn its place: it only
// says something the OUTFLOW/INFLOW pair doesn't when there is room to read
// all three side by side, so it folds first (highest threshold).
export const BALANCE_MIN_WIDTH = 1100;

// containerWidth === null/undefined means "not measured yet" (first paint,
// before the ResizeObserver reports) — treated as unconstrained so the table
// renders full columns rather than flashing a folded layout on mount.
//
// `balanceEligible` is the caller's answer to "is a running balance a TRUE
// number here?" — see Transactions.jsx (account-scoped, sorted by date, the
// range is exactly the month whose opening snapshot seeds it, and nothing is
// filtering rows out of the cumulative). Width is decided here; truth is
// decided there, because only the screen knows the range and the filters.
export function visibleColumns(columns, containerWidth, accountScoped, balanceEligible) {
  const narrow = w => containerWidth != null && containerWidth < w;
  return columns.filter(c => {
    if (c.key === 'account') return !accountScoped && !narrow(ACCOUNT_MIN_WIDTH);
    if (c.key === 'notes') return !narrow(MEMO_MIN_WIDTH);
    if (c.key === 'balance') return !!balanceEligible && !!accountScoped && !narrow(BALANCE_MIN_WIDTH);
    return true;
  });
}

// Convenience read for callers that only need the fold flags (Row /
// TxEditorRow take booleans, not a filtered array) — derived from the same
// function so the two can't disagree.
export function visibleColumnKeys(columns, containerWidth, accountScoped, balanceEligible) {
  return new Set(visibleColumns(columns, containerWidth, accountScoped, balanceEligible).map(c => c.key));
}
