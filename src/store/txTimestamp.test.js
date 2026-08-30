import { describe, expect, it } from 'vitest';
import { buildTx, reorderTransaction } from './actions.js';
import { todayStr } from '../lib/dates.js';

const SEC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

describe('buildTx — timestamp on create', () => {
  it('a new today-dated tx with an untouched time gets the real clock (seconds)', () => {
    const t = buildTx({ date: todayStr(), time: '09:00', payWith: 'acc:a1' }, 'expense', 500, 0, 'c1');
    expect(t.date.slice(0, 10)).toBe(todayStr());
    expect(t.date).toMatch(SEC); // seconds precision -> lands strictly on top
  });

  it('honors an explicitly picked time to the minute', () => {
    const t = buildTx({ date: todayStr(), time: '09:30', timeTouched: true, payWith: 'acc:a1' }, 'expense', 500, 0, 'c1');
    expect(t.date).toBe(todayStr() + 'T09:30');
  });

  it('keeps existing behavior for a back-dated add (no invented seconds)', () => {
    const t = buildTx({ date: '2026-01-05', time: '15:00', payWith: 'acc:a1' }, 'expense', 500, 0, 'c1');
    expect(t.date).toBe('2026-01-05T15:00');
  });

  it('preserves the exact original timestamp when an edit leaves day+time untouched', () => {
    const orig = '2026-08-30T14:22:37';
    const t = buildTx({ editId: 'x1', origDate: orig, date: '2026-08-30', time: '14:22', payWith: 'acc:a1' }, 'expense', 500, 0, 'x1');
    expect(t.date).toBe(orig); // seconds not dropped, order not nudged
  });

  it('an edit that MOVES the tx to another day rebuilds at minute precision (not origDate, not seconds-now)', () => {
    const t = buildTx({ editId: 'x1', origDate: '2026-01-05T10:00:00', date: '2026-03-02', time: '10:00', payWith: 'acc:a1' }, 'expense', 500, 0, 'x1');
    expect(t.date).toBe('2026-03-02T10:00');
  });

  it('an edit moved to TODAY does NOT become nowIsoSec — an edit is not a brand-new entry', () => {
    const t = buildTx({ editId: 'x1', origDate: '2026-01-05T10:00:00', date: todayStr(), time: '09:15', payWith: 'acc:a1' }, 'expense', 500, 0, 'x1');
    expect(t.date).toBe(todayStr() + 'T09:15'); // minute precision, not the seconds clock
  });
});

describe('reorderTransaction', () => {
  const base = () => ({
    transactions: [
      { id: 'a', date: '2026-08-30T12:00:00', type: 'expense', amount: 100 },
      { id: 'b', date: '2026-08-30T10:00:00', type: 'expense', amount: 200 },
    ],
    audit: [],
  });
  const NOW = '2026-08-30T14:00:00';

  it('writes the new date and one audit row', () => {
    const after = reorderTransaction(base(), { id: 'b', date: '2026-08-30T11:00:00', now: NOW });
    expect(after.transactions.find(t => t.id === 'b').date).toBe('2026-08-30T11:00:00');
    expect(after.audit[0].action).toBe('update');
    expect(after.audit[0].entityId).toBe('b');
  });

  it('is a no-op when the date is unchanged (same ref back)', () => {
    const s = base();
    expect(reorderTransaction(s, { id: 'a', date: '2026-08-30T12:00:00', now: NOW })).toBe(s);
  });

  it('clamps a future date to now', () => {
    const after = reorderTransaction(base(), { id: 'b', date: '2027-01-01T00:00:00', now: NOW });
    expect(after.transactions.find(t => t.id === 'b').date).toBe(NOW);
  });

  it('is a no-op for an unknown id', () => {
    const s = base();
    expect(reorderTransaction(s, { id: 'zzz', date: NOW, now: NOW })).toBe(s);
  });

  it('refuses a malformed date string (same ref, never persisted)', () => {
    const s = base();
    expect(reorderTransaction(s, { id: 'b', date: 'NaN-NaN-NaNTNaN:NaN:NaN', now: NOW })).toBe(s);
    expect(reorderTransaction(s, { id: 'b', date: '2026-08-30', now: NOW })).toBe(s); // date-only fails the CHECK shape
  });

  it('writes a human-readable audit summary and before/after dates', () => {
    const after = reorderTransaction(base(), { id: 'b', date: '2026-08-30T11:00:00', now: NOW });
    expect(after.audit[0].summary).toBe('Reordered — moved to 2026-08-30 11:00');
    expect(after.audit[0].before).toEqual({ date: '2026-08-30T10:00:00' });
    expect(after.audit[0].after).toEqual({ date: '2026-08-30T11:00:00' });
  });

  it('does not clamp when now is omitted (documents the contract; callers always pass now)', () => {
    const after = reorderTransaction(base(), { id: 'b', date: '2027-01-01T00:00:00' });
    expect(after.transactions.find(t => t.id === 'b').date).toBe('2027-01-01T00:00:00');
  });
});
