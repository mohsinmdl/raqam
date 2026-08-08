import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/store/sync.js';
import { freshStore } from '../src/store/seed.js';

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
