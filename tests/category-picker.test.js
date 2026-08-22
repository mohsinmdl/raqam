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
    // Expense categories, flat (grouping dropped), name-sorted here since the
    // fixture carries no explicit sortOrder — byOrderThenName falls back to name.
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

  it('filters case-insensitively within BOTH sections at once', () => {
    const secs = inflowPickerSections(S, 'A');   // upper-case 'A' -> also proves case-insensitivity
    expect(secs.map(s => s.name)).toEqual(['Income', 'Refund to…']);
    expect(itemsBy(secs, 'Income')).toEqual(['salary']);      // 'Salary'
    expect(itemsBy(secs, 'Refund to…')).toEqual(['games']);   // 'Games' (Rent/Phone/Loose lack an 'a')
  });

  it('returns [] when nothing matches', () => {
    expect(inflowPickerSections(S, 'zzz')).toEqual([]);
  });

  it('honors sortOrder before name (Plan order, not alphabetical)', () => {
    const ordered = { categoryGroups: [], categories: [
      { id: 'zeta', name: 'Zeta', type: 'expense', status: 'active', sortOrder: 0 },
      { id: 'alpha', name: 'Alpha', type: 'expense', status: 'active', sortOrder: 1 },
    ] };
    // Zeta (sortOrder 0) leads Alpha (sortOrder 1) despite Z > A by name.
    expect(itemsBy(inflowPickerSections(ordered, ''), 'Refund to…')).toEqual(['zeta', 'alpha']);
  });

  it('drops an empty section', () => {
    const incomeOnly = { ...S, categories: S.categories.filter(c => c.type === 'income') };
    const secs = inflowPickerSections(incomeOnly, '');
    expect(secs.map(s => s.name)).toEqual(['Income']);   // no expense cats -> no Refund section
  });
});
