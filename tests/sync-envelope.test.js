import { describe, it, expect } from 'vitest';
import { COLLECTIONS, diffStores } from '../src/store/sync.js';
import { freshStore } from '../src/store/seed.js';
import { setAssigned } from '../src/store/actions.js';

const names = COLLECTIONS.map(c => c.name);
const idx = n => names.indexOf(n);
const col = n => COLLECTIONS.find(c => c.name === n);

describe('envelope collections', () => {
  it('exist in FK-safe order', () => {
    expect(idx('categoryGroups')).toBeGreaterThan(-1);
    expect(idx('assignments')).toBeGreaterThan(-1);
    expect(idx('categoryGroups')).toBeLessThan(idx('categories'));
    expect(idx('assignments')).toBeGreaterThan(idx('categories'));
  });

  it('freshStore carries both collections empty', () => {
    const s = freshStore();
    expect(s.categoryGroups).toEqual([]);
    expect(s.assignments).toEqual([]);
  });

  it('categoryGroups rows round-trip', () => {
    const g = { id: 'g1', name: 'Bills', sortOrder: 2 };
    const row = col('categoryGroups').toRow(g);
    expect(row).toEqual({ id: 'g1', name: 'Bills', sort_order: 2 });
    expect(col('categoryGroups').fromRow(row)).toEqual(g);
  });

  it('assignments rows round-trip', () => {
    const a = { id: 'a1', category: 'groceries', month: '2026-08', amount: 25000 };
    const row = col('assignments').toRow(a);
    expect(row).toEqual({ id: 'a1', category_id: 'groceries', month: '2026-08', amount: 25000 });
    expect(col('assignments').fromRow(row)).toEqual(a);
  });

  it('categories round-trip groupId (and omit it when absent)', () => {
    const c = col('categories');
    expect(c.toRow({ id: 'x', name: 'X', type: 'expense', color: '#000', groupId: 'g1' }).group_id).toBe('g1');
    expect(c.toRow({ id: 'x', name: 'X', type: 'expense', color: '#000' }).group_id).toBe(null);
    expect(c.fromRow({ id: 'x', name: 'X', type: 'expense', color: '#000', group_id: 'g1' }).groupId).toBe('g1');
    expect(c.fromRow({ id: 'x', name: 'X', type: 'expense', color: '#000', group_id: null }).groupId).toBeUndefined();
  });
});

// I1 fix: assignments has a surrogate id AND a unique (user_id, category_id,
// month). setAssigned deletes the row at amount 0 and mints a fresh id when the
// category is assigned again — keying the differ on `id` turned that recreate
// into a delete + an insert, and pushDiff runs inserts before deletes, so the
// insert hit the still-present old row and violated the unique key (23505),
// wedging into a permanent retry loop. Identity is now the composite key,
// mirroring snapshots, so the same edit diffs as a single UPDATE.
describe('assignments composite identity (I1)', () => {
  it('keys on (category, month), not the surrogate id, and matches the server unique constraint', () => {
    const a = col('assignments');
    expect(a.keyOf({ category: 'groc', month: '2026-08' })).toBe('groc|2026-08');
    expect(a.conflictKey).toBe('user_id,category_id,month');
    expect(a.deleteKeys).toEqual(['category_id', 'month']);
  });

  it('snapshots keep declaring deleteKeys for the same generic composite-delete path', () => {
    const s = col('snapshots');
    expect(s.deleteKeys).toEqual(['account_id', 'month']);
    expect(s.conflictKey).toBe('user_id,account_id,month');
  });

  it('delete-then-recreate within one diff is a single changed push, never add+delete', () => {
    const s0 = { ...freshStore(), assignments: [{ id: 'a1', category: 'groc', month: '2026-08', amount: 5000 }] };
    let s1 = setAssigned(s0, { categoryId: 'groc', month: '2026-08', amount: 0 }); // deletes the row
    s1 = setAssigned(s1, { categoryId: 'groc', month: '2026-08', amount: 7000 }); // recreates with a NEW uid
    expect(s1.assignments).toHaveLength(1);
    expect(s1.assignments[0].id).not.toBe('a1'); // sanity: this really is a fresh row, not an in-place update

    const diff = diffStores(s0, s1);
    const push = diff.find(p => p.collection.name === 'assignments');
    expect(push.added).toHaveLength(0);
    expect(push.deletes).toHaveLength(0);
    expect(push.changed).toHaveLength(1);
    expect(push.changed[0]).toMatchObject({ category_id: 'groc', month: '2026-08', amount: 7000 });
  });
});
