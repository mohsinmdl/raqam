import { describe, it, expect } from 'vitest';
import { inferCategoryForPayee } from '../src/lib/payees.js';

// One store exercises the whole decision tree. Categories carry status so the
// archived-guard is real; transactions give each payee a categorization
// history; two payees carry an explicit rule (one a category, one Ready-to-
// Assign) so rule-precedence is tested against a conflicting history.
const S = {
  categories: [
    { id: 'food', name: 'Food', type: 'expense', status: 'active' },
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'arch', name: 'Old', type: 'expense', status: 'archived' },
    { id: 'c9', name: 'Rule Cat', type: 'expense', status: 'active' },
  ],
  transactions: [
    // JJ: food x2, groceries x1 → plurality is food.
    { type: 'expense', merchant: 'JJ', category: 'food', date: '2026-01-01T12:00' },
    { type: 'expense', merchant: 'JJ', category: 'food', date: '2026-02-01T12:00' },
    { type: 'expense', merchant: 'jj', category: 'groc', date: '2026-03-01T12:00' },
    // JJ Store: the fuzzy-prefix target (distinct from the exact 'JJ').
    { type: 'expense', merchant: 'JJ Store', category: 'groc', date: '2026-01-05T12:00' },
    // Tie: food(old) vs groc(new), 1-1 → recency breaks it to groc.
    { type: 'expense', merchant: 'Tie', category: 'food', date: '2026-01-01T12:00' },
    { type: 'expense', merchant: 'Tie', category: 'groc', date: '2026-06-01T12:00' },
    // Blank: only ever uncategorized.
    { type: 'expense', merchant: 'Blank', date: '2026-01-01T12:00' },
    // Arch: its only category is archived.
    { type: 'expense', merchant: 'Arch', category: 'arch', date: '2026-01-01T12:00' },
    // Salaam: contains 'aa' — the short-input substring trap.
    { type: 'expense', merchant: 'Salaam', category: 'food', date: '2026-01-01T12:00' },
    // Subway: history says groceries, but a rule (below) says c9.
    { type: 'expense', merchant: 'Subway', category: 'groc', date: '2026-01-01T12:00' },
    // RtaCo: history says food, but its rule is Ready-to-Assign.
    { type: 'expense', merchant: 'RtaCo', category: 'food', date: '2026-01-01T12:00' },
    // A transfer merchant that collides with a payee name must not count.
    { type: 'transfer', merchant: 'JJ', category: 'food' },
  ],
  payees: [
    { id: 'p1', name: 'Subway', autoCategorize: true, autoCategoryId: 'c9' },
    { id: 'p2', name: 'RtaCo', autoCategorize: true, autoCategoryId: 'rta' },
  ],
};

describe('inferCategoryForPayee — history inference', () => {
  it('returns the most-frequent category for an exact payee match', () => {
    expect(inferCategoryForPayee(S, 'JJ', {})).toBe('food');
  });
  it('matches case-insensitively', () => {
    expect(inferCategoryForPayee(S, '  jj  ', {})).toBe('food');
  });
  it('picks any plurality (2-vs-1), not just a majority', () => {
    // JJ is food 2 / groc 1 → food even though it is not >50% of every leg.
    expect(inferCategoryForPayee(S, 'JJ', {})).toBe('food');
  });
  it('breaks a tie by most-recent use', () => {
    expect(inferCategoryForPayee(S, 'Tie', {})).toBe('groc');
  });
  it('ignores transfers/adjustments that share a payee name', () => {
    // The 'JJ' transfer is category food but must not inflate any count.
    expect(inferCategoryForPayee(S, 'JJ', {})).toBe('food');
  });
  it('returns null when the payee has only uncategorized history', () => {
    expect(inferCategoryForPayee(S, 'Blank', {})).toBe(null);
  });
  it('returns null when the only historical category is archived', () => {
    expect(inferCategoryForPayee(S, 'Arch', {})).toBe(null);
  });
});

describe('inferCategoryForPayee — fuzzy matching', () => {
  it('prefers an exact match over a prefix match', () => {
    // Both 'JJ' and 'JJ Store' exist; typing 'JJ' resolves to the exact one.
    expect(inferCategoryForPayee(S, 'JJ', {})).toBe('food');
  });
  it('matches a longer known payee by prefix', () => {
    // 'JJ Sto' is a prefix of 'JJ Store' (and only tier-1 for 'JJ').
    expect(inferCategoryForPayee(S, 'JJ Sto', {})).toBe('groc');
  });
  it('matches when the typed text extends a known payee', () => {
    // 'JJ Store Downtown' startsWith the known 'JJ Store'.
    expect(inferCategoryForPayee(S, 'JJ Store Downtown', {})).toBe('groc');
  });
  it('does NOT substring-match short (1-2 char) input', () => {
    // 'Salaam' contains 'aa', but 2-char input is exact-or-prefix only.
    expect(inferCategoryForPayee(S, 'aa', {})).toBe(null);
  });
  it('returns null when nothing resembles the typed payee', () => {
    expect(inferCategoryForPayee(S, 'Zzxq Unknown', {})).toBe(null);
  });
  it('returns null for empty/whitespace input', () => {
    expect(inferCategoryForPayee(S, '', {})).toBe(null);
    expect(inferCategoryForPayee(S, '   ', {})).toBe(null);
  });
});

describe('inferCategoryForPayee — rule precedence', () => {
  it('an explicit category rule wins over conflicting history', () => {
    expect(inferCategoryForPayee(S, 'Subway', {})).toBe('c9');
  });
  it('a Ready-to-Assign rule suppresses inference (leave uncategorized)', () => {
    expect(inferCategoryForPayee(S, 'RtaCo', {})).toBe(null);
  });
});

describe('inferCategoryForPayee — overwrite protection', () => {
  it('never overwrites a manually-chosen category', () => {
    expect(inferCategoryForPayee(S, 'JJ', { currentCategory: 'groc', catAuto: false })).toBe(null);
  });
  it('re-fills over a previously auto-filled category', () => {
    expect(inferCategoryForPayee(S, 'JJ', { currentCategory: 'groc', catAuto: true })).toBe('food');
  });
});

describe('inferCategoryForPayee — robustness', () => {
  it('survives an empty store', () => {
    expect(inferCategoryForPayee({ categories: [], transactions: [], payees: [] }, 'JJ', {})).toBe(null);
  });
  it('survives missing collections', () => {
    expect(inferCategoryForPayee({ transactions: [{ type: 'expense', merchant: 'JJ', category: 'food' }] }, 'JJ', {})).toBe(null);
  });
});
