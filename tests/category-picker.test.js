import { describe, it, expect } from 'vitest';
import { categoryPickerSections, inflowPickerSections } from '../src/lib/categoryPicker.js';

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

const itemsBy = (secs, name) => (secs.find(s => s.name === name)?.items || []).map(i => i.cat.id);

describe('inflowPickerSections', () => {
  it('returns an Income section and a "Refund to…" expense section', () => {
    const secs = inflowPickerSections(S, '');
    expect(secs.map(s => s.name)).toEqual(['Income', 'Refund to…']);
    expect(itemsBy(secs, 'Income')).toEqual(['salary']);
    // Expense categories, name-sorted, flat (grouping is dropped in the refund context).
    expect(itemsBy(secs, 'Refund to…')).toEqual(['games', 'loose', 'phone', 'rent']);
    // Items carry the PlanCategoryPicker row shape so the component renders them directly.
    expect(secs[0].items[0]).toEqual({ kind: 'cat', cat: expect.objectContaining({ id: 'salary' }) });
  });

  it('excludes archived categories and any excludeIds', () => {
    const secs = inflowPickerSections(S, '', ['phone']);
    const all = secs.flatMap(s => s.items.map(i => i.cat.id));
    expect(all).not.toContain('old');    // archived
    expect(all).not.toContain('phone');  // explicitly excluded
  });

  it('filters by a case-insensitive search across both sections', () => {
    const secs = inflowPickerSections(S, 'sa');   // matches income 'Salary' only
    expect(secs.map(s => s.name)).toEqual(['Income']);
    expect(itemsBy(secs, 'Income')).toEqual(['salary']);
  });

  it('drops an empty section', () => {
    const incomeOnly = { ...S, categories: S.categories.filter(c => c.type === 'income') };
    const secs = inflowPickerSections(incomeOnly, '');
    expect(secs.map(s => s.name)).toEqual(['Income']);   // no expense cats -> no Refund section
  });
});
