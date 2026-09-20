import { describe, expect, it } from 'vitest';
import { buildItems, PAGES } from './buildItems.js';
import { buildActions, pickPerform } from './actions.js';

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

  it('gives only switch-plan actions an open-in-new-tab variant', () => {
    const plans = [{ id: 'pl1', name: 'Home' }, { id: 'pl2', name: 'Business' }];
    const actions = buildActions({ plans, openPlanId: 'pl1' });
    const sw = actions.find(a => a.id === 'action:switchPlan:pl2');
    const opened = [];
    sw.performNewTab({ openPlanInNewTab: id => opened.push(id) });
    expect(opened).toEqual(['pl2']);
    expect(actions.filter(a => a.performNewTab).map(a => a.id)).toEqual(['action:switchPlan:pl2']);
  });

  it('always includes the core actions', () => {
    const ids = buildActions({}).map(a => a.id);
    for (const id of ['action:addTx', 'action:addAccount', 'action:addCategory', 'action:managePayees', 'action:toggleTheme', 'action:toggleMask']) {
      expect(ids).toContain(id);
    }
  });
});

// Which of an item's handlers a palette activation runs, and whether it must
// run synchronously (window.open has to stay inside the user gesture).
describe('pickPerform', () => {
  const plain = { perform: () => 'plain' };
  const both = { perform: () => 'switch', performNewTab: () => 'new-tab' };

  it('runs the new-tab variant immediately when asked for and offered', () => {
    const { fn, immediate } = pickPerform(both, { newTab: true });
    expect(fn()).toBe('new-tab');
    expect(immediate).toBe(true);
  });

  it('ignores the modifier on an item with no new-tab variant', () => {
    const { fn, immediate } = pickPerform(plain, { newTab: true });
    expect(fn()).toBe('plain');
    expect(immediate).toBe(false);
  });

  it('never runs the new-tab variant on a plain activation', () => {
    expect(pickPerform(both, { newTab: false }).fn()).toBe('switch');
    expect(pickPerform(both).immediate).toBe(false);
  });
});
