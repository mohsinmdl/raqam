// Drill-down from an Activity-modal row into the register. activityDrillTarget
// decides where the click goes; selectionForSel decides what the register's
// ?sel= effect does once it lands (found? widen the range to reveal the row?).
import { describe, it, expect } from 'vitest';
import { activityDrillTarget, selectionForSel } from '../src/lib/activityDrill.js';

describe('activityDrillTarget', () => {
  it('sends a bank-account txn to that account ledger, txn as ?sel=', () => {
    expect(activityDrillTarget({ id: 'tx1', accountId: 'askari' })).toEqual({
      pathname: '/transactions/askari',
      search: '?sel=tx1',
    });
  });

  it('sends a card-funded txn (no accountId) to the all-accounts view', () => {
    expect(activityDrillTarget({ id: 'tx2', cardId: 'visa' })).toEqual({
      pathname: '/transactions',
      search: '?sel=tx2',
    });
  });

  it('treats an empty-string accountId as no account (all-accounts view)', () => {
    expect(activityDrillTarget({ id: 'tx3', accountId: '' }).pathname).toBe('/transactions');
  });

  it('url-encodes a txn id with unsafe characters', () => {
    expect(activityDrillTarget({ id: 'a b/c', accountId: 'acc' }).search).toBe('?sel=a%20b%2Fc');
  });
});

describe('selectionForSel', () => {
  const AUG = { from: '2026-08', to: '2026-08' };
  const txns = [
    { id: 'in', date: '2026-08-10', accountId: 'a' },
    { id: 'below', date: '2026-07-05', accountId: 'a' },
    { id: 'above', date: '2026-09-20', accountId: 'a' },
    { id: 'dateless', accountId: 'a' },
  ];

  it('returns null when there is no target param', () => {
    expect(selectionForSel(txns, '', AUG)).toBeNull();
    expect(selectionForSel(txns, null, AUG)).toBeNull();
  });

  it('reports a missing id (deleted / stale link) without a range change', () => {
    expect(selectionForSel(txns, 'gone', AUG)).toEqual({ found: false });
  });

  it('selects a target already in range without touching the range', () => {
    expect(selectionForSel(txns, 'in', AUG)).toEqual({ found: true, id: 'in', range: null });
  });

  it('extends the range down to reveal an earlier target (does not replace it)', () => {
    expect(selectionForSel(txns, 'below', AUG)).toEqual({
      found: true, id: 'below', range: { from: '2026-07', to: '2026-08' },
    });
  });

  it('extends the range up to reveal a later target', () => {
    expect(selectionForSel(txns, 'above', AUG)).toEqual({
      found: true, id: 'above', range: { from: '2026-08', to: '2026-09' },
    });
  });

  it('keeps an unbounded side unbounded when extending', () => {
    expect(selectionForSel(txns, 'above', { from: '', to: '2026-08' })).toEqual({
      found: true, id: 'above', range: { from: '', to: '2026-09' },
    });
  });

  it('never produces a garbage range for a target with an unparseable date', () => {
    // date missing -> inRange treats it as out-of-range, but the month guard
    // stops t.date.slice(...) from throwing or widening to an all-dates window.
    expect(selectionForSel(txns, 'dateless', AUG)).toEqual({ found: true, id: 'dateless', range: null });
  });
});
