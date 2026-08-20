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

// containerWidth === null/undefined means "not measured yet" (first paint,
// before the ResizeObserver reports) — treated as unconstrained so the table
// renders full columns rather than flashing a folded layout on mount.
export function visibleColumns(columns, containerWidth, accountScoped) {
  const narrow = w => containerWidth != null && containerWidth < w;
  return columns.filter(c => {
    if (c.key === 'account') return !accountScoped && !narrow(ACCOUNT_MIN_WIDTH);
    if (c.key === 'notes') return !narrow(MEMO_MIN_WIDTH);
    return true;
  });
}

// Convenience read for callers that only need the two fold flags (Row /
// TxEditorRow take booleans, not a filtered array) — derived from the same
// function so the two can't disagree.
export function visibleColumnKeys(columns, containerWidth, accountScoped) {
  return new Set(visibleColumns(columns, containerWidth, accountScoped).map(c => c.key));
}
