import { describe, it, expect } from 'vitest';
import { setAssigned, addCategoryGroup, renameCategoryGroup, deleteCategoryGroup, setCategoryGroup } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' }],
  assignments: [], transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

describe('setAssigned', () => {
  it('creates, updates, and removes-at-zero', () => {
    let s = setAssigned(store(), { categoryId: 'groc', month: '2026-08', amount: 5000 });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]).toMatchObject({ category: 'groc', month: '2026-08', amount: 5000 });
    s = setAssigned(s, { categoryId: 'groc', month: '2026-08', amount: 7000 });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0].amount).toBe(7000);
    s = setAssigned(s, { categoryId: 'groc', month: '2026-08', amount: 0 });
    expect(s.assignments).toHaveLength(0);
  });
  it('audits with entityType assignment and is a no-op for no change', () => {
    const s0 = store();
    const s1 = setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 100 });
    expect(s1.audit[0]).toMatchObject({ entityType: 'assignment' });
    expect(setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 0 })).toBe(s0);
  });
});

describe('group CRUD', () => {
  it('adds with a uid and next sortOrder', () => {
    const s = addCategoryGroup(store(), { name: 'Wants' });
    expect(s.categoryGroups).toHaveLength(2);
    expect(s.categoryGroups[1]).toMatchObject({ name: 'Wants', sortOrder: 2 });
  });
  it('renames', () => {
    const s = renameCategoryGroup(store(), { id: 'g1', name: 'Essentials' });
    expect(s.categoryGroups[0].name).toBe('Essentials');
  });
  it("delete clears members' groupId", () => {
    const s = deleteCategoryGroup(store(), { id: 'g1' });
    expect(s.categoryGroups).toHaveLength(0);
    expect(s.categories[0].groupId).toBeUndefined();
  });
  it('setCategoryGroup moves a category', () => {
    const s0 = addCategoryGroup(store(), { name: 'Wants' });
    const g2 = s0.categoryGroups[1].id;
    const s = setCategoryGroup(s0, { categoryId: 'groc', groupId: g2 });
    expect(s.categories[0].groupId).toBe(g2);
  });
});
