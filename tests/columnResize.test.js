import { describe, it, expect } from 'vitest';
import { mergeColumnWidths, clampWidth, fitColumnWidths } from '../src/lib/columnResize.js';

// The register's COLUMNS array shape (only the fields the merge cares about).
const COLUMNS = [
  { key: 'account', label: 'ACCOUNT', width: 150 },
  { key: 'date', label: 'DATE', width: 120 },
  { key: 'details', label: 'PAYEE', width: null },
  { key: 'category', label: 'CATEGORY', width: 190 },
  { key: 'status', label: 'STATUS', width: 68, align: 'center' },
];

describe('mergeColumnWidths', () => {
  it('overrides a column width from stored values', () => {
    const out = mergeColumnWidths(COLUMNS, { date: 175 });
    expect(out.find(c => c.key === 'date').width).toBe(175);
  });

  it('leaves untouched columns at their default width', () => {
    const out = mergeColumnWidths(COLUMNS, { date: 175 });
    expect(out.find(c => c.key === 'category').width).toBe(190);
  });

  it('never gives the flex PAYEE column a width, even if one was stored', () => {
    const out = mergeColumnWidths(COLUMNS, { details: 400 });
    expect(out.find(c => c.key === 'details').width).toBe(null);
  });

  it('ignores non-positive or non-numeric stored widths', () => {
    const out = mergeColumnWidths(COLUMNS, { date: 0, category: -5, status: 'wide' });
    expect(out.find(c => c.key === 'date').width).toBe(120);
    expect(out.find(c => c.key === 'category').width).toBe(190);
    expect(out.find(c => c.key === 'status').width).toBe(68);
  });

  it('returns a new array and does not mutate the input columns', () => {
    const out = mergeColumnWidths(COLUMNS, { date: 175 });
    expect(out).not.toBe(COLUMNS);
    expect(COLUMNS.find(c => c.key === 'date').width).toBe(120);
  });

  it('treats missing/empty stored as the defaults', () => {
    expect(mergeColumnWidths(COLUMNS, undefined).map(c => c.width))
      .toEqual(COLUMNS.map(c => c.width));
    expect(mergeColumnWidths(COLUMNS, {}).map(c => c.width))
      .toEqual(COLUMNS.map(c => c.width));
  });
});

describe('clampWidth', () => {
  const base = { current: 120, payeeWidth: 300, colMin: 56, payeeMin: 120 };

  it('applies a positive delta when PAYEE has room to give', () => {
    expect(clampWidth({ ...base, delta: 40 })).toBe(160);
  });

  it('applies a negative delta down toward the column minimum', () => {
    expect(clampWidth({ ...base, delta: -30 })).toBe(90);
  });

  it('caps growth so PAYEE never shrinks below its minimum', () => {
    // PAYEE can spare 300 - 120 = 180, so the column tops out at 120 + 180 = 300.
    expect(clampWidth({ ...base, delta: 500 })).toBe(300);
  });

  it('never shrinks the column below its own minimum', () => {
    expect(clampWidth({ ...base, delta: -500 })).toBe(56);
  });

  it('cannot grow at all once PAYEE is already at its floor', () => {
    expect(clampWidth({ current: 200, delta: 50, payeeWidth: 120, colMin: 56, payeeMin: 120 })).toBe(200);
  });

  it('still allows shrinking when PAYEE is at its floor', () => {
    expect(clampWidth({ current: 200, delta: -40, payeeWidth: 120, colMin: 56, payeeMin: 120 })).toBe(160);
  });

  it('rounds to a whole pixel', () => {
    expect(clampWidth({ ...base, delta: 12.6 })).toBe(133);
  });
});

describe('fitColumnWidths', () => {
  // account | date | PAYEE(flex) | category | status
  const cols = [
    { key: 'account', width: 150 },
    { key: 'date', width: 120 },
    { key: 'details', width: null },
    { key: 'category', width: 200 },
    { key: 'status', width: 68 },
  ];
  const opts = { checkboxW: 34, payeeMin: 140, colMin: 56 };
  const fixedSum = c => c.filter(x => x.width != null).reduce((s, x) => s + x.width, 0);

  it('leaves widths untouched while PAYEE still has room', () => {
    // fixed sum 538 + checkbox 34 + payee 140 = 712; a 900px container has slack.
    expect(fitColumnWidths(cols, 900, opts)).toEqual(cols);
  });

  it('leaves widths untouched before the container has been measured', () => {
    expect(fitColumnWidths(cols, null, opts)).toEqual(cols);
  });

  it('shrinks fixed columns so PAYEE keeps its minimum when the container is cramped', () => {
    // container 640: PAYEE floor 140 + checkbox 34 leaves 466 for the fixed cols.
    const out = fitColumnWidths(cols, 640, opts);
    expect(fixedSum(out)).toBeLessThanOrEqual(466);
    // PAYEE stays the flex remainder (null), never given a width.
    expect(out.find(c => c.key === 'details').width).toBe(null);
  });

  it('takes the reduction proportionally to each column slack above the minimum', () => {
    const out = fitColumnWidths(cols, 640, opts);
    // account (150) and category (200) have the most slack, so they give the most;
    // status (68, near the floor) barely moves and never drops below colMin.
    const w = k => out.find(c => c.key === k).width;
    expect(w('category')).toBeLessThan(200);
    expect(w('account')).toBeLessThan(150);
    expect(w('status')).toBeGreaterThanOrEqual(opts.colMin);
    expect(200 - w('category')).toBeGreaterThan(150 - w('account')); // wider slack gives up more px
  });

  it('never drops a column below its minimum, even in an impossible container', () => {
    const out = fitColumnWidths(cols, 200, opts);
    out.filter(c => c.width != null).forEach(c => expect(c.width).toBeGreaterThanOrEqual(opts.colMin));
  });
});
