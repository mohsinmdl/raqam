// Pure helpers for the register's drag-to-resize columns. The DOM drag lives in
// Transactions.jsx; the width math lives here so it gets a direct unit test.
//
// Model (see the resize handles in Transactions.jsx): the register is
// `table-layout: fixed` with PAYEE (`details`) as the one width-less column, so
// it absorbs whatever the fixed columns don't take. Resizing a fixed column
// therefore just changes ITS number — PAYEE re-flows automatically and the
// table stays 100% wide (no horizontal scroll). The clamp below is what keeps
// that promise: a column can only grow by as much as PAYEE can spare above its
// floor.

// Merge stored per-column widths over the COLUMNS defaults. Only columns that
// have a default (non-null) width can be overridden — PAYEE stays the flex
// remainder no matter what a stale stored value says — and only by a positive
// number, so a corrupt pref can't zero a column out.
export function mergeColumnWidths(columns, stored) {
  const widths = stored || {};
  return columns.map(c => {
    if (c.width == null) return c;
    const w = widths[c.key];
    return typeof w === 'number' && w > 0 ? { ...c, width: w } : c;
  });
}

// New width for the column being dragged, given a cumulative pixel delta from
// the start of the drag. `current` and `payeeWidth` are captured at drag start;
// growing this column by X shrinks PAYEE by X, so PAYEE hits `payeeMin` exactly
// when X === payeeWidth - payeeMin — that difference (never negative) is the
// most this column may grow. Shrinking is bounded only by the column's own min.
export function clampWidth({ current, delta, payeeWidth, colMin, payeeMin }) {
  const maxGrow = Math.max(0, payeeWidth - payeeMin);
  const max = current + maxGrow;
  return Math.round(Math.min(max, Math.max(colMin, current + delta)));
}

// Fit the (already-merged) widths to the CURRENT container. clampWidth only
// promises "PAYEE >= payeeMin, no horizontal scroll" for the container width
// measured at drag time; a stored width re-applied verbatim after the window or
// sidebar later narrows could squeeze PAYEE below its floor (and eventually push
// the fixed columns into a scrollbar — the invariant the feature exists to keep).
// This is the render-time guard: when the fixed columns no longer leave PAYEE its
// minimum, reclaim the shortfall from them proportionally to each column's slack
// above colMin (so a column already near the floor barely moves and none dips
// below it). Display-only — stored prefs keep the user's intended widths and
// re-expand when the room returns. Untouched before the container is measured.
export function fitColumnWidths(columns, containerWidth, { checkboxW, payeeMin, colMin }) {
  if (containerWidth == null) return columns;
  const fixed = columns.filter(c => c.width != null);
  const totalFixed = fixed.reduce((s, c) => s + c.width, 0);
  const maxFixed = containerWidth - checkboxW - payeeMin;
  if (totalFixed <= maxFixed) return columns;
  const need = totalFixed - maxFixed;
  const slackTotal = fixed.reduce((s, c) => s + Math.max(0, c.width - colMin), 0);
  // Every column already at the floor: nothing left to give, pin them at colMin.
  if (slackTotal <= 0) return columns.map(c => (c.width != null ? { ...c, width: colMin } : c));
  const shrink = Math.min(1, need / slackTotal);
  return columns.map(c => {
    if (c.width == null) return c;
    const slack = Math.max(0, c.width - colMin);
    // Floor, not round: the summed fixed widths must never creep BACK over the
    // budget through rounding (that's a 1-2px horizontal scrollbar). Flooring
    // spends at most a sub-pixel per column and hands the remainder to PAYEE.
    return { ...c, width: Math.floor(c.width - slack * shrink) };
  });
}
