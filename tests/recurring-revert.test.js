import { describe, it, expect } from 'vitest';
import { effectiveNextDate, scheduledRules } from '../src/lib/schedule.js';
import { deleteTransaction, deleteTransactions } from '../src/store/actions.js';

const rule = over => ({
  id: 'r1', name: 'Rent', type: 'expense', amount: 35000,
  schedule: { every: 1, unit: 'month', days: [5], ends: { kind: 'never' } },
  nextDate: '2026-08-05', category: 'rent', accountId: 'a1',
  status: 'active', autoPost: false, occurrences: [], ...(over || {}),
});

describe('effectiveNextDate', () => {
  it('returns nextDate when nothing is settled there', () => {
    expect(effectiveNextDate(rule())).toBe('2026-08-05');
  });

  it('skips a due date already recorded, advancing to the next', () => {
    const r = rule({ occurrences: [{ due: '2026-08-05', outcome: 'recorded', amount: 35000, txId: 't1', at: 'x' }] });
    expect(effectiveNextDate(r)).toBe('2026-09-05');
  });

  it('skips a skipped date too', () => {
    const r = rule({ occurrences: [{ due: '2026-08-05', outcome: 'skipped', amount: null, txId: null, at: 'x' }] });
    expect(effectiveNextDate(r)).toBe('2026-09-05');
  });

  it('skips several consecutive settled dates', () => {
    const r = rule({ occurrences: [
      { due: '2026-08-05', outcome: 'recorded', amount: 1, txId: 't1', at: 'x' },
      { due: '2026-09-05', outcome: 'skipped', amount: null, txId: null, at: 'x' },
    ] });
    expect(effectiveNextDate(r)).toBe('2026-10-05');
  });
});

describe('scheduledRules projects the effective next due', () => {
  const store = { recurring: [rule({ occurrences: [{ due: '2026-08-05', outcome: 'recorded', amount: 1, txId: 't1', at: 'x' }] })] };

  it('does not surface a reminder on the already-recorded month; projects the next', () => {
    // Effective due is 2026-09-05, so the reminder shows for September, not August.
    expect(scheduledRules(store, '2026-08', '2026-09', '2026-08-05')).toHaveLength(1);
    expect(scheduledRules(store, '2026-08', '2026-08', '2026-08-05')).toHaveLength(0);
  });
});

describe('deleteTransaction reverts a recorded occurrence', () => {
  const storeWith = () => ({
    transactions: [{ id: 't1', type: 'expense', amount: 35000, date: '2026-08-05T12:00', accountId: 'a1', status: 'cleared', category: 'rent' }],
    recurring: [rule({ nextDate: '2026-09-05', occurrences: [{ due: '2026-08-05', outcome: 'recorded', amount: 35000, txId: 't1', at: 'x' }] })],
    audit: [],
  });

  it('removes the occurrence and pulls nextDate back to that due date', () => {
    const next = deleteTransaction(storeWith(), { id: 't1' });
    expect(next.transactions).toEqual([]);
    expect(next.recurring[0].occurrences).toEqual([]);
    expect(next.recurring[0].nextDate).toBe('2026-08-05'); // the reminder returns for 5 Aug
  });

  it('leaves an unrelated rule untouched (same reference)', () => {
    const s = storeWith();
    s.recurring.push(rule({ id: 'r2', nextDate: '2026-08-10', occurrences: [] }));
    const next = deleteTransaction(s, { id: 't1' });
    expect(next.recurring[1]).toBe(s.recurring[1]);
  });

  it('deleteTransactions reverts across a batch', () => {
    const next = deleteTransactions(storeWith(), { ids: ['t1'] });
    expect(next.recurring[0].occurrences).toEqual([]);
    expect(next.recurring[0].nextDate).toBe('2026-08-05');
  });
});
