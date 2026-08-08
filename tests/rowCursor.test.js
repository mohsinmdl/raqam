import { describe, it, expect } from 'vitest';
import { stepCursor, rangeBetween } from '../src/lib/rowCursor.js';

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
