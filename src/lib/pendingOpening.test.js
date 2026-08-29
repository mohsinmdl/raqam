import { describe, expect, it } from 'vitest';
import { pendingOpening, openingPendingSubtitle } from './calc.js';
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

  it('excludes a rollover pending opening when the account was confirmed in an earlier month', () => {
    // rolloverMonth re-books a pending opening every month; RTA already counts it
    // via the earlier confirmed seed (envelope.js earliestOpeningSnapshots), so
    // confirming this one would move nothing — it must not be surfaced.
    const r = pendingOpening(store({ snapshots: [
      { accountId: 'a1', month: '2026-07', amount: 9974, status: 'confirmed' },
      { accountId: 'a1', month: MONTH, amount: 9974, status: 'pending' },
    ] }), MONTH);
    expect(r.total).toBe(0);
    expect(r.snaps).toEqual([]);
  });

  it('surfaces only the genuinely-new account when mixed with a rollover re-confirm', () => {
    const r = pendingOpening(store({ snapshots: [
      { accountId: 'a1', month: '2026-07', amount: 9974, status: 'confirmed' }, // pre-existing
      { accountId: 'a1', month: MONTH, amount: 9974, status: 'pending' },       // rollover — excluded
      { accountId: 'a2', month: MONTH, amount: 500, status: 'pending' },        // new account — included
    ] }), MONTH);
    expect(r.total).toBe(500);
    expect(r.accounts).toEqual([{ id: 'a2', nick: 'HBL', amount: 500 }]);
  });
});

describe('openingPendingSubtitle', () => {
  it('one account: singular possessive and verb', () => {
    expect(openingPendingSubtitle(['RedotPay'])).toBe('RedotPay’s opening balance is pending.');
  });
  it('two accounts: joined with "and", plural verb', () => {
    expect(openingPendingSubtitle(['RedotPay', 'HBL'])).toBe('RedotPay and HBL’s opening balances are pending.');
  });
  it('three or more: "N others" with a bare plural possessive (no apostrophe-s)', () => {
    expect(openingPendingSubtitle(['RedotPay', 'HBL', 'Meezan'])).toBe('RedotPay and 2 others’ opening balances are pending.');
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

  // Regression: the rollover double-count. An account confirmed in an earlier
  // month still gets a fresh pending opening this month (rolloverMonth). RTA is
  // already seeded from the July confirmation, so confirming August moves RTA by
  // zero — and pendingOpening must not surface it (or the nudge would claim, and
  // toast, money that is already counted).
  it('does not surface a rollover pending, and confirming it leaves RTA unchanged', () => {
    const s = {
      categories: [{ id: 'c1', type: 'expense', name: 'Food' }],
      accounts: [{ id: 'a1', nickname: 'RedotPay', status: 'active' }],
      snapshots: [
        { accountId: 'a1', month: '2026-07', amount: 9974, status: 'confirmed' },
        { accountId: 'a1', month: MONTH, amount: 9974, status: 'pending' },
      ],
      transactions: [],
      assignments: [],
    };
    expect(pendingOpening(s, MONTH).total).toBe(0);
    const before = envelopeFor(s, MONTH, NOW).rta;
    const confirmed = { ...s, snapshots: s.snapshots.map(x => x.month === MONTH ? { ...x, status: 'confirmed' } : x) };
    expect(envelopeFor(confirmed, MONTH, NOW).rta).toBe(before);
  });
});
