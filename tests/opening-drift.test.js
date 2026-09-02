import { describe, it, expect } from 'vitest';
import { openingDrift, openingDriftLabel } from '../src/lib/openingDrift.js';
import { resyncOpening } from '../src/store/actions.js';
import { openingOf } from '../src/lib/calc.js';
import { envelopeFor } from '../src/lib/envelope.js';

// openingDrift / resyncOpening are month-agnostic (they take the snapshot's own
// month), so these fixtures pin real months rather than currentMonth().
const NOW = '2026-09-15T10:00';
const tx = (id, date, type, amount, over) => ({ id, date, type, amount, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'x', ...(over || {}) });
const store = over => ({
  institutions: [], cardProducts: [],
  categories: [{ id: 'groc', name: 'Groceries', type: 'expense', status: 'active' }],
  accounts: [
    { id: 'a1', nickname: 'Meezan', type: 'Current', status: 'active' },
    { id: 'a2', nickname: 'HBL', type: 'Current', status: 'active' },
  ],
  cards: [], budgets: [], recurring: [], audit: [], assignments: [],
  snapshots: [],
  transactions: [],
  ...(over || {}),
});
const snap = (accountId, month, amount, status, over) => ({ accountId, month, amount, status, ...(over || {}) });

// Aug opening 100,000; Aug rows net −6,000; Sep opening stored as 94,000 → consistent.
const consistent = () => store({
  snapshots: [snap('a1', '2026-08', 100000, 'confirmed'), snap('a1', '2026-09', 94000, 'pending')],
  transactions: [tx('t1', '2026-08-02T09:00', 'expense', 1000), tx('t2', '2026-08-26T09:00', 'expense', 5000)],
});

describe('openingDrift', () => {
  it('is empty when every carried opening equals the previous month’s closing', () => {
    expect(openingDrift(consistent(), NOW)).toEqual([]);
  });

  it('detects a pending opening that fell behind the previous month', () => {
    const S = consistent();
    S.transactions.push(tx('t3', '2026-08-28T09:00', 'income', 250000));
    expect(openingDrift(S, NOW)).toEqual([
      { accountId: 'a1', month: '2026-09', stored: 94000, computed: 344000, delta: 250000, status: 'pending' },
    ]);
  });

  it('detects a confirmed opening too, and reports a negative delta when it is too high', () => {
    const S = consistent();
    S.snapshots[1] = snap('a1', '2026-09', 120000, 'confirmed', { confirmedAt: '2026-09-01T09:00' });
    expect(openingDrift(S, NOW)).toEqual([
      { accountId: 'a1', month: '2026-09', stored: 120000, computed: 94000, delta: -26000, status: 'confirmed' },
    ]);
  });

  it('never judges a brand-new account’s opening (no earlier snapshot)', () => {
    const S = store({
      snapshots: [snap('a2', '2026-09', 5000, 'pending')],
      transactions: [tx('t1', '2026-08-02T09:00', 'expense', 1000, { accountId: 'a2' })],
    });
    expect(openingDrift(S, NOW)).toEqual([]);
  });

  it('skips snapshots of accounts no longer in the store', () => {
    const S = consistent();
    S.transactions.push(tx('t3', '2026-08-28T09:00', 'income', 250000));
    S.accounts = S.accounts.filter(a => a.id !== 'a1');
    expect(openingDrift(S, NOW)).toEqual([]);
  });

  it('filters to one account and sorts by month', () => {
    const S = store({
      snapshots: [
        snap('a1', '2026-07', 1000, 'confirmed'), snap('a1', '2026-08', 1000, 'confirmed'), snap('a1', '2026-09', 1000, 'pending'),
        snap('a2', '2026-08', 500, 'confirmed'), snap('a2', '2026-09', 500, 'pending'),
      ],
      transactions: [
        tx('t1', '2026-07-05T09:00', 'expense', 100),
        tx('t2', '2026-08-05T09:00', 'expense', 200),
        tx('t3', '2026-08-05T09:00', 'expense', 50, { accountId: 'a2' }),
      ],
    });
    const all = openingDrift(S, NOW);
    expect(all.map(d => [d.accountId, d.month, d.delta])).toEqual([
      ['a1', '2026-08', -100], ['a1', '2026-09', -200], ['a2', '2026-09', -50],
    ]);
    expect(openingDrift(S, NOW, { accountId: 'a2' })).toEqual([
      { accountId: 'a2', month: '2026-09', stored: 500, computed: 450, delta: -50, status: 'pending' },
    ]);
  });

  it('respects the future-date guard through `now`', () => {
    const S = consistent();
    S.transactions.push(tx('t3', '2026-08-28T09:00', 'income', 250000));
    // Viewed from inside August, before the salary lands, the Sep opening still
    // agrees with what has happened so far.
    expect(openingDrift(S, '2026-08-27T10:00')).toEqual([]);
    expect(openingDrift(S, NOW)).toHaveLength(1);
    expect(openingDrift(S)).toHaveLength(1); // unguarded = whole month, as the rollover seeds it
  });
});

describe('openingDriftLabel', () => {
  const money = n => 'Rs ' + n.toLocaleString('en-US');
  it('reads "below" when the opening is short of the closing', () => {
    const entry = { accountId: 'a1', month: '2026-09', stored: 144471, computed: 242821, delta: 98350, status: 'pending' };
    expect(openingDriftLabel(entry, money, 'Meezan')).toBe('Meezan’s Sep 2026 opening is Rs 98,350 below August’s closing');
  });
  it('reads "above" when the opening overshoots, across a year boundary', () => {
    const entry = { accountId: 'a1', month: '2027-01', stored: 5000, computed: 4000, delta: -1000, status: 'confirmed' };
    expect(openingDriftLabel(entry, money, 'HBL')).toBe('HBL’s Jan 2027 opening is Rs 1,000 above December’s closing');
  });
});

