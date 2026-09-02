import { describe, it, expect } from 'vitest';
import { openers } from '../src/drawers/openers.js';
import { addMonths, currentMonth, nowIso } from '../src/lib/dates.js';

// The Review-now drawer is where a user CONFIRMS — and so locks — an opening
// figure. The prefill decides which number they are shown: a carried pending
// gets the live previous-month closing (the stored row may have frozen before
// that month was finished — the Meezan drift), everything else is offered as
// stored. Pure and untested before; a regression here recreates the exact bug
// this drawer exists to prevent, but confirmed.
const month = currentMonth(), prev = addMonths(month, -1);
const tx = (id, date, type, amount, over) => ({ id, date, type, amount, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'x', ...(over || {}) });
const store = over => ({
  institutions: [], cardProducts: [],
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
  accounts: [{ id: 'a1', nickname: 'Meezan', type: 'Current', status: 'active' }],
  cards: [], budgets: [], recurring: [], audit: [], assignments: [],
  snapshots: [], transactions: [],
  ...(over || {}),
});
const open = S => { const out = {}; openers.snapshot(S, (name, form) => { out.name = name; out.form = form; }); return out; };

describe('openers.snapshot prefill', () => {
  it('carried pending: offers the LIVE previous-month closing, not the stored figure', () => {
    const S = store({
      snapshots: [
        { accountId: 'a1', month: prev, amount: 100000, status: 'confirmed' },
        { accountId: 'a1', month, amount: 94000, status: 'pending' },
      ],
      transactions: [
        tx('p1', prev + '-02T09:00', 'expense', 1000), tx('p2', prev + '-26T09:00', 'expense', 5000),
        tx('p3', prev + '-28T09:00', 'income', 250000), // entered after the rollover froze 94,000
      ],
    });
    const { name, form } = open(S);
    expect(name).toBe('snapshot');
    expect(form.snap_a1).toBe('344000');
  });

  it('brand-new account pending (no previous row): offers the typed amount back', () => {
    const S = store({ snapshots: [{ accountId: 'a1', month, amount: 5000, status: 'pending' }], transactions: [tx('p1', prev + '-02T09:00', 'expense', 1000)] });
    expect(open(S).form.snap_a1).toBe('5000');
  });

  it('pending across a GAP (previous month has no row): offers the stored amount, never a 0-seeded closing', () => {
    const S = store({
      snapshots: [
        { accountId: 'a1', month: addMonths(month, -2), amount: 50000, status: 'confirmed' },
        { accountId: 'a1', month, amount: 49000, status: 'pending' },
      ],
      transactions: [tx('p1', prev + '-02T09:00', 'expense', 1000)],
    });
    expect(open(S).form.snap_a1).toBe('49000');
  });

  it('confirmed row: offers the stored amount even when the previous month drifted', () => {
    const S = store({
      snapshots: [
        { accountId: 'a1', month: prev, amount: 100000, status: 'confirmed' },
        { accountId: 'a1', month, amount: 94000, status: 'confirmed', confirmedAt: month + '-01T09:00' },
      ],
      transactions: [tx('p3', prev + '-28T09:00', 'income', 250000)],
    });
    expect(open(S).form.snap_a1).toBe('94000');
  });

  it('no snapshot: offers the guarded current-month balance (future-dated rows excluded)', () => {
    const later = addMonths(month, 1) + '-01T09:00'; // always after nowIso()
    const S = store({
      snapshots: [],
      transactions: [tx('c1', month + '-01T00:01', 'income', 7000), tx('c2', later, 'expense', 999)],
    });
    // the pinned row is at or before now; the next-month row is not in `month` anyway,
    // so the guard is exercised with an in-month future day when one exists
    const today = nowIso().slice(0, 10);
    const inMonthFuture = today < month + '-28' ? month + '-28T23:00' : null;
    if (inMonthFuture) S.transactions.push(tx('c3', inMonthFuture, 'expense', 500));
    expect(open(S).form.snap_a1).toBe('7000');
  });

  it('skips archived accounts', () => {
    const S = store({
      accounts: [{ id: 'a1', nickname: 'Meezan', type: 'Current', status: 'active' }, { id: 'old', nickname: 'Old', type: 'Current', status: 'archived' }],
      snapshots: [{ accountId: 'old', month, amount: 1, status: 'pending' }],
    });
    expect(open(S).form).not.toHaveProperty('snap_old');
    expect(open(S).form).toHaveProperty('snap_a1');
  });
});
