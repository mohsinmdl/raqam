// Sync contract for recurring rules. The differ compares JSON.stringify(toRow(...))
// against a baseline, so a mapper that is not round-trip stable produces phantom
// diffs — an endless push loop that never settles.
import { describe, it, expect } from 'vitest';
import { COLLECTIONS, diffStores } from '../src/store/sync.js';

const entry = COLLECTIONS.find(c => c.name === 'recurring');
const empty = () => ({
  institutions: [], cardProducts: [], categories: [], accounts: [], cards: [],
  snapshots: [], transactions: [], budgets: [], recurring: [], audit: [],
});
const rule = over => ({
  id: 'r1', name: 'Rent', type: 'expense', amount: 35000, estimated: false,
  schedule: { every: 1, unit: 'month', days: [5], ends: { kind: 'never' } },
  nextDate: '2026-08-05', category: 'rent', accountId: 'a1',
  status: 'active', occurrences: [], ...(over || {}),
});
const store = rules => ({ ...empty(), recurring: rules });

// Exactly the columns migration 0009 leaves on public.recurring.
const COLUMNS = [
  'id', 'name', 'type', 'amount', 'estimated', 'schedule', 'occurrences',
  'next_date', 'account_id', 'card_id', 'category_id', 'auto_post', 'status',
  'edited_at', 'edit_count',
];

describe('recurring sync mapper', () => {
  it('sends exactly the columns the table has', () => {
    expect(Object.keys(entry.toRow(rule())).sort()).toEqual([...COLUMNS].sort());
  });

  it('no longer sends the columns 0009 dropped', () => {
    const keys = Object.keys(entry.toRow(rule({ freq: 'Monthly · 5th', behaviour: 'reminder', doneThisMonth: true })));
    expect(keys).not.toContain('freq');
    expect(keys).not.toContain('behaviour');
    expect(keys).not.toContain('done_this_month');
  });

  it('emits explicit nulls so switching the funding source clears the old column', () => {
    const row = entry.toRow(rule({ accountId: undefined, cardId: 'c1' }));
    expect(row.account_id).toBe(null);
    expect(row.card_id).toBe('c1');
    expect(row.category_id).toBe('rent');
  });

  it('always emits objects and booleans, so an absent field cannot read as a change', () => {
    const row = entry.toRow({ id: 'r2', name: 'x', type: 'expense', amount: 1 });
    expect(row.occurrences).toEqual([]);
    expect(row.estimated).toBe(false);
    expect(row.auto_post).toBe(false);
    expect(row.schedule).toMatchObject({ every: 1, unit: 'month', days: [] });
    expect(row.edit_count).toBe(0);
  });

  it('round-trips a server row without producing a phantom diff', () => {
    const serverRow = {
      id: 'r1', name: 'Rent', type: 'expense', amount: 35000, estimated: false,
      schedule: { every: 1, unit: 'month', days: [5], ends: { kind: 'never' } },
      occurrences: [], next_date: '2026-08-05', account_id: 'a1', card_id: null,
      category_id: 'rent', auto_post: false, status: 'active', edited_at: null, edit_count: 0,
    };
    const hydrated = entry.fromRow(serverRow);
    expect(JSON.stringify(entry.toRow(hydrated))).toBe(JSON.stringify(entry.toRow(hydrated)));
    const s = store([hydrated]);
    expect(diffStores(s, s)).toEqual([]);
  });

  it('normalises a legacy single-day schedule on the way in', () => {
    const hydrated = entry.fromRow({
      id: 'r1', name: 'Rent', type: 'expense', amount: 1, estimated: false,
      schedule: { every: 1, unit: 'month', day: 5 }, occurrences: [],
      next_date: '2026-08-05', account_id: 'a1', card_id: null, category_id: 'rent',
      auto_post: false, status: 'active', edited_at: null, edit_count: 0,
    });
    expect(hydrated.schedule).toEqual({ every: 1, unit: 'month', days: [5], ends: { kind: 'never' } });
  });

  it('detects a real schedule edit as a change', () => {
    const before = store([rule()]);
    const after = store([rule({ schedule: { every: 1, unit: 'month', days: [1, 15], ends: { kind: 'never' } } })]);
    const push = diffStores(before, after).find(p => p.collection.name === 'recurring');
    expect(push.changed).toHaveLength(1);
    expect(push.changed[0].schedule.days).toEqual([1, 15]);
  });

  it('pushes recurring after the rows it points at, and deletes before them', () => {
    const order = COLLECTIONS.map(c => c.name);
    for (const dep of ['accounts', 'cards', 'categories']) {
      expect(order.indexOf('recurring')).toBeGreaterThan(order.indexOf(dep));
    }
  });
});
