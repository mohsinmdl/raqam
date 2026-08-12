// tests/left-to-spend.test.js
import { describe, it, expect } from 'vitest';
import { leftToSpend } from '../src/lib/leftToSpend.js';

const env = rows => ({ rows: new Map(rows) });

describe('leftToSpend', () => {
  it('sums positive available across envelopes', () => {
    expect(leftToSpend(env([
      ['groc', { available: 5000 }],
      ['rent', { available: 12000 }],
    ]))).toBe(17000);
  });
  it('ignores overspent (negative) envelopes — they are debt, not spendable money', () => {
    expect(leftToSpend(env([
      ['groc', { available: 5000 }],
      ['fuel', { available: -3000 }],
    ]))).toBe(5000);
  });
  it('is 0 for an empty envelope set', () => {
    expect(leftToSpend(env([]))).toBe(0);
  });
});
