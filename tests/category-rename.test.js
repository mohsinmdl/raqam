import { describe, it, expect } from 'vitest';
import { renameCategory } from '../src/store/actions.js';

const store = () => ({
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', description: '' }],
  categoryGroups: [], assignments: [], transactions: [], budgets: [],
  accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
});

describe('renameCategory', () => {
  it('renames the category with one audit row naming old and new', () => {
    const s = renameCategory(store(), { id: 'groc', name: 'Food' });
    expect(s.categories.find(c => c.id === 'groc').name).toBe('Food');
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'category', entityId: 'groc', action: 'update' });
    expect(s.audit[0].summary).toContain('Groceries');
    expect(s.audit[0].summary).toContain('Food');
  });
  it('trims surrounding whitespace before storing', () => {
    const s = renameCategory(store(), { id: 'groc', name: '  Food  ' });
    expect(s.categories.find(c => c.id === 'groc').name).toBe('Food');
  });
  it('no-ops by reference on unknown id, empty/whitespace name, or unchanged name', () => {
    const s0 = store();
    expect(renameCategory(s0, { id: 'nope', name: 'X' })).toBe(s0);
    expect(renameCategory(s0, { id: 'groc', name: '' })).toBe(s0);
    expect(renameCategory(s0, { id: 'groc', name: '   ' })).toBe(s0);
    expect(renameCategory(s0, { id: 'groc', name: 'Groceries' })).toBe(s0);
    expect(renameCategory(s0, { id: 'groc', name: '  Groceries  ' })).toBe(s0);
  });
});
