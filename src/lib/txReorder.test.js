import { describe, expect, it } from 'vitest';
import { planDrop, resolveDrop } from './txReorder.js';

// Rows are date-DESC: `above` is the more-recent neighbor, `below` the older.
const r = (id, date) => ({ id, date });
const NOW = '2026-08-30T14:00:00';

describe('planDrop — between two neighbors', () => {
  it('auto-interpolates the midpoint within the same day', () => {
    const p = planDrop({ above: r('a', '2026-08-30T12:00:00'), below: r('b', '2026-08-30T10:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'auto', date: '2026-08-30T11:00:00' });
  });

  it('auto-interpolates across a 3-day span (inclusive boundary)', () => {
    const p = planDrop({ above: r('a', '2026-08-30T00:00:00'), below: r('b', '2026-08-27T00:00:00'), now: NOW });
    expect(p.mode).toBe('auto');
    // midpoint sits between the two neighbors
    expect(p.date > '2026-08-27T00:00:00' && p.date < '2026-08-30T00:00:00').toBe(true);
  });

  it('opens the picker when the span exceeds 3 days', () => {
    const p = planDrop({ above: r('a', '2026-08-30T00:00:00'), below: r('b', '2026-08-26T00:00:00'), now: NOW });
    expect(p.mode).toBe('picker');
    expect(p.seed).toBeTruthy();
  });

  it('opens the picker when there is no whole-second room between neighbors', () => {
    const p = planDrop({ above: r('a', '2026-08-30T12:00:01'), below: r('b', '2026-08-30T12:00:00'), now: NOW });
    expect(p.mode).toBe('picker');
  });

  it('a custom windowDays widens/narrows the auto range', () => {
    const far = { above: r('a', '2026-08-30T00:00:00'), below: r('b', '2026-08-25T00:00:00'), now: NOW };
    expect(planDrop({ ...far, windowDays: 3 }).mode).toBe('picker');
    expect(planDrop({ ...far, windowDays: 5 }).mode).toBe('auto');
  });
});

describe('planDrop — top edge (no neighbor above)', () => {
  it('stamps now when there is room below now', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T09:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'auto', date: NOW });
  });

  it('opens the picker when the top row is already at/after now', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T14:00:00'), now: NOW });
    expect(p.mode).toBe('picker');
  });
});

describe('planDrop — top edge in a SCOPED view (nowInView=false)', () => {
  // Viewing a PAST date/month: `now` (today) is outside the view, so a top drop
  // must land on the viewed date's latest moment, not the real clock, or the row
  // would jump to today and disappear from the filtered list.
  it('anchors to just after the top visible row on ITS day, not now', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T14:00:00'), now: NOW, nowInView: false });
    expect(p).toEqual({ mode: 'auto', date: '2026-07-15T14:00:01' });
  });

  it('stays on the viewed date even for a minute-precision top row', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T14:00'), now: NOW, nowInView: false });
    expect(p).toEqual({ mode: 'auto', date: '2026-07-15T14:00:01' });
  });

  it('caps at end-of-day and opens the picker when the top row is the last second of its day', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T23:59:59'), now: NOW, nowInView: false });
    expect(p.mode).toBe('picker'); // no room left on that date
  });

  it('still uses now when the view DOES contain now (default nowInView)', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T09:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'auto', date: NOW });
  });
});

describe('planDrop — bottom edge (no neighbor below)', () => {
  it('always opens the picker (an older date must be chosen, not invented)', () => {
    const p = planDrop({ above: r('a', '2026-08-30T09:00:00'), below: null, now: NOW });
    expect(p.mode).toBe('picker');
    expect(p.seed).toBeTruthy();
  });
});

describe('planDrop — degenerate', () => {
  it('stamps now when the list is empty', () => {
    expect(planDrop({ above: null, below: null, now: NOW })).toEqual({ mode: 'auto', date: NOW });
  });
});

describe('resolveDrop — neighbour math', () => {
  // date-desc: newest first
  const dates = {
    a: '2026-08-30T13:00:00',
    b: '2026-08-30T12:00:00',
    c: '2026-08-30T10:00:00',
    d: '2026-08-30T08:00:00',
  };
  const ids = ['a', 'b', 'c', 'd'];
  const rowDate = id => dates[id];
  const call = (dragId, beforeId) => resolveDrop({ ids, rowDate, dragId, beforeId, now: '2026-08-30T14:00:00' });

  it('drops "d" between "a" and "b" → midpoint of a and b', () => {
    // insertion line above "b": above=a, below=b
    expect(call('d', 'b')).toEqual({ id: 'd', mode: 'auto', date: '2026-08-30T12:30:00' });
  });

  it('drops "c" to the very top → stamps now', () => {
    expect(call('c', 'a')).toEqual({ id: 'c', mode: 'auto', date: '2026-08-30T14:00:00' });
  });

  it('drops "a" to the very bottom (beforeId=null) → picker', () => {
    expect(call('a', null).mode).toBe('picker');
  });

  it('is a no-op when dropped back into its own gap', () => {
    // "b" currently sits above "c"; dropping it above "c" again changes nothing
    expect(call('b', 'c')).toBeNull();
  });

  it('is a no-op when dropped onto itself', () => {
    expect(call('b', 'b')).toBeNull();
  });
});
