import { describe, it, expect } from 'vitest';
import { reorderCategoryGroup } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [
    { id: 'g1', name: 'Needs', sortOrder: 0 },
    { id: 'g2', name: 'Wants', sortOrder: 1 },
    { id: 'g3', name: 'Savings', sortOrder: 2 },
  ],
  categories: [], assignments: [], transactions: [], budgets: [], recurring: [],
  accounts: [], cards: [], snapshots: [], audit: [],
  ...(over || {}),
});

const order = data =>
  [...data.categoryGroups]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
    .map(g => g.id);

describe('reorderCategoryGroup — goal A', () => {
  it('moves g3 before g1 and renumbers 0..n', () => {
    const next = reorderCategoryGroup(store(), { id: 'g3', beforeId: 'g1' });
    expect(order(next)).toEqual(['g3', 'g1', 'g2']);
    expect(next.categoryGroups.map(g => g.sortOrder).sort()).toEqual([0, 1, 2]);
  });
  it('beforeId null moves the group to the end', () => {
    const next = reorderCategoryGroup(store(), { id: 'g1', beforeId: null });
    expect(order(next)).toEqual(['g2', 'g3', 'g1']);
  });
  it('writes one reorder audit row', () => {
    const next = reorderCategoryGroup(store(), { id: 'g3', beforeId: 'g1' });
    expect(next.audit[0]).toMatchObject({ entityType: 'categoryGroup', entityId: 'g3', action: 'update' });
  });
});

describe('reorderCategoryGroup — no-op identity', () => {
  it('id === beforeId → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'g1', beforeId: 'g1' })).toBe(s);
  });
  it('unknown id → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'ghost', beforeId: 'g1' })).toBe(s);
  });
  it('dropping into the identical position → same reference', () => {
    const s = store();
    expect(reorderCategoryGroup(s, { id: 'g1', beforeId: 'g2' })).toBe(s);
  });
});
