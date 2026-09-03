import { describe, expect, it } from 'vitest';
import { groupFromPick, landAfterLatest, planDrop, resolveDrop } from './txReorder.js';

// Rows are date-DESC: `above` is the more-recent neighbor, `below` the older.
const r = (id, date) => ({ id, date });
const NOW = '2026-08-30T14:00:00';

describe('planDrop — between two neighbors', () => {
  it('auto-interpolates the midpoint within the same day', () => {
    const p = planDrop({ above: r('a', '2026-08-30T12:00:00'), below: r('b', '2026-08-30T10:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-08-30T11:00:00'] });
  });

  it('auto-interpolates across a 3-day span (inclusive boundary)', () => {
    const p = planDrop({ above: r('a', '2026-08-30T00:00:00'), below: r('b', '2026-08-27T00:00:00'), now: NOW });
    expect(p.mode).toBe('auto');
    // midpoint sits between the two neighbors
    expect(p.dates[0] > '2026-08-27T00:00:00' && p.dates[0] < '2026-08-30T00:00:00').toBe(true);
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

  it('auto at EXACTLY the 2-second minimum room, with a midpoint distinct from both', () => {
    const above = '2026-08-30T12:00:02', below = '2026-08-30T12:00:00';
    const p = planDrop({ above: r('a', above), below: r('b', below), now: NOW });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-08-30T12:00:01'] });
    expect(p.dates[0]).not.toBe(above);
    expect(p.dates[0]).not.toBe(below); // the property the whole auto/picker split protects
  });

  it('seeds the picker strictly BETWEEN the neighbors when they are far apart', () => {
    const above = '2026-08-30T00:00:00', below = '2026-08-26T00:00:00'; // >3 days
    const p = planDrop({ above: r('a', above), below: r('b', below), now: NOW });
    expect(p.mode).toBe('picker');
    expect(p.seed > below && p.seed < above).toBe(true); // blind confirm keeps order
  });

  it('seeds the picker with the upper neighbor when the gap is too tight to split', () => {
    const above = '2026-08-30T12:00:01';
    const p = planDrop({ above: r('a', above), below: r('b', '2026-08-30T12:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'picker', seed: above });
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
    expect(p).toEqual({ mode: 'auto', dates: [NOW] });
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
    expect(p).toEqual({ mode: 'auto', dates: ['2026-07-15T14:00:01'] });
  });

  it('stays on the viewed date even for a minute-precision top row', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T14:00'), now: NOW, nowInView: false });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-07-15T14:00:01'] });
  });

  it('caps at end-of-day and opens the picker when the top row is the last second of its day', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T23:59:59'), now: NOW, nowInView: false });
    expect(p.mode).toBe('picker'); // no room left on that date
  });

  it('still uses now when the view DOES contain now (default nowInView)', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T09:00:00'), now: NOW });
    expect(p).toEqual({ mode: 'auto', dates: [NOW] });
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
    expect(planDrop({ above: null, below: null, now: NOW })).toEqual({ mode: 'auto', dates: [NOW] });
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
  const call = (dragId, beforeId) => resolveDrop({ ids, rowDate, dragIds: [dragId], beforeId, now: '2026-08-30T14:00:00' });

  it('drops "d" between "a" and "b" → midpoint of a and b', () => {
    // insertion line above "b": above=a, below=b
    expect(call('d', 'b')).toEqual({ ids: ['d'], mode: 'auto', dates: ['2026-08-30T12:30:00'] });
  });

  it('drops "c" to the very top → stamps now', () => {
    expect(call('c', 'a')).toEqual({ ids: ['c'], mode: 'auto', dates: ['2026-08-30T14:00:00'] });
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

// A GROUP drop: several rows move together, keeping their order among
// themselves. `dates` come back newest-first, aligned with `ids` in register
// order, so the top row of the group gets the newest stamp.
describe('planDrop — a group of rows (count > 1)', () => {
  it('top of a live view: newest at now, the rest one second earlier each', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T09:00:00'), now: NOW, count: 3 });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-08-30T14:00:00', '2026-08-30T13:59:59', '2026-08-30T13:59:58'] });
  });

  it('top of a live view: picker when the group cannot fit above the row below', () => {
    const p = planDrop({ above: null, below: r('b', '2026-08-30T13:59:59'), now: NOW, count: 2 });
    expect(p.mode).toBe('picker');
  });

  it('top of a past-day view: after the top row on ITS day, +1s per row, newest first', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T14:00:00'), now: NOW, nowInView: false, count: 2 });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-07-15T14:00:02', '2026-07-15T14:00:01'] });
  });

  it('top of a past-day view: picker when the group would spill past the end of that day', () => {
    const p = planDrop({ above: null, below: r('b', '2026-07-15T23:59:58'), now: NOW, nowInView: false, count: 2 });
    expect(p.mode).toBe('picker');
  });

  it('between two neighbours: spread evenly inside the gap, newest first', () => {
    // 10:00 → 11:00 is 3600s; three rows → 900s steps: 10:45, 10:30, 10:15
    const p = planDrop({ above: r('a', '2026-08-30T11:00:00'), below: r('b', '2026-08-30T10:00:00'), now: NOW, count: 3 });
    expect(p).toEqual({ mode: 'auto', dates: ['2026-08-30T10:45:00', '2026-08-30T10:30:00', '2026-08-30T10:15:00'] });
  });

  it('between two neighbours: picker when there is not a whole second per row', () => {
    const p = planDrop({ above: r('a', '2026-08-30T10:00:03'), below: r('b', '2026-08-30T10:00:00'), now: NOW, count: 3 });
    expect(p.mode).toBe('picker');
  });

  it('empty list: now and a second earlier each', () => {
    expect(planDrop({ above: null, below: null, now: NOW, count: 2 })).toEqual({ mode: 'auto', dates: [NOW, '2026-08-30T13:59:59'] });
  });
});

