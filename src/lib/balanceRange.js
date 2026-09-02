// Whether the register's viewed date range can honestly carry a running
// balance — and if so, which whole-month window to walk. Pure; the screen
// gates the BALANCE column and the compact PositionStrip on the result.
//
// Returns { from, to } (both 'YYYY-MM') or null. Three things must hold:
//   * both bounds are months — not days, not unbounded. Opening snapshots are
//     per-month figures, so a day-bounded range (Today / Yesterday) or All
//     Dates has no honest opening seed to start the walk from;
//   * from <= to — a reversed range has no rows and no first month;
//   * the FIRST month has an opening snapshot for this account. openingOf()
//     answers 0 for a missing row, and a walk seeded from a fabricated 0 would
//     print balances off by the whole real opening while looking perfectly
//     confident. Withdrawing the column is the honest move.
// Multi-month ranges are fine: the walk seeds from the first month's snapshot
// and runs continuously to the last (calc.js rangeBalances), never re-seeding
// at an intermediate month — so a later snapshot that drifted from the walked
// figure shows up as a visible seam, which is the point.
const isMonth = v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);

export function balanceRange(range, snapshots, accountId) {
  if (!accountId || !range) return null;
  const { from, to } = range;
  if (!isMonth(from) || !isMonth(to) || from > to) return null;
  const seeded = (snapshots || []).some(s => s.accountId === accountId && s.month === from);
  return seeded ? { from, to } : null;
}
