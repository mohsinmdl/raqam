import { describe, it, expect } from 'vitest';
import { blankLine, splitRemainder, validateSplit } from '../src/lib/splitTx.js';

const line = (category, amount, over) => ({ category, amount, newCat: '', newCatGroup: '', ...(over || {}) });

describe('splitRemainder', () => {
  it('is total minus the sum of line amounts', () => {
    expect(splitRemainder('5000', [line('groc', '2500'), line('adv', '')])).toBe(2500);
    expect(splitRemainder('5000', [line('groc', '2500'), line('adv', '2500')])).toBe(0);
  });
  it('treats unparseable amounts as zero', () => {
    expect(splitRemainder('', [line('groc', 'abc')])).toBe(0);
  });
});

describe('validateSplit', () => {
  const ok = [line('groc', '2500'), line('adv', '2500')];
  it('passes a fully assigned split', () => {
    expect(validateSplit('5000', ok)).toBeNull();
  });
  it('requires at least two lines', () => {
    expect(validateSplit('5000', [line('groc', '5000')])).toMatch(/two/i);
  });
  it('requires a category on every line', () => {
    expect(validateSplit('5000', [line('', '2500'), line('adv', '2500')])).toMatch(/category/i);
  });
  it('accepts an inline new category (__new with a name)', () => {
    expect(validateSplit('5000', [line('__new', '2500', { newCat: 'Fuel' }), line('adv', '2500')])).toBeNull();
    expect(validateSplit('5000', [line('__new', '2500'), line('adv', '2500')])).toMatch(/category/i);
  });
  it('requires every amount to be positive', () => {
    expect(validateSplit('5000', [line('groc', '0'), line('adv', '5000')])).toMatch(/amount/i);
  });
  it('requires lines to sum exactly to the total', () => {
    expect(validateSplit('5000', [line('groc', '2000'), line('adv', '2500')])).toMatch(/Rs 500/);
    expect(validateSplit('5000', [line('groc', '3000'), line('adv', '2500')])).toMatch(/exceed/i);
  });
  it('rejects the same category on two lines', () => {
    expect(validateSplit('5000', [line('groc', '2500'), line('groc', '2500')])).toMatch(/same category/i);
  });
});

describe('blankLine', () => {
  it('is an empty line shape', () => {
    expect(blankLine()).toEqual({ category: '', amount: '', newCat: '', newCatGroup: '' });
  });
});
