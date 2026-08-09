import { describe, it, expect } from 'vitest';
import { moveCategories } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [
    { id: 'g1', name: 'Needs', sortOrder: 0 },
    { id: 'g2', name: 'Wants', sortOrder: 1 },
  ],
  categories: [
    { id: 'a', name: 'A', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 0 },
    { id: 'b', name: 'B', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 1 },
    { id: 'c', name: 'C', type: 'expense', status: 'active', groupId: 'g1', sortOrder: 2 },
    { id: 'x', name: 'X', type: 'expense', status: 'active', groupId: 'g2', sortOrder: 0 },
  ],
  assignments: [], transactions: [], budgets: [], recurring: [], accounts: [], cards: [], snapshots: [], audit: [],
  ...(over || {}),
});

const orderIn = (data, groupId) =>
  data.categories
    .filter(c => (c.groupId ?? null) === groupId)
    .sort((p, q) => (p.sortOrder || 0) - (q.sortOrder || 0) || p.name.localeCompare(q.name))
    .map(c => c.id);

describe('moveCategories — within-group reorder (B)', () => {
  it('moves C to the front of its own group and renumbers 0..n', () => {
    const next = moveCategories(store(), { ids: ['c'], groupId: 'g1', beforeId: 'a' });
    expect(orderIn(next, 'g1')).toEqual(['c', 'a', 'b']);
    expect(next.categories.filter(c => c.groupId === 'g1').map(c => c.sortOrder).sort()).toEqual([0, 1, 2]);
  });
  it('append (beforeId null) puts the mover last', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: 'g1', beforeId: null });
    expect(orderIn(next, 'g1')).toEqual(['b', 'c', 'a']);
  });
});

describe('moveCategories — cross-group move (C)', () => {
  it('moves A into g2 before X and stamps + audits the group change', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: 'g2', beforeId: 'x' });
    expect(orderIn(next, 'g2')).toEqual(['a', 'x']);
    expect(orderIn(next, 'g1')).toEqual(['b', 'c']);
    const moved = next.categories.find(c => c.id === 'a');
    expect(moved.groupId).toBe('g2');
    expect(moved.editCount).toBe(1); // stampUpdate ran on the real move
    expect(next.audit[0]).toMatchObject({ entityType: 'category', entityId: 'a', action: 'update' });
  });
});

describe('moveCategories — multi-drag (D)', () => {
  it('lands multiple ids contiguously in given order at the drop point', () => {
    const next = moveCategories(store(), { ids: ['a', 'c'], groupId: 'g2', beforeId: 'x' });
    expect(orderIn(next, 'g2')).toEqual(['a', 'c', 'x']);
    expect(orderIn(next, 'g1')).toEqual(['b']);
  });
});

describe('moveCategories — ungroup into Other', () => {
  it('groupId:null removes the group membership', () => {
    const next = moveCategories(store(), { ids: ['a'], groupId: null, beforeId: null });
    const moved = next.categories.find(c => c.id === 'a');
    expect(moved.groupId).toBeUndefined();
  });
});

describe('moveCategories — pure reorder emits no audit', () => {
  it('reorder within a group adds no audit rows and no edit stamp', () => {
    const next = moveCategories(store(), { ids: ['c'], groupId: 'g1', beforeId: 'a' });
    expect(next.audit).toHaveLength(0);
    expect(next.categories.find(c => c.id === 'c').editCount).toBeUndefined();
  });
});

describe('moveCategories — no-op identity', () => {
  it('unknown target group → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: ['a'], groupId: 'ghost', beforeId: null })).toBe(s);
  });
  it('empty / all-unknown ids → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: [], groupId: 'g1', beforeId: null })).toBe(s);
    expect(moveCategories(s, { ids: ['nope'], groupId: 'g1', beforeId: null })).toBe(s);
  });
  it('dropping in the identical position → same reference', () => {
    const s = store();
    expect(moveCategories(s, { ids: ['b'], groupId: 'g1', beforeId: 'c' })).toBe(s);
  });
  it('dropping onto one of the dragged rows (beforeId is a mover) → same reference, not move-to-end', () => {
    const s = store();
    // Single row released over itself must not silently jump to the bottom.
    expect(moveCategories(s, { ids: ['a'], groupId: 'g1', beforeId: 'a' })).toBe(s);
    // Multi-selection released over one of the selected rows is likewise a no-op.
    expect(moveCategories(s, { ids: ['a', 'c'], groupId: 'g1', beforeId: 'c' })).toBe(s);
  });
});
