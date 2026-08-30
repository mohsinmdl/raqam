import { describe, expect, it } from 'vitest';
import { buildItems, PAGES } from './buildItems.js';
import { buildActions } from './actions.js';

const data = {
  accounts: [
    { id: 'a1', nickname: 'HBL Current', type: 'Current', last4: '1234', status: 'active' },
    { id: 'a2', nickname: 'Old Savings', type: 'Savings', status: 'archived' }, // excluded
  ],
  categoryGroups: [{ id: 'g1', name: 'Food' }],
  categories: [
    { id: 'c1', name: 'Dining', type: 'expense', groupId: 'g1', status: 'active' },
    { id: 'c2', name: 'Gone', type: 'expense', status: 'archived' }, // excluded
  ],
  payees: [
    { id: 'p1', name: 'Careem' },
    { id: 'p2', name: 'Transfer mirror', transferRef: 'x' }, // excluded
    { id: 'p3', name: 'Hidden Co', hidden: true },           // excluded
  ],
};

describe('buildItems', () => {
  it('includes every page', () => {
    const ids = buildItems({ data }).filter(i => i.kind === 'page').map(i => i.id);
    expect(ids).toHaveLength(PAGES.length);
    expect(ids).toContain('page:net-worth');
  });

  it('includes only active accounts, with last4 keyword + type sublabel', () => {
    const accts = buildItems({ data }).filter(i => i.kind === 'account');
    expect(accts.map(a => a.id)).toEqual(['account:a1']);
    expect(accts[0].sublabel).toContain('Current');
    expect(accts[0].keywords).toContain('1234');
  });

  it('includes only active categories with their group as sublabel', () => {
    const cats = buildItems({ data }).filter(i => i.kind === 'category');
    expect(cats.map(c => c.id)).toEqual(['category:c1']);
    expect(cats[0].sublabel).toBe('Food');
  });

  it('excludes transfer-mirror and hidden payees', () => {
    const payees = buildItems({ data }).filter(i => i.kind === 'payee');
    expect(payees.map(p => p.id)).toEqual(['payee:p1']);
  });

  it('tolerates missing/empty data', () => {
    expect(() => buildItems({})).not.toThrow();
    expect(() => buildItems()).not.toThrow();
    expect(buildItems({ data: {} }).every(i => i.kind === 'page')).toBe(true);
  });

  it('every item has a stable id and a perform fn', () => {
    const all = [...buildItems({ data }), ...buildActions({ plans: [], openPlanId: null })];
    expect(all.every(i => typeof i.id === 'string' && typeof i.perform === 'function')).toBe(true);
    expect(new Set(all.map(i => i.id)).size).toBe(all.length); // ids unique
  });
});

describe('buildActions', () => {
  it('offers switch-plan only for other plans', () => {
    const plans = [{ id: 'pl1', name: 'Home' }, { id: 'pl2', name: 'Business' }];
    const ids = buildActions({ plans, openPlanId: 'pl1' }).map(a => a.id);
    expect(ids).toContain('action:switchPlan:pl2');
    expect(ids).not.toContain('action:switchPlan:pl1');
  });

  it('always includes the core actions', () => {
    const ids = buildActions({}).map(a => a.id);
    for (const id of ['action:addTx', 'action:addAccount', 'action:addCategory', 'action:managePayees', 'action:toggleTheme', 'action:toggleMask']) {
      expect(ids).toContain(id);
    }
  });
});
