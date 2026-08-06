import { describe, it, expect } from 'vitest';
import { accountBalance, hasOccurred, monthMetrics } from '../src/lib/calc.js';
import { txGroups } from '../src/lib/txRow.js';

// The real regression, with the owner's actual numbers. Balance adjustments,
// card adjustments and card payments are all stamped at a flat T12:00 by the
// actions that create them, so anyone using them before midday produced a row
// dated "later today" — which a full-timestamp guard read as the future and
// left out of every balance, with no error and no visible cause.
const EARLY = '2026-08-07T02:02';           // when the owner recorded it
const ADJ = {
  id: 'adj', date: '2026-08-07T12:00', type: 'adjustment', amount: 3200,
  status: 'cleared', accountId: 'cash', category: null, merchant: 'Balance adjustment',
};

const store = over => ({
  institutions: [], cardProducts: [], categories: [], cards: [], budgets: [], recurring: [], audit: [],
  accounts: [{ id: 'cash', nickname: 'Cash', type: 'Other', status: 'active' }],
  snapshots: [{ accountId: 'cash', month: '2026-08', amount: 100000, status: 'confirmed' }],
  transactions: [ADJ],
  ...(over || {}),
});
const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };

describe('hasOccurred is day-granular', () => {
  it('counts a noon-stamped row recorded at 2am the same day', () => {
    expect(hasOccurred(ADJ, EARLY)).toBe(true);
  });
  it('still excludes a row dated tomorrow', () => {
    expect(hasOccurred({ ...ADJ, date: '2026-08-08T00:01' }, EARLY)).toBe(false);
  });
  it('still excludes a row dated months out', () => {
    expect(hasOccurred({ ...ADJ, date: '2027-03-06T07:26' }, EARLY)).toBe(false);
  });
  it('counts anything dated before today, whatever the clock says', () => {
    expect(hasOccurred({ ...ADJ, date: '2026-08-06T23:59' }, EARLY)).toBe(true);
  });
  it('counts everything when no now is given — the safe default is unchanged', () => {
    expect(hasOccurred({ ...ADJ, date: '2099-01-01T00:00' }, null)).toBe(true);
  });
});

describe('the balance the owner actually saw', () => {
  it('includes the Rs 3,200 adjustment on the day it was made', () => {
    // Was Rs 100,000 — the adjustment existed, was listed, and counted nowhere.
    expect(accountBalance(store().accounts[0], store(), '2026-08', EARLY)).toBe(103200);
  });
  it('feeds the dashboard totals too', () => {
    expect(monthMetrics(store(), '2026-08', EARLY).totalBank).toBe(103200);
  });
  it('leaves tomorrow out of the balance', () => {
    const S = store({ transactions: [{ ...ADJ, date: '2026-08-08T12:00' }] });
    expect(accountBalance(S.accounts[0], S, '2026-08', EARLY)).toBe(100000);
  });
});

describe('the table agrees with the balance', () => {
  const RANGE = { from: '2026-08', to: '2026-08' };
  it('shows a same-day row as recorded, not folded into Scheduled', () => {
    const g = txGroups(store().transactions, store(), fmt, EARLY, RANGE, true);
    expect(g.postedRows.map(r => r.id)).toEqual(['adj']);
    expect(g.scheduled).toEqual([]);
  });
  it('still routes a genuinely future row to Scheduled', () => {
    const list = [{ ...ADJ, id: 'later', date: '2026-08-20T12:00' }];
    const g = txGroups(list, store({ transactions: list }), fmt, EARLY, RANGE, true);
    expect(g.scheduled.map(x => x.selId)).toEqual(['later']);
    expect(g.postedRows).toEqual([]);
  });
  it('never counts a row in a balance while showing it as still to come', () => {
    // The two rules are now one predicate; this pins that they cannot diverge.
    for (const date of ['2026-08-06T23:59', '2026-08-07T00:00', '2026-08-07T12:00', '2026-08-07T23:59', '2026-08-08T00:00']) {
      const t = { ...ADJ, date };
      const S = store({ transactions: [t] });
      const counted = accountBalance(S.accounts[0], S, '2026-08', EARLY) !== 100000;
      const shownAsPosted = txGroups([t], S, fmt, EARLY, RANGE, true).postedRows.length === 1;
      expect(counted).toBe(shownAsPosted);
    }
  });
});
