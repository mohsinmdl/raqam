import { describe, expect, it } from 'vitest';
import { renameCategory, setCategoryGroup, moveCategories, deleteCategoryGroup } from './actions.js';
import { normalizeName } from '../lib/calc.js';

// 0018 defense-in-depth: the mutating reducers refuse an edit that would break
// per-group name uniqueness (returning `data` unchanged), so an unvalidated
// caller can never wedge the sync push with a 23505 the way the inline Plan
// adder did. Cross-group same names are allowed.

const base = () => ({
  categoryGroups: [{ id: 'g1', name: 'Barat' }, { id: 'g2', name: 'Honey Moon' }],
  categories: [
    { id: 'b-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 0 },
    { id: 'b-decor', name: 'Decor', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 1 },
    { id: 'h-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g2', sortOrder: 0 },
    { id: 'h-food', name: 'Food', type: 'expense', status: 'active', groupId: 'g2', sortOrder: 1 },
  ],
  audit: [],
});

describe('renameCategory refuses an in-group collision', () => {
  it('rename to a sibling name in the same group is a no-op', () => {
    const s = base();
    expect(renameCategory(s, { id: 'b-decor', name: 'Travelling' })).toBe(s); // same ref = refused
  });
  it('rename to a name that only exists in another group is allowed', () => {
    const s = base();
    const after = renameCategory(s, { id: 'h-food', name: 'Decor' }); // Decor is in g1, not g2
    expect(after).not.toBe(s);
    expect(after.categories.find(c => c.id === 'h-food').name).toBe('Decor');
  });
});

describe('setCategoryGroup refuses a colliding move', () => {
  it('moving into a group that already has the name is a no-op', () => {
    const s = base();
    expect(setCategoryGroup(s, { categoryId: 'h-trav', groupId: 'g1' })).toBe(s);
  });
  it('moving into a group without the name is allowed', () => {
    const s = base();
    const after = setCategoryGroup(s, { categoryId: 'h-food', groupId: 'g1' });
    expect(after).not.toBe(s);
    expect(after.categories.find(c => c.id === 'h-food').groupId).toBe('g1');
  });
});

describe('moveCategories (drag-drop) refuses a colliding move', () => {
  it('dragging Travelling from Honey Moon onto Barat is refused', () => {
    const s = base();
    expect(moveCategories(s, { ids: ['h-trav'], groupId: 'g1', beforeId: null })).toBe(s);
  });
  it('dragging a non-colliding category across groups works', () => {
    const s = base();
    const after = moveCategories(s, { ids: ['h-food'], groupId: 'g1', beforeId: null });
    expect(after).not.toBe(s);
    expect(after.categories.find(c => c.id === 'h-food').groupId).toBe('g1');
  });
  it('two same-named movers into one group is refused', () => {
    const s = base();
    // both Travelling rows dragged into the (empty of Travelling) ungrouped bucket
    expect(moveCategories(s, { ids: ['b-trav', 'h-trav'], groupId: null, beforeId: null })).toBe(s);
  });
  it('reordering within a category’s own group is not a self-collision', () => {
    const s = base();
    const after = moveCategories(s, { ids: ['b-decor'], groupId: 'g1', beforeId: 'b-trav' });
    expect(after).not.toBe(s); // a real reposition happened, not a refusal
    expect(after.categories.find(c => c.id === 'b-decor').groupId).toBe('g1');
  });
});

describe('deleteCategoryGroup disambiguates colliding survivors', () => {
  // A group holds a category whose name also exists ungrouped. Un-grouping the
  // survivor into "Other" would break per-group uniqueness (23505 on sync), so
  // the survivor is renamed with the deleted group's name rather than collide.
  const s = () => ({
    categoryGroups: [{ id: 'g1', name: 'Barat' }],
    categories: [
      { id: 'b-trav', name: 'Travelling', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'other-trav', name: 'Travelling', type: 'expense', status: 'active' }, // ungrouped
    ],
    audit: [],
  });
  it('renames the un-grouped survivor so no two ungrouped share a name', () => {
    const after = deleteCategoryGroup(s(), { id: 'g1' });
    const ungrouped = after.categories.filter(c => c.groupId == null);
    const norms = ungrouped.map(c => c.type + '|' + normalizeName(c.name));
    expect(new Set(norms).size).toBe(norms.length); // all unique — no wedge
    expect(after.categories.find(c => c.id === 'b-trav').name).toBe('Travelling (Barat)');
    expect(after.categories.find(c => c.id === 'other-trav').name).toBe('Travelling'); // existing untouched
  });
  it('leaves a non-colliding survivor’s name alone', () => {
    const store = s();
    store.categories[1] = { id: 'other-food', name: 'Food', type: 'expense', status: 'active' };
    const after = deleteCategoryGroup(store, { id: 'g1' });
    expect(after.categories.find(c => c.id === 'b-trav').name).toBe('Travelling');
    expect(after.categories.find(c => c.id === 'b-trav').groupId).toBeUndefined();
  });
});
