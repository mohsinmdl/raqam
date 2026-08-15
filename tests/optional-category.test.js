// Category is optional when recording a transaction: an empty pick is valid
// (the row lands in the register's "To categorize" review flow), while a
// NON-empty pick is still fully validated (existence, type match, archived).
// buildTx must store undefined — never '' — for an empty category, because
// sync's toRow maps `r.category ?? null` and an empty string would reach
// Supabase as category_id: '' (an FK violation) instead of SQL null.
import { describe, it, expect } from 'vitest';
import { validate } from '../src/lib/validate.js';
import { buildTx } from '../src/store/actions.js';

const store = {
  accounts: [{ id: 'a1' }],
  cards: [],
  categories: [
    { id: 'c-exp', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'c-inc', name: 'Salary', type: 'income', status: 'active' },
    { id: 'c-arch', name: 'Old', type: 'expense', status: 'archived' },
  ],
};
const base = { amount: '100', date: '2026-08-16', payWith: 'acc:a1', account: 'acc:a1', merchant: '' };

describe('validate.transaction — optional category', () => {
  it.each(['expense', 'refund'])('%s with no category is valid', type => {
    expect(validate.transaction(store, { ...base, type, category: '' }).category).toBeUndefined();
  });
  it('income with no category is valid', () => {
    expect(validate.transaction(store, { ...base, type: 'income', category: '' }).category).toBeUndefined();
  });
  it('a non-empty pick is still validated: vanished id errors', () => {
    expect(validate.transaction(store, { ...base, type: 'expense', category: 'gone' }).category).toBeTruthy();
  });
  it('a non-empty pick is still validated: type mismatch errors', () => {
    expect(validate.transaction(store, { ...base, type: 'expense', category: 'c-inc' }).category).toBeTruthy();
  });
  it('a non-empty pick is still validated: archived errors (without the allow flag)', () => {
    expect(validate.transaction(store, { ...base, type: 'expense', category: 'c-arch' }).category).toBeTruthy();
  });
  it('__new without a name still errors', () => {
    expect(validate.transaction(store, { ...base, type: 'expense', category: '__new', newCat: '' }).category).toBeTruthy();
  });
  it('a valid pick still passes', () => {
    expect(validate.transaction(store, { ...base, type: 'expense', category: 'c-exp' }).category).toBeUndefined();
  });
});

describe('buildTx — empty category stored as undefined, never ""', () => {
  it.each(['expense', 'refund'])('%s', type => {
    const t = buildTx({ ...base, payWith: 'acc:a1' }, type, 100, 0, '');
    expect(t.category).toBeUndefined();
    expect('category' in t ? t.category : undefined).not.toBe('');
  });
  it('income', () => {
    const t = buildTx({ ...base }, 'income', 100, 0, '');
    expect(t.category).toBeUndefined();
  });
  it('a real category id still stores', () => {
    expect(buildTx({ ...base }, 'expense', 100, 0, 'c-exp').category).toBe('c-exp');
  });
});
