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

  // Ship-blocker regression: an assignment-only category must NOT be deleted
  // (deleteCategory's own `used` check omits assignments and would drop the
  // rows) — it's un-grouped instead, preserving the assigned money.
  it('does NOT delete an assignment-only category — un-groups it, keeps its assignments', () => {
    const s = store();
    s.assignments.push({ id: 'x1', category: 'groc', month: '2026-08', amount: 5000 });
    const next = deleteCategoryGroupWithEmpties(s, { id: 'g1' });
    expect(next.categoryGroups.find(g => g.id === 'g1')).toBeUndefined();
    const groc = next.categories.find(c => c.id === 'groc');
    expect(groc).toBeTruthy();               // survived
    expect(groc.groupId).toBeUndefined();    // un-grouped
    expect(next.assignments.find(a => a.category === 'groc')).toBeTruthy(); // money kept
    expect(next.categories.find(c => c.id === 'food')).toBeUndefined();     // empty → deleted
  });

  // An archived category is still a real member the reducer processes: an
  // archived category with an assignment must be preserved (un-grouped), not
  // silently hard-deleted.
  it('preserves an archived category that still holds an assignment', () => {
    const s = store({
      categories: [
        { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'old', name: 'Old', type: 'expense', status: 'archived', groupId: 'g1' },
      ],
      assignments: [{ id: 'x1', category: 'old', month: '2026-08', amount: 300 }],
    });
    const next = deleteCategoryGroupWithEmpties(s, { id: 'g1' });
    expect(next.categories.find(c => c.id === 'old')).toBeTruthy();
    expect(next.assignments.find(a => a.category === 'old')).toBeTruthy();
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

  it('accumulates same-month assignments from every group category into the replacement', () => {
    const s = store({
      categoryGroups: [{ id: 'g1', name: 'Recoverable', sortOrder: 1 }, { id: 'g2', name: 'Needs', sortOrder: 2 }],
      categories: [
        { id: 'a', name: 'A', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'b', name: 'B', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'target', name: 'Target', type: 'expense', status: 'active', groupId: 'g2' },
      ],
      assignments: [
        { id: 'sa', category: 'a', month: '2026-08', amount: 1000 },
        { id: 'sb', category: 'b', month: '2026-08', amount: 2000 },
        { id: 'dt', category: 'target', month: '2026-08', amount: 500 },
      ],
    });
    const next = reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'target' });
    const aug = next.assignments.filter(x => x.month === '2026-08');
    expect(aug).toHaveLength(1);
    expect(aug[0]).toMatchObject({ category: 'target', amount: 3500 }); // 500 + 1000 + 2000
  });

  it('repoints budgets and recurring rules from every group category too', () => {
    const s = store({
      categoryGroups: [{ id: 'g1', name: 'Recoverable', sortOrder: 1 }, { id: 'g2', name: 'Needs', sortOrder: 2 }],
      categories: [
        { id: 'a', name: 'A', type: 'expense', status: 'active', groupId: 'g1' },
        { id: 'target', name: 'Target', type: 'expense', status: 'active', groupId: 'g2' },
      ],
      budgets: [{ id: 'ba', category: 'a', amount: 100 }],
      recurring: [{ id: 'ra', category: 'a', name: 'Rent', amount: 100 }],
    });
    const next = reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'target' });
    expect(next.budgets.every(b => b.category === 'target')).toBe(true);
    expect(next.recurring.every(r => r.category === 'target')).toBe(true);
  });

  it('leaves a system category behind (un-grouped) — it cannot be reassign-deleted', () => {
    const s = store({
      categoryGroups: [{ id: 'g1', name: 'Recoverable', sortOrder: 1 }, { id: 'g2', name: 'Needs', sortOrder: 2 }],
      categories: [
        { id: 'sys', name: 'Uncategorized', type: 'expense', status: 'active', groupId: 'g1', isSystem: true },
        { id: 'target', name: 'Target', type: 'expense', status: 'active', groupId: 'g2' },
      ],
      transactions: [{ id: 't1', category: 'sys', type: 'expense', amount: 100, date: '2026-08-03', accountId: 'a1' }],
    });
    const next = reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'target' });
    expect(next.categoryGroups.find(g => g.id === 'g1')).toBeUndefined();
    const sys = next.categories.find(c => c.id === 'sys');
    expect(sys).toBeTruthy();                 // system category survives
    expect(sys.groupId).toBeUndefined();      // just un-grouped
    expect(next.transactions.every(t => t.category === 'sys')).toBe(true); // its refs untouched
  });

  it('no-ops on unknown group id or unknown replacement (identity preserved)', () => {
    const s = store();
    expect(reassignDeleteCategoryGroup(s, { id: 'nope', replacementId: 'food' })).toBe(s);
    expect(reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'ghost' })).toBe(s);
  });

  it('no-ops when the replacement is inside the group being deleted', () => {
    const s = store();
    expect(reassignDeleteCategoryGroup(s, { id: 'g1', replacementId: 'food' })).toBe(s);
  });
});
