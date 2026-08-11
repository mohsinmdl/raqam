// Pure split math/validation (src/lib/splitTx.js)
import { describe, it, expect } from 'vitest';
import { blankLine, fillRemainderIndex, splitRemainder, validateSplit } from '../src/lib/splitTx.js';

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
  it('flags a NaN amount (blank) even when the other lines sum to the total', () => {
    expect(validateSplit('5000', [line('groc', ''), line('adv', '5000')])).toMatch(/amount/i);
  });
  it('flags a negative amount', () => {
    expect(validateSplit('5000', [line('groc', '-100'), line('adv', '5100')])).toMatch(/amount/i);
  });
  it('rejects two __new lines creating the same normalized name', () => {
    expect(validateSplit('5000', [line('__new', '2500', { newCat: 'Fuel' }), line('__new', '2500', { newCat: ' fuel ' })]))
      .toMatch(/same new category|merge/i);
  });
});

describe('validateSplit with a store', () => {
  const withCats = cats => ({ categories: cats });
  const S = withCats([
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'rent', name: 'Rent', type: 'expense', status: 'active' },
    { id: 'inc', name: 'Salary', type: 'income', status: 'active' },
    { id: 'arch', name: 'Old', type: 'expense', status: 'archived' },
  ]);
  it('passes when every line points at an active expense category', () => {
    expect(validateSplit('5000', [line('groc', '2500'), line('rent', '2500')], S)).toBeNull();
  });
  it('rejects a line pointing at a category that no longer exists', () => {
    expect(validateSplit('5000', [line('ghost', '2500'), line('groc', '2500')], S)).toMatch(/no longer exists/);
  });
  it('rejects a line pointing at an income category', () => {
    expect(validateSplit('5000', [line('inc', '2500'), line('groc', '2500')], S)).toMatch(/income category/);
  });
  it('rejects a line pointing at an archived category', () => {
    expect(validateSplit('5000', [line('arch', '2500'), line('groc', '2500')], S)).toMatch(/archived/);
  });
  it('rejects a __new name colliding with an existing active category, case-insensitively', () => {
    expect(validateSplit('5000', [line('__new', '2500', { newCat: 'groceries' }), line('rent', '2500')], S))
      .toMatch(/already called/);
  });
  it('still runs with no store passed (pure path unaffected)', () => {
    expect(validateSplit('5000', [line('ghost', '2500'), line('groc', '2500')])).toBeNull();
  });
});

describe('validateSplit uses the injected formatter for sum errors', () => {
  it('formats the shortfall with fmt', () => {
    const fmt = n => 'PKR ' + n;
    expect(validateSplit('5000', [line('groc', '2000'), line('adv', '2500')], null, fmt)).toBe('PKR 500 of the total is not assigned to a line.');
  });
  it('formats the overage with fmt', () => {
    const fmt = n => 'PKR ' + n;
    expect(validateSplit('5000', [line('groc', '3000'), line('adv', '2500')], null, fmt)).toBe('The lines exceed the total by PKR 500.');
  });
});

describe('blankLine', () => {
  it('is an empty line shape with a fresh id', () => {
    const l = blankLine();
    expect(l).toMatchObject({ category: '', amount: '', newCat: '', newCatGroup: '' });
    expect(l.id).toBeTruthy();
  });
  it('mints a different id each call', () => {
    expect(blankLine().id).not.toBe(blankLine().id);
  });
});

describe('fillRemainderIndex', () => {
  it('targets a fresh empty line', () => {
    expect(fillRemainderIndex([line('groc', '2500'), line('adv', '')])).toBe(1);
  });
  it('targets a stray zero line', () => {
    expect(fillRemainderIndex([line('groc', '2500'), line('adv', '0')])).toBe(1);
  });
  it('targets a line with garbage input', () => {
    expect(fillRemainderIndex([line('groc', '2500'), line('adv', 'abc')])).toBe(1);
  });
  it('returns -1 when every line already has a positive amount', () => {
    expect(fillRemainderIndex([line('groc', '2500'), line('adv', '2500')])).toBe(-1);
  });
});
