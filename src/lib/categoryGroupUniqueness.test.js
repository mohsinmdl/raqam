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
    expect(col.mover.id).toBe('h-trav');
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
});
