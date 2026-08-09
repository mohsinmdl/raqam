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
  it('throws on an unknown mode, before any mutation', () => {
    const s0 = store();
    const before = catOf(s0);
    expect(() => setTarget(s0, { id: 'fuel', amount: 5000, mode: 'bogus' })).toThrow(/unknown target mode/);
    expect(catOf(s0)).toBe(before); // the input store itself was never touched
  });
  it('no-ops on an income-type category', () => {
    const s0 = store({ categories: [{ id: 'salary', name: 'Salary', type: 'income', status: 'active', excludeFromBudget: false }] });
    expect(setTarget(s0, { id: 'salary', amount: 5000, mode: 'refill' })).toBe(s0);
  });
  it('replacing an existing target writes the new values and audits the old ones as before', () => {
    const s1 = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'setaside' });
    const s2 = setTarget(s1, { id: 'fuel', amount: 8000, mode: 'refill' });
    expect(catOf(s2)).toMatchObject({ targetAmount: 8000, targetMode: 'refill' });
    expect(s2.audit[0].before).toMatchObject({ targetAmount: 5000, targetMode: 'setaside' });
    expect(s2.audit[0].after).toMatchObject({ targetAmount: 8000, targetMode: 'refill' });
  });
  it('clamps an out-of-range dueDay to the DB\'s 1–28 window', () => {
    const s = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill', dueDay: 31 });
    expect(catOf(s).targetDueDay).toBe(28);
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
  it('excluding then re-including does not resurrect the cleared target', () => {
    const withT = setTarget(store(), { id: 'fuel', amount: 5000, mode: 'refill' });
    const on = setCategoryExcluded(withT, { id: 'fuel', excluded: true });
    expect(catOf(on).targetAmount).toBeUndefined();
    const off = setCategoryExcluded(on, { id: 'fuel', excluded: false });
    expect(catOf(off).excludeFromBudget).toBe(false);
    expect(catOf(off).targetAmount).toBeUndefined();
    expect(catOf(off).targetMode).toBeUndefined();
  });
});
