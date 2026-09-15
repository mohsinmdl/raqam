import { describe, it, expect } from 'vitest';
import { resolveRenderedWidths, resizeNeighbors, resetPair } from '../src/lib/columnResize.js';

// account | date | PAYEE | category | status
const COLS = [
  { key: 'account', width: 150 },
  { key: 'date', width: 120 },
  { key: 'details', width: null },
  { key: 'category', width: 190 },
  { key: 'status', width: 68 },
];
const DEFAULTS = { account: 150, date: 120, details: 260, category: 190, status: 68 };
const sum = a => a.reduce((s, w) => s + w, 0);

describe('resolveRenderedWidths', () => {
  it('splits the available width by weight', () => {
    const cols = [{ key: 'a', width: 100 }, { key: 'b', width: 100 }, { key: 'c', width: 100 }];
    expect(resolveRenderedWidths(cols, undefined, { a: 100, b: 100, c: 100 }, 300)).toEqual([100, 100, 100]);
  });

  it('always fills exactly the available width (no rounding drift)', () => {
    const out = resolveRenderedWidths(COLS, undefined, DEFAULTS, 977);
    expect(sum(out)).toBe(977); // remainder lands on the last column, never a scrollbar
  });

  it('gives a heavier stored weight proportionally more room', () => {
    const out = resolveRenderedWidths(COLS, { category: 400 }, DEFAULTS, 1000);
    const cat = out[COLS.findIndex(c => c.key === 'category')];
    const date = out[COLS.findIndex(c => c.key === 'date')];
    expect(cat).toBeGreaterThan(date);
  });

  it('falls back to the default weight for a column with no stored width', () => {
    // Same weights via defaults and via stored should render identically.
    const viaDefault = resolveRenderedWidths(COLS, undefined, DEFAULTS, 1000);
    const viaStored = resolveRenderedWidths(COLS, { ...DEFAULTS }, DEFAULTS, 1000);
    expect(viaStored).toEqual(viaDefault);
  });

  it('renormalizes to fill when a column has folded away', () => {
    const visible = COLS.filter(c => c.key !== 'category'); // e.g. CATEGORY folded
    const out = resolveRenderedWidths(visible, undefined, DEFAULTS, 800);
    expect(out).toHaveLength(4);
    expect(sum(out)).toBe(800);
  });

  it('returns null before the container has been measured', () => {
    expect(resolveRenderedWidths(COLS, undefined, DEFAULTS, null)).toBe(null);
    expect(resolveRenderedWidths(COLS, undefined, DEFAULTS, 0)).toBe(null);
  });
});

describe('resizeNeighbors', () => {
  const colMin = 60;

  it('grows the dragged column by taking from its right neighbour', () => {
    expect(resizeNeighbors([100, 200, 150], 0, 50, colMin)).toEqual([150, 150, 150]);
  });

  it('leaves every column to the LEFT of the boundary untouched', () => {
    // drag boundary after index 1: col 0 stays, col 1 grows, col 2 gives.
    expect(resizeNeighbors([100, 100, 100, 100], 1, 30, colMin)).toEqual([100, 130, 70, 100]);
  });

  it('cascades to the next column when the immediate neighbour is at its minimum', () => {
    // col1 already at colMin(60): it can give nothing, so col2 gives instead.
    expect(resizeNeighbors([100, 60, 150], 0, 40, colMin)).toEqual([140, 60, 110]);
  });

  it('caps growth at the total slack available to the right', () => {
    // everything to the right is already at the floor: nothing to give.
    expect(resizeNeighbors([100, 60, 60], 0, 999, colMin)).toEqual([100, 60, 60]);
  });

  it('shrinks the dragged column and hands the width to its right neighbour', () => {
    expect(resizeNeighbors([100, 200, 150], 0, -30, colMin)).toEqual([70, 230, 150]);
  });

  it('never shrinks the dragged column below its minimum', () => {
    expect(resizeNeighbors([80, 200, 150], 0, -999, colMin)).toEqual([60, 220, 150]);
  });

  it('preserves the total width in every direction (no scrollbar, always 100%)', () => {
    const start = [120, 90, 300, 140, 70];
    for (const d of [-500, -40, -1, 0, 1, 40, 500]) {
      expect(sum(resizeNeighbors(start, 2, d, colMin))).toBe(sum(start));
    }
  });

  it('rounds a fractional pixel delta', () => {
    expect(resizeNeighbors([100, 200, 150], 0, 12.6, colMin)).toEqual([113, 187, 150]);
  });
});

describe('resetPair', () => {
  const colMin = 56;

  it('re-splits the two columns at the divider by their default ratio', () => {
    // combined 400, default ratio 120:260 → 126 : 274
    expect(resetPair([100, 300, 150], 0, 120, 260, colMin)).toEqual([126, 274, 150]);
  });

  it('leaves every other column exactly where it was', () => {
    const out = resetPair([100, 300, 150, 90], 1, 100, 100, colMin);
    expect(out[0]).toBe(100); // untouched
    expect(out[3]).toBe(90);  // untouched
    expect(out[1] + out[2]).toBe(450); // the pair conserves its combined width
  });

  it('preserves the total width', () => {
    const start = [120, 300, 150];
    const out = resetPair(start, 0, 120, 260, colMin);
    expect(out.reduce((s, w) => s + w, 0)).toBe(start.reduce((s, w) => s + w, 0));
  });

  it('never puts either column below the minimum', () => {
    // default ratio would starve the second column; it's floored at colMin.
    const out = resetPair([200, 60, 150], 0, 900, 1, colMin);
    expect(out[0]).toBe(204);
    expect(out[1]).toBe(colMin);
    expect(out[0] + out[1]).toBe(260);
  });
});
