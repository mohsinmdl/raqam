// The register's BALANCE column. The whole point of this column is that its
// last value IS the balance the header strip prints — so the last test here
// checks exactly that, against accountBalance() itself rather than against a
// number copied out of it.
import { describe, expect, it } from 'vitest';
import { withRunningBalances, txGroups } from './txRow.js';
import { accountBalance, rangeBalances } from './calc.js';
import { inRange } from './dateRange.js';

const row = (id, acctDelta) => ({ id, sortId: id, acctDelta });

describe('withRunningBalances', () => {
  it('walks chronologically under a date-asc render order', () => {
    const out = withRunningBalances([row('a', -100), row('b', -50), row('c', 500)], 1000, 'asc');
    expect(out.map(r => r.runningBalance)).toEqual([900, 850, 1350]);
  });

  it('still walks chronologically under a date-desc render order', () => {
    // Same three rows, newest first. The TOP row must carry the latest balance.
    const out = withRunningBalances([row('c', 500), row('b', -50), row('a', -100)], 1000, 'desc');
    expect(out.map(r => r.runningBalance)).toEqual([1350, 850, 900]);
    expect(out[0].id).toBe('c'); // order preserved, only the arithmetic reversed
  });

  it('gives the same row the same balance in either direction', () => {
    const rows = [row('a', -100), row('b', -50), row('c', 500)];
    const asc = withRunningBalances(rows, 1000, 'asc');
    const desc = withRunningBalances([...rows].reverse(), 1000, 'desc');
    const byId = list => Object.fromEntries(list.map(r => [r.id, r.runningBalance]));
    expect(byId(desc)).toEqual(byId(asc));
  });

  it('repeats the balance across an uncleared row (delta 0), as accountBalance does', () => {
    // accountDelta() returns 0 for a pending row, so the column must not move.
    const out = withRunningBalances([row('a', -100), row('pending', 0), row('c', 500)], 1000, 'asc');
    expect(out.map(r => r.runningBalance)).toEqual([900, 900, 1400]);
  });

  it('treats a missing delta as no movement rather than NaN', () => {
    const out = withRunningBalances([{ id: 'x' }, row('y', -25)], 500, 'asc');
    expect(out.map(r => r.runningBalance)).toEqual([500, 475]);
  });

  it('leaves the input rows untouched', () => {
    const rows = [row('a', -100)];
    withRunningBalances(rows, 1000, 'asc');
    expect(rows[0].runningBalance).toBeUndefined();
  });

  it('formats through the injected money fn, so masking flows through', () => {
    const masked = () => 'Rs ••••';
    const out = withRunningBalances([row('a', -100)], 1000, 'asc', masked);
    expect(out[0].balanceLabel).toBe('Rs ••••');
    const plain = withRunningBalances([row('a', -100)], 1000, 'asc', n => 'Rs ' + n);
    expect(plain[0].balanceLabel).toBe('Rs 900');
  });

  it('attaches an empty label when no formatter is given', () => {
    expect(withRunningBalances([row('a', -100)], 1000, 'asc')[0].balanceLabel).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Reconciliation: the column's last value === the header strip's figure.
// ---------------------------------------------------------------------------
const MONTH = '2026-08';
const NOW = '2026-08-20T12:00:00';
const ACC = 'acc1';

const tx = (id, day, type, amount, extra) => ({
  id, date: '2026-08-' + day + 'T12:00:00', type, amount, accountId: ACC,
  status: 'cleared', merchant: id, ...extra,
});

const store = {
  accounts: [{ id: ACC, nickname: 'Main', status: 'active', createdAt: '2026-01-01' }],
  cards: [], categories: [], institutions: [], recurring: [], snapshots: [
    { accountId: ACC, month: MONTH, amount: 100000, status: 'confirmed' },
  ],
  transactions: [
    tx('t1', '02', 'expense', 2500),
    tx('t2', '05', 'income', 40000),
    tx('t3', '09', 'expense', 1200, { status: 'pending' }),   // uncleared: steps 0
    tx('t4', '12', 'refund', 700),
    tx('t5', '14', 'adjustment', -300),                       // signed
    tx('t6', '18', 'expense', 9000),
    tx('t7', '28', 'expense', 5000),                          // future-dated: scheduled
  ],
};

const fmt = { money: n => String(n), moneyS: n => String(n) };

// Exactly what the screen does: range-filter, account-scope, group, then walk.
const registerRows = sort => {
  const list = store.transactions.filter(t => inRange(t, MONTH, MONTH)
    && (t.accountId === ACC || t.toAccountId === ACC));
  const { postedRows } = txGroups(list, store, fmt, NOW, { from: MONTH, to: MONTH }, false, sort, ACC);
  return withRunningBalances(postedRows, store.snapshots[0].amount, sort.dir, fmt.money);
};

describe('running balance vs the header strip', () => {
  it("date-desc: the TOP row's balance is accountBalance()", () => {
    const rows = registerRows({ key: 'date', dir: 'desc' });
    const strip = accountBalance(store.accounts[0], store, MONTH, NOW);
    expect(rows[0].runningBalance).toBe(strip);
  });

  it("date-asc: the BOTTOM row's balance is accountBalance()", () => {
    const rows = registerRows({ key: 'date', dir: 'asc' });
    const strip = accountBalance(store.accounts[0], store, MONTH, NOW);
    expect(rows[rows.length - 1].runningBalance).toBe(strip);
  });

  it('excludes the future-dated row from the column entirely (it is a scheduled row)', () => {
    const rows = registerRows({ key: 'date', dir: 'asc' });
    expect(rows.map(r => r.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
  });

  it('steps by accountDelta at every row, uncleared included', () => {
    const rows = registerRows({ key: 'date', dir: 'asc' });
    // 100000 -2500 +40000 (pending: no move) +700 -300 -9000
    expect(rows.map(r => r.runningBalance))
      .toEqual([97500, 137500, 137500, 138200, 137900, 128900]);
  });
});

// ---------------------------------------------------------------------------
// Multi-month window: the walk seeds from the FIRST month's snapshot and runs
// continuously through the next month — its top value is rangeBalances()'s
// Cleared figure, which is what the compact strip prints for that window.
// August's snapshot (restating the opening as 110000) is deliberately NOT
// what a July walk reaches, and must not be re-seeded mid-walk.
// ---------------------------------------------------------------------------
const JUL = '2026-07';
const txm = (id, month, day, type, amount, extra) => ({
  id, date: month + '-' + day + 'T12:00:00', type, amount, accountId: ACC,
  status: 'cleared', merchant: id, ...extra,
});
const twoMonthStore = {
  ...store,
  snapshots: [
    { accountId: ACC, month: JUL, amount: 100000, status: 'confirmed' },
    { accountId: ACC, month: MONTH, amount: 110000, status: 'pending' },
  ],
  transactions: [
    txm('j1', JUL, '03', 'expense', 4000),
    txm('j2', JUL, '10', 'income', 25000),
    txm('j3', JUL, '15', 'expense', 900, { status: 'pending' }),
    txm('a1', MONTH, '02', 'expense', 2500),
    txm('a2', MONTH, '05', 'income', 40000),
    txm('a3', MONTH, '09', 'expense', 1200, { status: 'pending' }),
    txm('a4', MONTH, '28', 'expense', 5000), // future-dated: scheduled band
  ],
};

const walk = (S, from, to, sort) => {
  const list = S.transactions.filter(t => inRange(t, from, to)
    && (t.accountId === ACC || t.toAccountId === ACC));
  const { postedRows } = txGroups(list, S, fmt, NOW, { from, to }, false, sort, ACC);
  const seed = S.snapshots.find(s => s.accountId === ACC && s.month === from).amount;
  return withRunningBalances(postedRows, seed, sort.dir, fmt.money);
};

describe('running balance over a two-month window vs the range strip', () => {
  it("date-desc: the TOP row's balance is rangeBalances().totalBank for Jul–Aug", () => {
    const rows = walk(twoMonthStore, JUL, MONTH, { key: 'date', dir: 'desc' });
    const strip = rangeBalances(twoMonthStore, JUL, MONTH, NOW, ACC);
    expect(rows[0].runningBalance).toBe(strip.totalBank);
    // 100000 −4000 +25000 (Jul) −2500 +40000 (Aug); both pendings step 0.
    expect(rows[0].runningBalance).toBe(158500);
  });

  it("date-asc: the BOTTOM row's balance is rangeBalances().totalBank", () => {
    const rows = walk(twoMonthStore, JUL, MONTH, { key: 'date', dir: 'asc' });
    const strip = rangeBalances(twoMonthStore, JUL, MONTH, NOW, ACC);
    expect(rows[rows.length - 1].runningBalance).toBe(strip.totalBank);
    expect(rows.map(r => r.id)).toEqual(['j1', 'j2', 'j3', 'a1', 'a2', 'a3']);
  });

  it('does NOT re-seed at the August snapshot — the seam is visible, not papered over', () => {
    const rows = walk(twoMonthStore, JUL, MONTH, { key: 'date', dir: 'asc' });
    const firstAug = rows.find(r => r.id === 'a1');
    // Continuous: 121000 (end of July) − 2500, not 110000 − 2500.
    expect(firstAug.runningBalance).toBe(118500);
  });

  it('the single-month window still equals accountBalance() (August seeds from its own snapshot)', () => {
    const rows = walk(twoMonthStore, MONTH, MONTH, { key: 'date', dir: 'desc' });
    expect(rows[0].runningBalance).toBe(accountBalance(twoMonthStore.accounts[0], twoMonthStore, MONTH, NOW));
    expect(rows[0].runningBalance).toBe(rangeBalances(twoMonthStore, MONTH, MONTH, NOW, ACC).totalBank);
    expect(rows[0].runningBalance).toBe(147500);
  });
});
