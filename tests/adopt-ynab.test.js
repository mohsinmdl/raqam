import { describe, it, expect } from 'vitest';
import { adoptYnabTree, importBudgetsAsAssignments, archiveCategory } from '../src/store/actions.js';
import { YNAB_TREE, normName } from '../src/lib/ynabTree.js';
import { freshStore } from '../src/store/seed.js';

const allYnabNames = YNAB_TREE.flatMap(g => g.categories);

describe('adoptYnabTree', () => {
  it('creates the 4 groups + Other, renames matches, creates missing, leaves income alone', () => {
    const s = adoptYnabTree(freshStore());
    const groupNames = s.categoryGroups.map(g => g.name);
    expect(groupNames).toEqual(['Recoverable (advances)', 'Bills', 'Needs', 'Wants', 'Other']);
    // seed 'Transport' renamed to the YNAB display name via alias:
    expect(s.categories.find(c => c.id === 'transport').name).toBe('🚘 Transportation');
    expect(s.categories.find(c => c.id === 'rent').name).toBe('🏠 Rent/Mortgage');
    // every YNAB name exists exactly once:
    allYnabNames.forEach(n => {
      expect(s.categories.filter(c => c.name === n)).toHaveLength(1);
    });
    // Raqam-only expense category falls into Other:
    const other = s.categoryGroups.find(g => g.name === 'Other');
    expect(s.categories.find(c => c.id === 'fees').groupId).toBe(other.id);
    // income untouched:
    expect(s.categories.find(c => c.id === 'salary').groupId).toBeUndefined();
    expect(s.categories.find(c => c.id === 'salary').name).toBe('Salary');
  });

  it('is idempotent', () => {
    const once = adoptYnabTree(freshStore());
    const twice = adoptYnabTree(once);
    expect(twice).toBe(once);
  });

  it('assigns every YNAB category to its right group', () => {
    const s = adoptYnabTree(freshStore());
    const byName = Object.fromEntries(s.categoryGroups.map(g => [g.name, g.id]));
    YNAB_TREE.forEach(g => g.categories.forEach(n => {
      expect(s.categories.find(c => c.name === n).groupId).toBe(byName[g.group]);
    }));
  });

  it('leaves an archived near-match untouched and creates the active YNAB category fresh', () => {
    const archived = archiveCategory(freshStore(), { id: 'rent' });
    const s = adoptYnabTree(archived);
    // the archived 'rent' category keeps its original name/status and is never grouped:
    const archivedRent = s.categories.find(c => c.id === 'rent');
    expect(archivedRent.name).toBe('Rent');
    expect(archivedRent.status).toBe('archived');
    expect(archivedRent.groupId).toBeUndefined();
    // a fresh active '🏠 Rent/Mortgage' category is created instead, wired into Bills:
    const created = s.categories.filter(c => c.name === '🏠 Rent/Mortgage');
    expect(created).toHaveLength(1);
    expect(created[0].id).not.toBe('rent');
    expect(created[0].status).toBe('active');
    const bills = s.categoryGroups.find(g => g.name === 'Bills');
    expect(created[0].groupId).toBe(bills.id);
  });

  it('is idempotent even with an archived near-match present', () => {
    const archived = archiveCategory(freshStore(), { id: 'rent' });
    const once = adoptYnabTree(archived);
    const twice = adoptYnabTree(once);
    expect(twice).toBe(once);
  });
});

describe('importBudgetsAsAssignments', () => {
  it('copies standing category budgets into the month, skipping existing, idempotent', () => {
    const base = { ...freshStore(), budgets: [
      { id: 'b1', category: 'groceries', amount: 25000, rollover: false },
      { id: 'b2', category: null, amount: 99999, label: 'Overall monthly budget' },
    ] };
    const s1 = importBudgetsAsAssignments(base, { month: '2026-08' });
    expect(s1.assignments).toHaveLength(1);
    expect(s1.assignments[0]).toMatchObject({ category: 'groceries', month: '2026-08', amount: 25000 });
    expect(importBudgetsAsAssignments(s1, { month: '2026-08' })).toBe(s1);
  });
});
