import { describe, it, expect } from 'vitest';
import { deleteCategoryGroupWithEmpties, reassignDeleteCategoryGroup } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'food', name: 'Food', type: 'expense', status: 'active', groupId: 'g1' },
  ],
  assignments: [], transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});

describe('deleteCategoryGroupWithEmpties — no orphans into Other', () => {
  it('deletes the group AND its unused categories (nothing left ungrouped)', () => {
    const next = deleteCategoryGroupWithEmpties(store(), { id: 'g1' });
    expect(next.categoryGroups.find(g => g.id === 'g1')).toBeUndefined();
    expect(next.categories.find(c => c.id === 'groc')).toBeUndefined();
    expect(next.categories.find(c => c.id === 'food')).toBeUndefined();
    const liveGroups = new Set(next.categoryGroups.map(g => g.id));
    const orphans = next.categories.filter(c => c.groupId && !liveGroups.has(c.groupId));
    expect(orphans).toHaveLength(0);
  });

  it('keeps a used category (un-grouped) but deletes the empty ones', () => {
    const s = store();
    s.transactions.push({ id: 't1', category: 'groc', type: 'expense', amount: 100, date: '2026-08-03', accountId: 'a1' });
    const next = deleteCategoryGroupWithEmpties(s, { id: 'g1' });
    expect(next.categoryGroups.find(g => g.id === 'g1')).toBeUndefined();
    const groc = next.categories.find(c => c.id === 'groc');
    expect(groc).toBeTruthy();
    expect(groc.groupId).toBeUndefined();
    expect(next.categories.find(c => c.id === 'food')).toBeUndefined();
  });

  it('no-ops on unknown group id', () => {
    const s0 = store();
    expect(deleteCategoryGroupWithEmpties(s0, { id: 'nope' })).toBe(s0);
  });
});

describe('reassignDeleteCategoryGroup — reassign every category then delete the group', () => {
  it('moves all group categories to the replacement and removes the group', () => {
    const s = store({
      categoryGroups: [{ id: 'g1', name: 'Recoverable', sortOrder: 1 }, { id: 'g2', name: 'Needs', sortOrder: 2 }],
      categories: [
        { id: 'roommate', name: 'Roommate advance', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'household', name: 'Household advance', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'target', name: 'Target', type: 'expense', status: 'active', groupId: 'g2' },
      ],
      transactions: [
        { id: 't1', category: 'roommate', type: 'expense', amount: 100, date: '2026-08-03', accountId: 'a1' },
        { id: 't2', category: 'household', type: 'expense', amount: 50, date: '2026-08-04', accountId: 'a1' },
      ],
    });
    const next = reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'target' });
    expect(next.categoryGroups.find(g => g.id === 'g1')).toBeUndefined();
    expect(next.categories.find(c => c.id === 'roommate')).toBeUndefined();
    expect(next.categories.find(c => c.id === 'household')).toBeUndefined();
    expect(next.transactions.every(t => t.category === 'target')).toBe(true);
  });

  it('no-ops when the replacement is inside the group being deleted', () => {
    const s = store();
    expect(reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'food' })).toBe(s);
  });
});