describe('resolveDrop — a group', () => {
  const dates = {
    a: '2026-08-30T13:00:00',
    b: '2026-08-30T12:00:00',
    c: '2026-08-30T10:00:00',
    d: '2026-08-30T08:00:00',
    e: '2026-08-30T06:00:00',
  };
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const rowDate = id => dates[id];
  const call = (dragIds, beforeId) => resolveDrop({ ids, rowDate, dragIds, beforeId, now: NOW });

  it('moves the whole group above the target, ids in register order, newest stamp first', () => {
    // c + e dropped above b: above=a (13:00), below=b (12:00) → 20-min steps
    expect(call(['e', 'c'], 'b')).toEqual({ ids: ['c', 'e'], mode: 'auto', dates: ['2026-08-30T12:40:00', '2026-08-30T12:20:00'] });
  });

  it('a group dropped to the very top stamps now, then a second earlier', () => {
    expect(call(['b', 'c'], 'a')).toEqual({ ids: ['b', 'c'], mode: 'auto', dates: [NOW, '2026-08-30T13:59:59'] });
  });

  it('is a no-op when the group lands back where it already sits', () => {
    expect(call(['b', 'c'], 'd')).toBeNull();   // b,c already sit above d
    expect(call(['b', 'c'], 'b')).toBeNull();   // onto itself
    expect(call(['b', 'c'], 'c')).toBeNull();   // onto a member
  });

  it('a non-contiguous group dropped where its FIRST member already is still moves (it gathers the rest)', () => {
    // a and c dropped above b: a already sits above b, but c does not → the group gathers
    expect(call(['a', 'c'], 'b')).not.toBeNull();
  });
});

// The picker fallback for a group: the chosen instant is the group's newest
// row, the rest sit one second earlier each — so a blind confirm keeps the
// order the user dragged.
describe('groupFromPick', () => {
  it('fans a picked instant out over the group, newest first', () => {
    expect(groupFromPick('2026-08-30T11:00', 3)).toEqual(['2026-08-30T11:00:00', '2026-08-30T10:59:59', '2026-08-30T10:59:58']);
  });
  it('is the picked instant alone for one row', () => {
    expect(groupFromPick('2026-08-30T11:00', 1)).toEqual(['2026-08-30T11:00:00']);
  });

  // The picker is minute-granular and is seeded from a neighbour, so a blind
  // confirm lands in that neighbour's minute. A pick in the same minute as the
  // row ABOVE the gap must stay strictly older than it (else the two tie and
  // the merchant tie-breaker can put the dragged row back above it — "only one
  // row moved"); the same minute as the row BELOW must stay strictly newer.
  describe('with the drop gap\'s neighbours (bounds)', () => {
    it('a pick in the same minute as the row above lands the group just below it', () => {
      expect(groupFromPick('2026-09-01T09:15', 2, { above: '2026-09-01T09:15:00', below: null }))
        .toEqual(['2026-09-01T09:14:59', '2026-09-01T09:14:58']);
    });
    it('a single row dropped at the bottom sits one second under the last row, never tied', () => {
      expect(groupFromPick('2026-09-01T09:15', 1, { above: '2026-09-01T09:15:00', below: null }))
        .toEqual(['2026-09-01T09:14:59']);
    });
    it('a pick in the same minute as the row below lands the group just above it, order kept', () => {
      expect(groupFromPick('2026-08-30T10:00', 2, { above: null, below: '2026-08-30T10:00:00' }))
        .toEqual(['2026-08-30T10:00:02', '2026-08-30T10:00:01']);
    });
    it('honours a pick outside both neighbours\' minutes verbatim (an explicit choice)', () => {
      expect(groupFromPick('2026-08-30T08:00', 2, { above: '2026-08-30T12:00:00', below: '2026-08-30T10:00:00' }))
        .toEqual(['2026-08-30T08:00:00', '2026-08-30T07:59:59']);
    });
    it('a minute-precision neighbour reads as :00', () => {
      expect(groupFromPick('2026-09-01T09:15', 1, { above: '2026-09-01T09:15' })).toEqual(['2026-09-01T09:14:59']);
    });
  });
});

