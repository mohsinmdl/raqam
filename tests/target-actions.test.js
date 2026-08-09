import { describe, it, expect } from 'vitest';
import { setTarget, clearTarget, setCategoryExcluded } from '../src/store/actions.js';

const store = over => ({
  categories: [{ id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: false }],
  budgets: [{ id: 'b1', category: 'fuel', amount: 5000, rollover: false }],
  categoryGroups: [], assignments: [], transactions: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const catOf = (s, id = 'fuel') => s.categories.find(c => c.id === id);

describe('setTarget', () => {
  it('writes all three fields together with one audit row', () => {
    const s = setTarget(store(), { id: 'fuel', amount: 25000, mode: 'refill', dueDay: 15 });
    expect(catOf(s)).toMatchObject({ targetAmount: 25000, targetMode: 'refill', targetDueDay: 15 });
    expect(s.audit[0]).toMatchObject({ entityType: 'category', entityId: 'fuel', action: 'update' });
  });
  it('rounds and floors the amount; a 0 amount clears the target', () => {
    const withT = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'setaside' });
    const cleared = setTarget(withT, { id: 'fuel', amount: 0, mode: 'setaside' });
    expect(catOf(cleared).targetAmount).toBeUndefined();
    expect(catOf(cleared).targetMode).toBeUndefined();
  });
  it('no-ops by reference for a missing or excluded category, or an unchanged target', () => {
    const s0 = store();
    expect(setTarget(s0, { id: 'nope', amount: 100, mode: 'refill' })).toBe(s0);
    const ex = store({ categories: [{ id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: true }] });
    expect(setTarget(ex, { id: 'fuel', amount: 100, mode: 'refill' })).toBe(ex);
    const s1 = setTarget(s0, { id: 'fuel', amount: 5000, mode: 'refill', dueDay: null });
    expect(setTarget(s1, { id: 'fuel', amount: 5000, mode: 'refill', dueDay: null })).toBe(s1);
  });
});

describe('clearTarget', () => {
  it('nulls the target fields; no-ops when there is no target', () => {
    const s1 = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill' });
    const cleared = clearTarget(s1, { id: 'fuel' });
    expect(catOf(cleared).targetAmount).toBeUndefined();
    const noTarget = store();
    expect(clearTarget(noTarget, { id: 'fuel' })).toBe(noTarget);
  });
});

describe('setCategoryExcluded', () => {
  it('turning on clears budget AND target in one step', () => {
    const withT = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill' });
    const s = setCategoryExcluded(withT, { id: 'fuel', excluded: true });
    expect(catOf(s).excludeFromBudget).toBe(true);
    expect(catOf(s).targetAmount).toBeUndefined();
    expect(s.budgets.find(b => b.category === 'fuel')).toBeUndefined();
  });
  it('turning off just flips the flag; no-op when unchanged', () => {
    const s0 = store();
    expect(setCategoryExcluded(s0, { id: 'fuel', excluded: false })).toBe(s0); // already false
    const on = setCategoryExcluded(s0, { id: 'fuel', excluded: true });
    const off = setCategoryExcluded(on, { id: 'fuel', excluded: false });
    expect(catOf(off).excludeFromBudget).toBe(false);
  });
});
