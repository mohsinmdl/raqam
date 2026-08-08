import { describe, it, expect } from 'vitest';
import { setCategoryNote } from '../src/store/actions.js';

const store = () => ({
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active', description: '' }],
  categoryGroups: [], assignments: [], transactions: [], budgets: [],
  accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
});

describe('setCategoryNote', () => {
  it('writes the note into description with one audit row', () => {
    const s = setCategoryNote(store(), { id: 'groc', note: 'buy in bulk' });
    expect(s.categories.find(c => c.id === 'groc').description).toBe('buy in bulk');
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'category', entityId: 'groc', action: 'update' });
    expect(s.audit[0].summary).toContain('Groceries');
  });
  it('no-ops by reference on unknown id or unchanged note', () => {
    const s0 = store();
    expect(setCategoryNote(s0, { id: 'nope', note: 'x' })).toBe(s0);
    expect(setCategoryNote(s0, { id: 'groc', note: '' })).toBe(s0);
    const s1 = setCategoryNote(s0, { id: 'groc', note: 'a' });
    expect(setCategoryNote(s1, { id: 'groc', note: 'a' })).toBe(s1);
  });
});
