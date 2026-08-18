import { describe, it, expect } from 'vitest';
import { categoryPickerSections } from '../src/lib/categoryPicker.js';

const S = {
  categoryGroups: [
    { id: 'bills', name: 'Bills', order: 0 },
    { id: 'fun', name: 'Fun', order: 1 },
  ],
  categories: [
    { id: 'rent', name: 'Rent', type: 'expense', status: 'active', groupId: 'bills' },
    { id: 'phone', name: 'Phone', type: 'expense', status: 'active', groupId: 'bills' },
    { id: 'games', name: 'Games', type: 'expense', status: 'active', groupId: 'fun' },
    { id: 'loose', name: 'Loose', type: 'expense', status: 'active' },              // ungrouped -> Other
    { id: 'old', name: 'Old', type: 'expense', status: 'archived', groupId: 'bills' }, // archived -> excluded
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },              // wrong type -> excluded
  ],
};

const idsBy = (secs, name) => (secs.find(s => s.name === name)?.cats || []).map(c => c.id);

describe('categoryPickerSections', () => {
  it('groups active categories of the type, with ungrouped under Other', () => {
    const secs = categoryPickerSections(S, 'expense', '');
    expect(idsBy(secs, 'Bills')).toEqual(['phone', 'rent']); // name-sorted (no explicit order)
    expect(idsBy(secs, 'Fun')).toEqual(['games']);
    expect(idsBy(secs, 'Other')).toEqual(['loose']);
  });

  it('excludes archived categories and the wrong type (and RTA, which is never a real category)', () => {
    const secs = categoryPickerSections(S, 'expense', '');
    const all = secs.flatMap(s => s.cats.map(c => c.id));
    expect(all).not.toContain('old');
    expect(all).not.toContain('salary');
  });

  it('lists income categories only when asked', () => {
    const secs = categoryPickerSections(S, 'income', '');
    expect(secs.flatMap(s => s.cats.map(c => c.id))).toEqual(['salary']);
  });

  it('filters by a case-insensitive search and drops emptied groups', () => {
    const secs = categoryPickerSections(S, 'expense', 'ph');
    expect(secs.map(s => s.name)).toEqual(['Bills']);       // Fun/Other emptied out
    expect(idsBy(secs, 'Bills')).toEqual(['phone']);
  });
});
