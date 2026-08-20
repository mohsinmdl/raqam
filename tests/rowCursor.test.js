import { describe, it, expect } from 'vitest';
import { stepCursor, rangeBetween, cursorStatusLabel } from '../src/lib/rowCursor.js';

const ids = ['a', 'b', 'c', 'd'];

describe('stepCursor', () => {
  it('moves down and up by one', () => {
    expect(stepCursor(ids, 'b', 1)).toBe('c');
    expect(stepCursor(ids, 'b', -1)).toBe('a');
  });

  it('clamps at both ends', () => {
    expect(stepCursor(ids, 'd', 1)).toBe('d');
    expect(stepCursor(ids, 'a', -1)).toBe('a');
  });

  it('seeds to the first row from null or a missing cursor', () => {
    expect(stepCursor(ids, null, 1)).toBe('a');
    expect(stepCursor(ids, null, -1)).toBe('a');
    expect(stepCursor(ids, 'z', 1)).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(stepCursor([], 'a', 1)).toBe(null);
  });
});

describe('rangeBetween', () => {
  it('returns the inclusive slice regardless of arg order', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('is a single element when both ids are equal', () => {
    expect(rangeBetween(ids, 'c', 'c')).toEqual(['c']);
  });

  it('returns [] when either id is missing', () => {
    expect(rangeBetween(ids, 'b', 'z')).toEqual([]);
    expect(rangeBetween(ids, 'z', 'b')).toEqual([]);
  });
});

// The cursor's live-region text. The accent bar that marks the cursor is
// visual only; this is what a screen reader is told after every move.
const rows = [
  { id: 'a', merchant: 'Subway', a11yName: 'Subway', dateLabel: '26 Aug' },
  { id: 'b', merchant: 'Careem', a11yName: 'Careem', dateLabel: '25 Aug' },
  { id: 'c', merchant: '—', a11yName: 'adjustment', dateLabel: '24 Aug' },
];

describe('cursorStatusLabel', () => {
  it('names the position, the row and its date', () => {
    expect(cursorStatusLabel(rows, 'a', new Set())).toBe('Row 1 of 3: Subway, 26 Aug');
    expect(cursorStatusLabel(rows, 'b', new Set())).toBe('Row 2 of 3: Careem, 25 Aug');
  });

  it('reports selection, which is what Space toggles', () => {
    expect(cursorStatusLabel(rows, 'b', new Set(['b']))).toBe('Row 2 of 3: Careem, 25 Aug — selected');
    expect(cursorStatusLabel(rows, 'b', new Set(['a']))).toBe('Row 2 of 3: Careem, 25 Aug');
  });

  it('uses the row a11y name, never the printed em dash', () => {
    expect(cursorStatusLabel(rows, 'c', new Set())).toBe('Row 3 of 3: adjustment, 24 Aug');
  });

  it('falls back to the merchant when a row carries no a11y name', () => {
    expect(cursorStatusLabel([{ id: 'x', merchant: 'Daraz', dateLabel: '1 Aug' }], 'x', new Set()))
      .toBe('Row 1 of 1: Daraz, 1 Aug');
  });

  it('says nothing without a cursor, with no rows, or for a row that left the list', () => {
    expect(cursorStatusLabel(rows, null, new Set())).toBe('');
    expect(cursorStatusLabel([], 'a', new Set())).toBe('');
    expect(cursorStatusLabel(rows, 'gone', new Set())).toBe('');
  });
});