describe('resyncOpening', () => {
  const drifted = () => {
    const S = consistent();
    S.transactions.push(tx('t3', '2026-08-28T09:00', 'income', 250000));
    return S;
  };

  it('fixes a pending opening and leaves it pending', () => {
    const S = drifted();
    const next = resyncOpening(S, { accountId: 'a1', month: '2026-09', now: NOW });
    expect(next).not.toBe(S);
    const s = next.snapshots.find(x => x.accountId === 'a1' && x.month === '2026-09');
    expect(s).toMatchObject({ amount: 344000, status: 'pending' });
    expect(s.history).toBeUndefined();
    expect(s.corrected).toBeUndefined();
    expect(openingDrift(next, NOW)).toEqual([]);
    expect(S.snapshots[1].amount).toBe(94000); // input untouched
  });

  it('corrects a confirmed opening: old figure kept in history, corrected, confirmedAt bumped', () => {
    const S = drifted();
    S.snapshots[1] = snap('a1', '2026-09', 94000, 'confirmed', { confirmedAt: '2026-09-01T09:00' });
    const next = resyncOpening(S, { accountId: 'a1', month: '2026-09', now: NOW });
    const s = next.snapshots.find(x => x.accountId === 'a1' && x.month === '2026-09');
    expect(s.amount).toBe(344000);
    expect(s.status).toBe('confirmed');
    expect(s.corrected).toBe(true);
    expect(s.history).toEqual([{ amount: 94000, confirmedAt: '2026-09-01T09:00' }]);
    expect(s.confirmedAt).not.toBe('2026-09-01T09:00');
    expect(s.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('writes an account audit row naming the account, month and new figure', () => {
    const next = resyncOpening(drifted(), { accountId: 'a1', month: '2026-09', now: NOW });
    expect(next.audit[0]).toMatchObject({
      entityType: 'account', entityId: 'a1', action: 'update',
      summary: 'Re-synced Meezan opening for September 2026 to 344000',
      before: { month: '2026-09', opening: 94000, status: 'pending' },
      after: { month: '2026-09', opening: 344000, status: 'pending' },
    });
  });

  it('is the same reference when there is nothing to do', () => {
    const S = consistent();
    expect(resyncOpening(S, { accountId: 'a1', month: '2026-09', now: NOW })).toBe(S); // already in sync
    expect(resyncOpening(S, { accountId: 'a1', month: '2026-10', now: NOW })).toBe(S); // no such snapshot
    expect(resyncOpening(S, { accountId: 'zz', month: '2026-09', now: NOW })).toBe(S); // no such account
    // A brand-new account's typed opening is never re-derived (it would read as 0 + August's rows).
    const fresh = store({ snapshots: [snap('a2', '2026-09', 5000, 'pending')], transactions: [tx('t1', '2026-08-02T09:00', 'expense', 1000, { accountId: 'a2' })] });
    expect(resyncOpening(fresh, { accountId: 'a2', month: '2026-09', now: NOW })).toBe(fresh);
  });

  // RTA seeds from each account's EARLIEST confirmed snapshot
  // (envelope.js earliestOpeningSnapshots), so re-deriving a later confirmed
  // opening restates money RTA already holds and must not move it.
  it('leaves Ready to Assign unchanged when an earlier confirmed snapshot seeds it', () => {
    const S = store({
      accounts: [{ id: 'a1', nickname: 'Meezan', type: 'Current', status: 'active' }],
      snapshots: [
        snap('a1', '2026-07', 9974, 'confirmed', { confirmedAt: '2026-07-01T09:00' }),
        snap('a1', '2026-08', 9974, 'confirmed', { confirmedAt: '2026-08-01T09:00' }),
      ],
      transactions: [tx('t1', '2026-07-20T09:00', 'income', 3000)],
    });
    expect(openingDrift(S, NOW)).toEqual([{ accountId: 'a1', month: '2026-08', stored: 9974, computed: 12974, delta: 3000, status: 'confirmed' }]);
    const before = envelopeFor(S, '2026-08', NOW).rta;
    const next = resyncOpening(S, { accountId: 'a1', month: '2026-08', now: NOW });
    expect(openingOf(S.accounts[0], next.snapshots, '2026-08')).toBe(12974);
    expect(envelopeFor(next, '2026-08', NOW).rta).toBe(before);
  });

  // The real bug, in the real shape: Meezan's August opening confirmed at
  // 11,636, August rows netting +231,185, and September frozen at 144,471.
  it('regression: Meezan’s September opening re-syncs to August’s true closing', () => {
    const S = store({
      snapshots: [
        snap('a1', '2026-08', 11636, 'confirmed', { confirmedAt: '2026-08-01T09:00' }),
        snap('a1', '2026-09', 144471, 'pending'),
      ],
      transactions: [
        tx('s1', '2026-08-01T09:00', 'income', 150000),
        tx('e1', '2026-08-10T09:00', 'expense', 17165),
        tx('s2', '2026-08-31T18:00', 'income', 98350), // recorded after September's rollover had already run
      ],
    });
    const drift = openingDrift(S, NOW);
    expect(drift).toEqual([{ accountId: 'a1', month: '2026-09', stored: 144471, computed: 242821, delta: 98350, status: 'pending' }]);
    const next = resyncOpening(S, { accountId: 'a1', month: '2026-09', now: NOW });
    expect(openingOf(S.accounts[0], next.snapshots, '2026-09')).toBe(242821);
    expect(openingDrift(next, NOW)).toEqual([]);
  });
});
