import { describe, it, expect } from 'vitest';
import { moveAssigned } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
  ],
  assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 10000 }],
  transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const amt = (s, cat) => { const a = s.assignments.find(x => x.category === cat && x.month === '2026-08'); return a ? a.amount : 0; };

describe('moveAssigned', () => {
  it('moves between two categories in one step with one audit row', () => {
    const s = moveAssigned(store(), { from: 'groc', to: 'fun', month: '2026-08', amount: 3000 });
    expect(amt(s, 'groc')).toBe(7000);
    expect(amt(s, 'fun')).toBe(3000);
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'assignment', action: 'move', after: { from: 'groc', to: 'fun', amount: 3000, month: '2026-08' } });
  });
  it('rta → category assigns; category → rta unassigns', () => {
    const a = moveAssigned(store(), { from: 'rta', to: 'fun', month: '2026-08', amount: 500 });
    expect(amt(a, 'fun')).toBe(500);
    expect(amt(a, 'groc')).toBe(10000);
    const b = moveAssigned(store(), { from: 'groc', to: 'rta', month: '2026-08', amount: 10000 });
    expect(amt(b, 'groc')).toBe(0);
    expect(b.assignments.find(x => x.category === 'groc')).toBeUndefined(); // removed at zero
  });
  it('allows the source to go negative', () => {
    const s = moveAssigned(store(), { from: 'fun', to: 'groc', month: '2026-08', amount: 200 });
    expect(amt(s, 'fun')).toBe(-200);
    expect(amt(s, 'groc')).toBe(10200);
  });
  it('no-ops by reference on invalid input', () => {
    const s0 = store();
    expect(moveAssigned(s0, { from: 'groc', to: 'groc', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'rta', to: 'rta', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'groc', to: 'fun', month: '2026-08', amount: 0 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'nope', to: 'fun', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'groc', to: 'nope', month: '2026-08', amount: 100 })).toBe(s0);
  });
  it('summary names both sides, with rta as Ready to Assign', () => {
    const s = moveAssigned(store(), { from: 'rta', to: 'fun', month: '2026-08', amount: 500 });
    expect(s.audit[0].summary).toContain('Ready to Assign');
    expect(s.audit[0].summary).toContain('Fun');
  });
  it('both sides already have rows: bump sees the fresh array from first modification', () => {
    const initial = store({ assignments: [
      { id: 'x1', category: 'groc', month: '2026-08', amount: 10000 },
      { id: 'x2', category: 'fun', month: '2026-08', amount: 5000 },
    ] });
    const s = moveAssigned(initial, { from: 'groc', to: 'fun', month: '2026-08', amount: 3000 });
    expect(amt(s, 'groc')).toBe(7000);
    expect(amt(s, 'fun')).toBe(8000);
  });
  it('input store and its rows are immutable', () => {
    const initial = store({ assignments: [
      { id: 'x1', category: 'groc', month: '2026-08', amount: 10000 },
      { id: 'x2', category: 'fun', month: '2026-08', amount: 5000 },
    ] });
    const beforeJson = JSON.stringify(initial);
    const beforeAssignments = initial.assignments;
    const beforeGrocRow = initial.assignments[0];
    const beforeFunRow = initial.assignments[1];

    const s = moveAssigned(initial, { from: 'groc', to: 'fun', month: '2026-08', amount: 3000 });

    // Input store is unchanged
    expect(initial).toBe(initial);
    expect(JSON.stringify(initial)).toBe(beforeJson);
    expect(initial.assignments).toBe(beforeAssignments);
    expect(initial.assignments[0]).toBe(beforeGrocRow);
    expect(initial.assignments[1]).toBe(beforeFunRow);
    // Individual row objects are unmutated
    expect(beforeGrocRow.amount).toBe(10000);
    expect(beforeFunRow.amount).toBe(5000);
    // Result is different
    expect(s).not.toBe(initial);
    expect(s.assignments).not.toBe(beforeAssignments);
    expect(amt(s, 'groc')).toBe(7000);
    expect(amt(s, 'fun')).toBe(8000);
  });
});
