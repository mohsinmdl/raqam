import { describe, it, expect } from 'vitest';
import {
  setAssigned, addCategoryGroup, renameCategoryGroup, deleteCategoryGroup, setCategoryGroup,
  deleteCategory, reassignDeleteCategory,
} from '../src/store/actions.js';
import { catRefs } from '../src/lib/calc.js';
import { deletePolicy } from '../src/lib/validate.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' }],
  assignments: [], transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

const twoCats = () => store({
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'food', name: 'Food', type: 'expense', status: 'active', groupId: 'g1' },
  ],
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
  it('update: audits action, before and after amounts', () => {
    const s0 = store({ assignments: [{ id: 'a1', category: 'groc', month: '2026-08', amount: 100 }] });
    const s1 = setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 200 });
    expect(s1.audit[0]).toMatchObject({
      entityType: 'assignment',
      action: 'update',
      before: { amount: 100 },
      after: { amount: 200 },
    });
  });
  it('is no-op for NaN amount with no existing row', () => {
    const s0 = store();
    expect(setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: NaN })).toBe(s0);
  });
});

describe('group CRUD', () => {
  it('adds with a uid and next sortOrder', () => {
    const s = addCategoryGroup(store(), { name: 'Wants' });
    expect(s.categoryGroups).toHaveLength(2);
    expect(s.categoryGroups[1]).toMatchObject({ name: 'Wants', sortOrder: 2 });
  });
  it('add: audits as create with categoryGroup entityType', () => {
    const s = addCategoryGroup(store(), { name: 'Wants' });
    expect(s.audit[0]).toMatchObject({
      entityType: 'categoryGroup',
      action: 'create',
    });
  });
  it('add: no-op for empty/whitespace name', () => {
    const s0 = store();
    expect(addCategoryGroup(s0, { name: '' })).toBe(s0);
    expect(addCategoryGroup(s0, { name: '   ' })).toBe(s0);
  });
  it('renames', () => {
    const s = renameCategoryGroup(store(), { id: 'g1', name: 'Essentials' });
    expect(s.categoryGroups[0].name).toBe('Essentials');
  });
  it('rename: no-op for unknown id', () => {
    const s0 = store();
    expect(renameCategoryGroup(s0, { id: 'unknown', name: 'Wants' })).toBe(s0);
  });
  it('rename: no-op for same name', () => {
    const s0 = store();
    expect(renameCategoryGroup(s0, { id: 'g1', name: 'Needs' })).toBe(s0);
  });
  it("delete clears members' groupId", () => {
    const s = deleteCategoryGroup(store(), { id: 'g1' });
    expect(s.categoryGroups).toHaveLength(0);
    expect(s.categories[0].groupId).toBeUndefined();
  });
  it('delete: audits as delete action', () => {
    const s = deleteCategoryGroup(store(), { id: 'g1' });
    expect(s.audit[0]).toMatchObject({
      entityType: 'categoryGroup',
      action: 'delete',
    });
  });
  it('delete: no-op for unknown id', () => {
    const s0 = store();
    expect(deleteCategoryGroup(s0, { id: 'unknown' })).toBe(s0);
  });
  it('setCategoryGroup moves a category', () => {
    const s0 = addCategoryGroup(store(), { name: 'Wants' });
    const g2 = s0.categoryGroups[1].id;
    const s = setCategoryGroup(s0, { categoryId: 'groc', groupId: g2 });
    expect(s.categories[0].groupId).toBe(g2);
  });
  it('setCategoryGroup: audits as category update with groupId before/after', () => {
    const s0 = addCategoryGroup(store(), { name: 'Wants' });
    const g2 = s0.categoryGroups[1].id;
    const s = setCategoryGroup(s0, { categoryId: 'groc', groupId: g2 });
    expect(s.audit[0]).toMatchObject({
      entityType: 'category',
      action: 'update',
      before: { groupId: 'g1' },
      after: { groupId: g2 },
    });
  });
  it('setCategoryGroup: no-op for unknown category', () => {
    const s0 = store();
    expect(setCategoryGroup(s0, { categoryId: 'unknown', groupId: 'g1' })).toBe(s0);
  });
  it('setCategoryGroup: no-op when groupId unchanged', () => {
    const s0 = store();
    expect(setCategoryGroup(s0, { categoryId: 'groc', groupId: 'g1' })).toBe(s0);
  });
});

// I3: a category's envelope assignments are a real reference, same as a
// transaction, budget, or recurring rule — deletion has to account for them or
// the server is left with dangling assignment rows pointing at a gone category.
describe('catRefs + deletePolicy count assignments (I3)', () => {
  it('catRefs counts assignments alongside the existing ref kinds', () => {
    const s = twoCats();
    s.assignments = [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }];
    expect(catRefs(s, 'groc')).toEqual({ transactions: 0, budgets: 0, recurring: 0, assignments: 1, payees: 0, total: 1 });
    expect(catRefs(s, 'food')).toEqual({ transactions: 0, budgets: 0, recurring: 0, assignments: 0, payees: 0, total: 0 });
  });

  it('deletePolicy offers reassign — not delete — when only an assignment references the category', () => {
    const s = twoCats();
    s.assignments = [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }];
    const policy = deletePolicy(s, s.categories[0]);
    expect(policy.mode).toBe('reassign');
    expect(policy.refs.assignments).toBe(1);
  });

  it('deletePolicy still offers delete when nothing references the category, assignments included', () => {
    const s = twoCats();
    expect(deletePolicy(s, s.categories[0]).mode).toBe('delete');
  });
});

