import { describe, expect, it } from 'vitest';
import { archiveCategory } from './actions.js';
import { envelopeFor } from '../lib/envelope.js';
import { currentMonth, nowIso } from '../lib/dates.js';

// Archiving a category used to only flip its status, leaving any unspent assigned
// money subtracted from RTA while the category vanished from the Plan grid —
// invisible AND still suppressing Ready to Assign. Archiving now returns that
// balance to RTA first (mirrors closeAccount zeroing an account on removal).
const M = currentMonth();

// Minimal store: one expense category funded from a 1000 opening snapshot.
const base = () => ({
  categoryGroups: [{ id: 'g1', name: 'Needs' }],
  categories: [{ id: 'c1', type: 'expense', name: 'Fuel', status: 'active', groupId: 'g1' }],
  accounts: [{ id: 'a1', nickname: 'Bank', status: 'active' }],
  snapshots: [{ accountId: 'a1', month: M, amount: 1000, status: 'confirmed' }],
  assignments: [{ id: 'x1', category: 'c1', month: M, amount: 300 }],
  transactions: [],
  audit: [],
});
const env = s => envelopeFor(s, M, nowIso());
const rta = s => env(s).rta;
const avail = (s, id) => env(s).rows.get(id)?.available ?? 0;

describe('archiveCategory returns unspent money to RTA', () => {
  it('funded category: its available flows to RTA, its envelope empties, status archived', () => {
    const s = base();
    expect(rta(s)).toBe(700);        // 1000 opening − 300 assigned
    expect(avail(s, 'c1')).toBe(300);

    const after = archiveCategory(s, { id: 'c1' });
    expect(after.categories.find(c => c.id === 'c1').status).toBe('archived');
    expect(rta(after)).toBe(1000);   // 300 returned to RTA
    expect(avail(after, 'c1')).toBe(0);
  });

  it('empty category: pure status flip, no assignment change', () => {
    const s = base();
    s.assignments = [];
    const after = archiveCategory(s, { id: 'c1' });
    expect(after.categories.find(c => c.id === 'c1').status).toBe('archived');
    expect(after.assignments).toEqual([]);
    expect(rta(after)).toBe(1000);
  });

  it('overspent category: moves no money (negative available is left to the fold)', () => {
    const s = base();
    s.assignments = [{ id: 'x1', category: 'c1', month: M, amount: 100 }];
    s.transactions = [{ id: 't1', type: 'expense', amount: 300, accountId: 'a1', category: 'c1', date: M + '-01T09:00', status: 'cleared' }];
    expect(avail(s, 'c1')).toBe(-200); // 100 assigned − 300 spent

    const after = archiveCategory(s, { id: 'c1' });
    expect(after.categories.find(c => c.id === 'c1').status).toBe('archived');
    expect(after.assignments.find(a => a.category === 'c1').amount).toBe(100); // untouched
  });

  it('unknown category id is a no-op', () => {
    const s = base();
    expect(archiveCategory(s, { id: 'nope' })).toBe(s);
  });
});
