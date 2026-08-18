import { describe, expect, it } from 'vitest';
import { envelopeFor } from './envelope.js';

// A cash `adjustment` moves real money into or out of an account with no envelope
// to absorb it, so — like income or an uncategorized outflow — it comes straight
// off (or onto) Ready to Assign. Before this behaviour, adjustments were excluded
// from RTA, which let a closed account's opening snapshot linger in RTA after its
// balance was zeroed (the closed-account leak) and let every reconcile drift RTA from
// the real bank balance.
const NOW = '2026-08-31T23:59';
const MONTH = '2026-08';

// Minimal store: one expense category, one account seeded at 1000 for the month.
const base = () => ({
  categories: [{ id: 'c1', type: 'expense', name: 'Food' }],
  snapshots: [{ accountId: 'a1', month: MONTH, amount: 1000, status: 'confirmed' }],
  transactions: [],
  assignments: [],
});
const tx = over => ({ id: 't1', accountId: 'a1', date: '2026-08-10T10:00', status: 'cleared', ...over });
const rtaOf = store => envelopeFor(store, MONTH, NOW).rta;

describe('cash adjustments flow into Ready to Assign', () => {
  it('baseline: opening balance alone is the RTA', () => {
    expect(rtaOf(base())).toBe(1000);
  });

  it('a positive adjustment (found money) raises RTA by its amount', () => {
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: 500 })];
    expect(rtaOf(s)).toBe(1500);
  });

  it('a negative adjustment (lost money) lowers RTA by its amount', () => {
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: -300 })];
    expect(rtaOf(s)).toBe(700);
  });

  it('closing an account nets to zero RTA impact (opening + zeroing adjustment)', () => {
    // The bug this fixes: opening stayed in RTA while the −balance close
    // adjustment was invisible, leaving the whole opening as phantom RTA.
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: -1000, adjustmentReason: 'Balance zeroed on account close' })];
    expect(rtaOf(s)).toBe(0);
  });

  it('a cardAdjustment does NOT touch RTA (card liability, not cash)', () => {
    const s = base();
    s.transactions = [{ id: 't1', cardId: 'card1', date: '2026-08-10T10:00', status: 'cleared', type: 'cardAdjustment', amount: -300 }];
    expect(rtaOf(s)).toBe(1000);
  });

  it('an adjustment dated before the seed month is already inside the opening, so it is ignored', () => {
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: -400, date: '2026-07-15T10:00' })];
    expect(rtaOf(s)).toBe(1000);
  });

  it('surfaces adjustments as a signed total (for the breakdown line), summing multiple', () => {
    const s = base();
    s.transactions = [
      tx({ id: 't1', type: 'adjustment', amount: 500 }),
      tx({ id: 't2', type: 'adjustment', amount: -300 }),
    ];
    const env = envelopeFor(s, MONTH, NOW);
    expect(env.adjustments).toBe(200);
    // Breakdown identity holds: opening + adjustments (no income/assigned/uncat here) === rta
    expect(env.openingTotal + env.adjustments).toBe(env.rta);
  });

  it('an adjustment in a prior month carries forward into the viewed month (via prevRta)', () => {
    const s = {
      categories: [{ id: 'c1', type: 'expense', name: 'Food' }],
      snapshots: [{ accountId: 'a1', month: '2026-07', amount: 1000, status: 'confirmed' }],
      transactions: [tx({ type: 'adjustment', amount: 500, date: '2026-07-10T10:00' })],
      assignments: [],
    };
    // July: opening 1000 + adjustment 500 = 1500; nothing in August, so it carries.
    expect(envelopeFor(s, '2026-08', NOW).rta).toBe(1500);
  });

  it('a pending adjustment does not move RTA until it clears', () => {
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: -400, status: 'pending' })];
    expect(rtaOf(s)).toBe(1000);
  });

  it('a future-dated adjustment (not yet occurred) is excluded even within the viewed month', () => {
    const s = base();
    s.transactions = [tx({ type: 'adjustment', amount: -400, date: '2026-08-20T10:00' })];
    expect(envelopeFor(s, MONTH, '2026-08-15T00:00').rta).toBe(1000); // now is before the 20th
  });

  it('an adjustment on an account with no confirmed snapshot still counts', () => {
    const s = base(); // a1 is snapshotted; a2 is not — seededAfter returns false for a2
    s.transactions = [{ id: 't1', accountId: 'a2', date: '2026-08-10T10:00', status: 'cleared', type: 'adjustment', amount: 250 }];
    expect(rtaOf(s)).toBe(1250);
  });
});
