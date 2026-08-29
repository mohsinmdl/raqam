import { describe, expect, it } from 'vitest';
import { pendingOpening } from './calc.js';
import { envelopeFor } from './envelope.js';

// pendingOpening surfaces the opening snapshots that are still `status:'pending'`
// for a given month — the money a freshly added account holds that Working
// Balance already counts but Ready to Assign does not (RTA gates on
// `status:'confirmed'`, see envelope.js earliestOpeningSnapshots). The Plan
// tab's RTA nudge reads this to explain, and close, that gap.
const MONTH = '2026-08';
const store = over => ({
  accounts: [
    { id: 'a1', nickname: 'RedotPay', status: 'active' },
    { id: 'a2', nickname: 'HBL', status: 'active' },
  ],
  snapshots: [],
  ...over,
});

describe('pendingOpening', () => {
  it('is zero with no pending snapshots', () => {
    const r = pendingOpening(store({ snapshots: [{ accountId: 'a1', month: MONTH, amount: 1000, status: 'confirmed' }] }), MONTH);
    expect(r.total).toBe(0);
    expect(r.snaps).toEqual([]);
    expect(r.accounts).toEqual([]);
  });

  it('surfaces a single pending opening balance with its account nickname', () => {
    const r = pendingOpening(store({ snapshots: [{ accountId: 'a1', month: MONTH, amount: 9974, status: 'pending' }] }), MONTH);
    expect(r.total).toBe(9974);
    expect(r.accounts).toEqual([{ id: 'a1', nick: 'RedotPay', amount: 9974 }]);
  });

  it('ignores confirmed snapshots and snapshots for other months', () => {
    const r = pendingOpening(store({ snapshots: [
      { accountId: 'a1', month: MONTH, amount: 9974, status: 'confirmed' },
      { accountId: 'a2', month: '2026-07', amount: 500, status: 'pending' },
    ] }), MONTH);
    expect(r.total).toBe(0);
  });

  it('sums multiple pending openings in the month', () => {
    const r = pendingOpening(store({ snapshots: [
      { accountId: 'a1', month: MONTH, amount: 9974, status: 'pending' },
      { accountId: 'a2', month: MONTH, amount: 26, status: 'pending' },
    ] }), MONTH);
    expect(r.total).toBe(10000);
    expect(r.snaps).toHaveLength(2);
  });

  it('falls back to the account id when no account row matches', () => {
    const r = pendingOpening(store({ snapshots: [{ accountId: 'ghost', month: MONTH, amount: 42, status: 'pending' }] }), MONTH);
    expect(r.accounts).toEqual([{ id: 'ghost', nick: 'ghost', amount: 42 }]);
  });
});

// The mechanism the nudge exists to close: a pending opening is withheld from
// Ready to Assign; confirming it (status -> 'confirmed') lets it in. Built
// directly (not via confirmSnapshots, which is hardwired to currentMonth()) so
// the assertion is date-independent.
describe('pending opening vs Ready to Assign', () => {
  const NOW = '2026-08-31T23:59';
  const rtaStore = status => ({
    categories: [{ id: 'c1', type: 'expense', name: 'Food' }],
    accounts: [{ id: 'a1', nickname: 'RedotPay', status: 'active' }],
    snapshots: [{ accountId: 'a1', month: MONTH, amount: 9974, status }],
    transactions: [],
    assignments: [],
  });

  it('excludes a pending opening from RTA but includes it once confirmed', () => {
    expect(envelopeFor(rtaStore('pending'), MONTH, NOW).rta).toBe(0);
    expect(envelopeFor(rtaStore('confirmed'), MONTH, NOW).rta).toBe(9974);
  });
});
