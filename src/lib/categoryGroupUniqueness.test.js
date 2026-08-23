import { describe, expect, it } from 'vitest';
import { duplicateCat, moveCollision } from './calc.js';
import { validate } from './validate.js';
import { validateSplit } from './splitTx.js';

// 0018: category names are unique per (type, GROUP), not plan-wide. The ungrouped
// "Other" bucket (groupId null/undefined) is one bucket — matching the DB index's
// NULLS NOT DISTINCT — so two ungrouped same-name categories still collide.

const store = () => ({
  categoryGroups: [{ id: 'g1', name: 'Barat' }, { id: 'g2', name: 'Honey Moon' }],
  categories: [
    { id: 'b-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'other-food', name: 'Food', type: 'expense', status: 'active' }, // ungrouped
  ],
});

describe('duplicateCat — group-scoped uniqueness', () => {
  it('same name+type in the SAME group is a duplicate', () => {
    expect(duplicateCat(store(), { name: 'Travelling', type: 'expense', groupId: 'g1' })).toBeTruthy();
  });
  it('same name+type in a DIFFERENT group is allowed', () => {
    expect(duplicateCat(store(), { name: 'Travelling', type: 'expense', groupId: 'g2' })).toBeNull();
  });
  it('case/whitespace-insensitive within a group', () => {
    expect(duplicateCat(store(), { name: '  travelling ', type: 'expense', groupId: 'g1' })).toBeTruthy();
  });
  it('two ungrouped same-name collide (nulls not distinct)', () => {
    expect(duplicateCat(store(), { name: 'Food', type: 'expense' })).toBeTruthy();
    expect(duplicateCat(store(), { name: 'Food', type: 'expense', groupId: null })).toBeTruthy();
  });
  it('an ungrouped name does NOT collide with a grouped one', () => {
    // "Travelling" lives in g1 only; creating one ungrouped is fine.
    expect(duplicateCat(store(), { name: 'Travelling', type: 'expense', groupId: null })).toBeNull();
  });
  it('different type is not a duplicate', () => {
    expect(duplicateCat(store(), { name: 'Travelling', type: 'income', groupId: 'g1' })).toBeNull();
  });
  it('excludeId ignores the row itself (rename in place)', () => {
    expect(duplicateCat(store(), { name: 'Travelling', type: 'expense', groupId: 'g1', excludeId: 'b-trav' })).toBeNull();
  });
});

describe('moveCollision — moving into a group that already has the name', () => {
  const s = () => ({
    categories: [
      { id: 'h-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g2' },
      { id: 'b-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'b-decor', name: 'Decor', type: 'expense', status: 'active', groupId: 'g1' },
    ],
  });
  it('flags a mover colliding with an existing target-group member', () => {
    const col = moveCollision(s(), { ids: ['h-trav'], groupId: 'g1' });
    expect(col).toBeTruthy();
    expect(col.id).toBe('h-trav'); // returns the offending category itself
  });
  it('allows a move into a group without that name', () => {
    expect(moveCollision(s(), { ids: ['h-trav'], groupId: 'gX' })).toBeNull();
  });
  it('flags two movers with the same name landing in one group', () => {
    expect(moveCollision(s(), { ids: ['h-trav', 'b-trav'], groupId: 'gX' })).toBeTruthy();
  });
  it('moving a member around within its own group is fine (self excluded)', () => {
    expect(moveCollision(s(), { ids: ['b-decor'], groupId: 'g1' })).toBeNull();
  });
});

describe('validate.category — group-aware', () => {
  it('drawer create (lands ungrouped) collides with an ungrouped same name', () => {
    const e = validate.category(store(), { name: 'Food', type: 'expense' }, {});
    expect(e.name).toBeTruthy();
  });
  it('drawer create does NOT collide with a grouped same name (create is ungrouped)', () => {
    const e = validate.category(store(), { name: 'Travelling', type: 'expense' }, {});
    expect(e.name).toBeUndefined();
  });
  it('edit collides with a sibling in the same group', () => {
    const s = store();
    s.categories.push({ id: 'b-food', name: 'Food', type: 'expense', status: 'active', groupId: 'g1' });
    s.categories.push({ id: 'b-x', name: 'X', type: 'expense', status: 'active', groupId: 'g1' });
    const e = validate.category(s, { name: 'Food', type: 'expense' }, { id: 'b-x' });
    expect(e.name).toBeTruthy();
  });
  it('edit to a name that only exists in another group is allowed', () => {
    const e = validate.category(store(), { name: 'Food', type: 'expense' }, { id: 'b-trav' }); // b-trav is in g1, Food is ungrouped
    expect(e.name).toBeUndefined();
  });
  it('editing an ungrouped category into an existing ungrouped sibling name collides', () => {
    const s = store();
    s.categories.push({ id: 'other-x', name: 'X', type: 'expense', status: 'active' }); // ungrouped
    const e = validate.category(s, { name: 'Food', type: 'expense' }, { id: 'other-x' }); // both ungrouped
    expect(e.name).toBeTruthy();
  });
});

describe('validate.transaction — inline __new category is group-scoped', () => {
  const tx = (over) => ({ type: 'expense', amount: '10', account: 'acc:a1', date: '2026-08-24', category: '__new', ...over });
  it('a __new name colliding with an existing ungrouped category is rejected', () => {
    const e = validate.transaction(store(), tx({ newCat: 'Food' }), {}); // Food is ungrouped
    expect(e.category).toBeTruthy();
  });
  it('a __new name matching a category only in a group is allowed (lands ungrouped)', () => {
    const e = validate.transaction(store(), tx({ newCat: 'Travelling' }), {}); // Travelling only in g1
    expect(e.category).toBeUndefined();
  });
  it('a __new name in its own newCatGroup collides only within that group', () => {
    const collides = validate.transaction(store(), tx({ newCat: 'Travelling', newCatGroup: 'g1' }), {});
    expect(collides.category).toBeTruthy();
    const ok = validate.transaction(store(), tx({ newCat: 'Travelling', newCatGroup: 'g2' }), {});
    expect(ok.category).toBeUndefined();
  });
  it('still requires a name for a __new line', () => {
    const e = validate.transaction(store(), tx({ newCat: '' }), {});
    expect(e.category).toBeTruthy();
  });
});

describe('validateSplit — new-category collision is group-scoped', () => {
  const line = (over) => ({ id: over.id || 'l', category: '', amount: '', newCat: '', newCatGroup: '', ...over });
  it('new category name colliding with an existing ungrouped one is rejected', () => {
    const lines = [
      line({ id: 'l1', category: '__new', newCat: 'Food', amount: '60' }), // ungrouped
      line({ id: 'l2', category: 'b-trav', amount: '40' }),
    ];
    expect(validateSplit('100', lines, store())).toMatch(/already called/i);
  });
  it('new category name matching a category in a DIFFERENT group is allowed', () => {
    const lines = [
      line({ id: 'l1', category: '__new', newCat: 'Travelling', newCatGroup: 'g2', amount: '60' }),
      line({ id: 'l2', category: 'b-trav', amount: '40' }),
    ];
    expect(validateSplit('100', lines, store())).toBeNull();
  });
  it('two __new lines with the same name in the SAME group must merge', () => {
    const lines = [
      line({ id: 'l1', category: '__new', newCat: 'Gifts', newCatGroup: 'g2', amount: '60' }),
      line({ id: 'l2', category: '__new', newCat: 'Gifts', newCatGroup: 'g2', amount: '40' }),
    ];
    expect(validateSplit('100', lines, store())).toMatch(/same new category/i);
  });
  it('two __new lines with the same name in DIFFERENT groups are allowed', () => {
    const lines = [
      line({ id: 'l1', category: '__new', newCat: 'Gifts', newCatGroup: 'g1', amount: '60' }),
      line({ id: 'l2', category: '__new', newCat: 'Gifts', newCatGroup: 'g2', amount: '40' }),
    ];
    expect(validateSplit('100', lines, store())).toBeNull();
  });
  it('two ungrouped __new lines with the same name must merge (nulls not distinct)', () => {
    const lines = [
      line({ id: 'l1', category: '__new', newCat: 'Gifts', amount: '60' }),
      line({ id: 'l2', category: '__new', newCat: 'Gifts', amount: '40' }),
    ];
    expect(validateSplit('100', lines, store())).toMatch(/same new category/i);
  });
});
