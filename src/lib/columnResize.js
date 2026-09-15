// Pure helpers for the register's drag-to-resize columns. The DOM drag lives in
// Transactions.jsx; the width math lives here so it gets a direct unit test.
//
// Model — proportional weights, neighbour trade. Every column (PAYEE included)
// is a weight, not an absolute px width; the rendered widths are those weights
// normalised to exactly fill the register. Because they always sum to the
// container, the table is always 100% wide with NO horizontal scrollbar, and no
// single column is a special "absorber". Dragging a divider trades width between
// the two columns it sits between (cascading rightward past any column already
// at its floor), so a resize never disturbs the columns to its left — PAYEE only
// changes when you drag one of ITS OWN edges. A window resize just re-normalises
// (all columns scale together); a folded column drops out of the weight sum and
// the rest renormalise to fill.

// Normalise per-column weights to px that sum EXACTLY to `available`. Weight for
// a column is its stored value, else the caller's default for that key, else the
// column's own default width, else a neutral fallback. The rounding remainder
// lands on the last column so the total is exact (a 1px overflow here would be a
// scrollbar). Returns null before the container has been measured (available
// null/0) so the caller can fall back to the unmeasured default layout.
export function resolveRenderedWidths(columns, stored, defaults, available) {
  if (!available || available <= 0) return null;
  const s = stored || {};
  const weights = columns.map(c => s[c.key] ?? defaults[c.key] ?? c.width ?? 100);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return available - acc;
    const px = Math.round((w / total) * available);
    acc += px;
    return px;
  });
}

// New rendered widths after dragging the divider on the right edge of column
// `index` by `delta` px (positive grows it, negative shrinks it). The total is
// always conserved, so the table stays 100% wide. Growing takes width from the
// columns to the RIGHT in order, each only down to `colMin` (cascade); shrinking
// hands the freed width to the immediate right neighbour. Columns left of the
// boundary are never touched. Integer px in, integer px out.
export function resizeNeighbors(rendered, index, delta, colMin) {
  const r = rendered.slice();
  if (delta >= 0) {
    const slack = r.slice(index + 1).reduce((sum, w) => sum + Math.max(0, w - colMin), 0);
    let take = Math.min(Math.round(delta), slack);
    r[index] += take;
    for (let j = index + 1; j < r.length && take > 0; j++) {
      const give = Math.min(take, Math.max(0, r[j] - colMin));
      r[j] -= give;
      take -= give;
    }
  } else {
    const give = Math.min(Math.round(-delta), Math.max(0, r[index] - colMin));
    r[index] -= give;
    r[index + 1] += give;
  }
  return r;
}

// Reset just the divider at `index`: re-split the combined width of columns
// `index` and `index+1` by their default weight ratio, leaving every other
// column exactly where it is (so a reset, like a drag, never disturbs the rest —
// reset-all is the way to restore the whole default layout). Total preserved.
export function resetPair(rendered, index, wA, wB, colMin) {
  const combined = rendered[index] + rendered[index + 1];
  const a = Math.max(colMin, Math.min(combined - colMin, Math.round((combined * wA) / (wA + wB))));
  const r = rendered.slice();
  r[index] = a;
  r[index + 1] = combined - a;
  return r;
}