// The picker plan names the gap it was opened for, so the confirm can keep the
// pick strictly inside it (groupFromPick bounds).
describe('resolveDrop — picker plans carry the gap\'s neighbours', () => {
  const dates = { a: '2026-08-30T13:00:00', b: '2026-08-30T12:00:00', c: '2026-08-30T10:00:00' };
  const ids = ['a', 'b', 'c'];
  const rowDate = id => dates[id];
  it('bottom drop: above = the last row, below = null', () => {
    expect(resolveDrop({ ids, rowDate, dragIds: ['a'], beforeId: null, now: NOW }))
      .toEqual({ ids: ['a'], mode: 'picker', seed: dates.c, bounds: { above: dates.c, below: null } });
  });
  it('top drop that cannot fit in a past view: above = null, below = the first row', () => {
    const p = resolveDrop({ ids: ['b', 'c'], rowDate, dragIds: ['c'], beforeId: 'b', now: NOW, nowInView: false });
    // b is at 12:00 on the 30th — plenty of room — so force the spill case with a late row
    const late = { x: '2026-07-15T23:59:59', y: '2026-07-15T08:00:00' };
    const q = resolveDrop({ ids: ['x', 'y'], rowDate: id => late[id], dragIds: ['y'], beforeId: 'x', now: NOW, nowInView: false });
    expect(p.mode).toBe('auto');
    expect(q).toEqual({ ids: ['y'], mode: 'picker', seed: late.x, bounds: { above: null, below: late.x } });
  });
  it('auto plans carry no bounds', () => {
    expect(resolveDrop({ ids, rowDate, dragIds: ['c'], beforeId: 'b', now: NOW })).not.toHaveProperty('bounds');
  });
});

// "Land after the latest row on that day": the one rule shared by bulk Move to
// Date, a back-dated add, and a top drop into a past-day view. Stamps come back
// ASCENDING so the caller can hand them out in register order (oldest first).
describe('landAfterLatest', () => {
  const rows = [
    { id: 'x', date: '2026-08-20T09:00:00' },
    { id: 'y', date: '2026-08-20T15:30:45' },   // the latest on the 20th
    { id: 'z', date: '2026-08-21T08:00:00' },   // another day — ignored
  ];
  const NOW = '2026-08-31T12:00:00';

  it('returns count stamps 1s, 2s, … after the latest row on that day', () => {
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 2, now: NOW }))
      .toEqual(['2026-08-20T15:30:46', '2026-08-20T15:30:47']);
  });

  it('ignores rows on other days', () => {
    expect(landAfterLatest({ transactions: rows, day: '2026-08-21', count: 1, now: NOW }))
      .toEqual(['2026-08-21T08:00:01']);
  });

  it('ignores the rows being moved, even when they already sit on that day', () => {
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 1, exclude: ['y'], now: NOW }))
      .toEqual(['2026-08-20T09:00:01']);
  });

  it('is null when nothing else is on that day (caller keeps its own fallback)', () => {
    expect(landAfterLatest({ transactions: rows, day: '2026-08-22', count: 1, now: NOW })).toBeNull();
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 1, exclude: ['x', 'y'], now: NOW })).toBeNull();
  });

  it('reads a minute-precision latest row as :00 and lands one second after it', () => {
    expect(landAfterLatest({ transactions: [{ id: 'm', date: '2026-08-20T12:00' }], day: '2026-08-20', count: 1, now: NOW }))
      .toEqual(['2026-08-20T12:00:01']);
  });

  it('caps at the last second of the day rather than spilling into the next', () => {
    const late = [{ id: 'l', date: '2026-08-20T23:59:58' }];
    expect(landAfterLatest({ transactions: late, day: '2026-08-20', count: 3, now: NOW }))
      .toEqual(['2026-08-20T23:59:59', '2026-08-20T23:59:59', '2026-08-20T23:59:59']);
  });

  it('clamps to now so a move onto today never lands in the future', () => {
    const now = '2026-08-20T15:30:46';
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 2, now }))
      .toEqual(['2026-08-20T15:30:46', '2026-08-20T15:30:46']);
  });
});