describe('deleteCategory drops assignment rows (I3)', () => {
  it('removes the category and its assignment rows together', () => {
    const s = store({ assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }] });
    const next = deleteCategory(s, { id: 'groc' });
    expect(next.categories.find(c => c.id === 'groc')).toBeUndefined();
    expect(next.assignments).toHaveLength(0);
  });

  it('still refuses (no-op) while a transaction, budget, or recurring rule uses the category', () => {
    const s = store({ transactions: [{ id: 't1', category: 'groc', type: 'expense', amount: 100 }] });
    expect(deleteCategory(s, { id: 'groc' })).toBe(s);
  });
});

describe('reassignDeleteCategory repoints and merges assignments (I3)', () => {
  it('repoints a source assignment onto the replacement when there is no collision', () => {
    const s = twoCats();
    s.assignments = [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }];
    const next = reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' });
    expect(next.assignments).toEqual([{ id: 'x1', category: 'food', month: '2026-08', amount: 5000 }]);
    expect(next.categories.find(c => c.id === 'groc')).toBeUndefined();
  });

  it('merges by summing amounts, dropping the source row, when the replacement already has that month', () => {
    const s = twoCats();
    s.assignments = [
      { id: 'src', category: 'groc', month: '2026-08', amount: 5000 },
      { id: 'dst', category: 'food', month: '2026-08', amount: 3000 },
    ];
    const next = reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' });
    expect(next.assignments).toHaveLength(1);
    expect(next.assignments[0]).toMatchObject({ id: 'dst', category: 'food', month: '2026-08', amount: 8000 });
  });

  it('a non-colliding month from the source becomes its own new row; a colliding month merges — independently', () => {
    const s = twoCats();
    s.assignments = [
      { id: 'src1', category: 'groc', month: '2026-08', amount: 5000 }, // collides with dst1
      { id: 'src2', category: 'groc', month: '2026-09', amount: 2000 }, // no collision
      { id: 'dst1', category: 'food', month: '2026-08', amount: 3000 },
    ];
    const next = reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' });
    const byMonth = Object.fromEntries(next.assignments.map(a => [a.month, a.amount]));
    expect(byMonth).toEqual({ '2026-08': 8000, '2026-09': 2000 });
    expect(next.assignments.every(a => a.category === 'food')).toBe(true);
  });

  it('audits the total reference count including assignments', () => {
    const s = twoCats();
    s.assignments = [{ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 }];
    const next = reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' });
    expect(next.audit[0]).toMatchObject({ entityType: 'category', action: 'reassign-delete' });
    expect(next.audit[0].summary).toContain('1 reference(s) moved');
  });
});

// A3: a payee's auto-categorize rule points at a category id with no FK behind
// it, so the overlay is a referrer like any other — a category delete must see
// it and a reassign must repoint it, or the rule keeps writing a dead id.
describe('payee auto-categorize rules are category references (A3)', () => {
  it('catRefs counts a payee rule and deletePolicy refuses to hard-delete', () => {
    const s = twoCats();
    s.payees = [{ id: 'p1', name: 'Imtiaz', autoCategorize: true, autoCategoryId: 'groc' }];
    expect(catRefs(s, 'groc')).toMatchObject({ payees: 1, total: 1 });
    expect(deletePolicy(s, s.categories[0]).mode).toBe('reassign');
  });

  it('deleteCategory no-ops when only a payee rule references the category', () => {
    const s = twoCats();
    s.payees = [{ id: 'p1', name: 'Imtiaz', autoCategorize: true, autoCategoryId: 'groc' }];
    expect(deleteCategory(s, { id: 'groc' })).toBe(s);
  });

  it('reassignDeleteCategory repoints the rule and counts it in the audit', () => {
    const s = twoCats();
    s.payees = [
      { id: 'p1', name: 'Imtiaz', autoCategorize: true, autoCategoryId: 'groc' },
      { id: 'p2', name: 'Other', autoCategorize: true, autoCategoryId: 'food' },
    ];
    const next = reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' });
    expect(next.payees.find(p => p.id === 'p1').autoCategoryId).toBe('food');
    expect(next.payees.find(p => p.id === 'p2').autoCategoryId).toBe('food'); // untouched
    expect(next.audit[0].summary).toContain('1 reference(s) moved');
  });

  it('leaves the collection by reference when no rule points at the category', () => {
    const s = twoCats();
    s.payees = [{ id: 'p1', name: 'Imtiaz', hidden: true }];
    expect(reassignDeleteCategory(s, { id: 'groc', replacementId: 'food' }).payees).toBe(s.payees);
  });
});
