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

  it('a non-contiguous group gathers at the drop, ids in register order whatever order they were dragged in', () => {
    // a and c dropped above b: a already sits above b, but c does not → the group gathers at the top
    expect(call(['c', 'a'], 'b')).toEqual({ ids: ['a', 'c'], mode: 'auto', dates: [NOW, '2026-08-30T13:59:59'] });
    // b and d dropped above e: gathered between c (10:00) and e (06:00) → 80-min steps
    expect(call(['d', 'b'], 'e')).toEqual({ ids: ['b', 'd'], mode: 'auto', dates: ['2026-08-30T08:40:00', '2026-08-30T07:20:00'] });
  });

  it('refuses (null) when the drop target is no longer in the list', () => {
    expect(call(['b'], 'gone')).toBeNull();
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
  it('clamps the top to now so the store never has to flatten the group into a tie', () => {
    expect(groupFromPick('2026-08-30T11:00', 2, {}, '2026-08-30T10:59:30')).toEqual(['2026-08-30T10:59:30', '2026-08-30T10:59:29']);
  });
  it('when both neighbours share the pick\'s minute and the gap is narrower than the group, the row above wins (a tie below is unavoidable)', () => {
    expect(groupFromPick('2026-08-30T09:15', 2, { above: '2026-08-30T09:15:02', below: '2026-08-30T09:15:00' }))
      .toEqual(['2026-08-30T09:15:01', '2026-08-30T09:15:00']);
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

  it('fits the group exactly up to the day\'s last second with distinct stamps', () => {
    const late = [{ id: 'l', date: '2026-08-20T23:59:56' }];
    expect(landAfterLatest({ transactions: late, day: '2026-08-20', count: 3, now: NOW }))
      .toEqual(['2026-08-20T23:59:57', '2026-08-20T23:59:58', '2026-08-20T23:59:59']);
  });

  it('is null when even stepping back cannot clear the day\'s newest row (the day is full)', () => {
    const late = [{ id: 'l', date: '2026-08-20T23:59:58' }];
    expect(landAfterLatest({ transactions: late, day: '2026-08-20', count: 3, now: NOW })).toBeNull();
    expect(landAfterLatest({ transactions: late, day: '2026-08-20', count: 1, now: NOW })).toEqual(['2026-08-20T23:59:59']);
  });

  it('on today, steps back from now instead of tying every row to it', () => {
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 2, now: '2026-08-20T15:30:47' }))
      .toEqual(['2026-08-20T15:30:46', '2026-08-20T15:30:47']);
    expect(landAfterLatest({ transactions: rows, day: '2026-08-20', count: 2, now: '2026-08-20T15:30:46' })).toBeNull();
  });

  it('a future day is capped at its own last second, never pulled back to now', () => {
    const future = [{ id: 'f', date: '2099-12-25T09:00' }];
    expect(landAfterLatest({ transactions: future, day: '2099-12-25', count: 1, now: NOW }))
      .toEqual(['2099-12-25T09:00:01']);
  });

  it('on today, ignores rows later than now (unposted) when finding the newest', () => {
    const today = [{ id: 'p', date: '2026-08-20T13:30' }, { id: 's', date: '2026-08-20T18:00' }];
    expect(landAfterLatest({ transactions: today, day: '2026-08-20', count: 1, now: '2026-08-20T14:00:00' }))
      .toEqual(['2026-08-20T13:30:01']);
  });
});

describe('planDrop — refuses a neighbour it cannot read', () => {
  it('a garbage top row in a past view opens the picker instead of stamping empty strings', () => {
    const p = planDrop({ above: null, below: r('b', 'garbage'), now: NOW, nowInView: false, count: 2 });
    expect(p.mode).toBe('picker');
  });
});

// A drop into a gap with no whole second to land on (rows entered or imported
// in the same minute are TIED) is resolved by making room: the tight
// neighbourhood is respread within its own day, display order kept, and the
// nudged neighbours ride along as extra moves. Only a gap that cannot be
// widened inside the day (or one wider than the window) still asks.
describe('resolveDrop — makes room in a tied gap', () => {
  const dates = {
    a: '2026-08-30T07:20:00',
    b: '2026-08-30T07:17',      // b and c are tied (minute precision)
    c: '2026-08-30T07:17',
    d: '2026-08-30T07:15:00',
    e: '2026-08-30T07:10:00',
  };
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const rowDate = id => dates[id];
  const call = (dragIds, beforeId, now = NOW) => resolveDrop({ ids, rowDate, dragIds, beforeId, now });

  it('respreads the tied minute so the row lands between the two tied rows', () => {
    // lo 07:17:00 … hi 07:17:59 → 59s over 4 steps = 14s: b 07:17:42, e 07:17:28, c 07:17:14
    expect(call(['e'], 'c')).toEqual({
      ids: ['b', 'e', 'c'], mode: 'auto', nudged: ['b', 'c'],
      dates: ['2026-08-30T07:17:42', '2026-08-30T07:17:28', '2026-08-30T07:17:14'],
    });
  });

  it('a group dropped into a tied minute is respread with it, order kept', () => {
    // 59s over 5 steps = 11s
    expect(call(['d', 'e'], 'c')).toEqual({
      ids: ['b', 'd', 'e', 'c'], mode: 'auto', nudged: ['b', 'c'],
      dates: ['2026-08-30T07:17:44', '2026-08-30T07:17:33', '2026-08-30T07:17:22', '2026-08-30T07:17:11'],
    });
  });

  it('widens to the next distinct stamps when the neighbours do not share a minute', () => {
    const d2 = { ...dates, b: '2026-08-30T07:18:00', c: '2026-08-30T07:17:59' };
    const p = resolveDrop({ ids, rowDate: id => d2[id], dragIds: ['e'], beforeId: 'c', now: NOW });
    // lo = d+1s 07:15:01 … hi = a−1s 07:19:59 → 298s over 4 steps = 74s
    expect(p).toEqual({
      ids: ['b', 'e', 'c'], mode: 'auto', nudged: ['b', 'c'],
      dates: ['2026-08-30T07:18:43', '2026-08-30T07:17:29', '2026-08-30T07:16:15'],
    });
  });

  it('never respreads past now when the tied rows are the newest on today', () => {
    const now = '2026-08-30T07:17:30';
    const p = resolveDrop({ ids: ['b', 'c', 'e'], rowDate, dragIds: ['e'], beforeId: 'c', now });
    // hi = now → 30s over 4 steps = 7s
    expect(p).toEqual({
      ids: ['b', 'e', 'c'], mode: 'auto', nudged: ['b', 'c'],
      dates: ['2026-08-30T07:17:21', '2026-08-30T07:17:14', '2026-08-30T07:17:07'],
    });
  });

  it('inside a run of three tied rows: the pair around the gap leaves the minute (the tied row above bounds it), order kept', () => {
    const d4 = { ...dates, d: '2026-08-30T07:17' };   // b, c, d all tied
    const p = resolveDrop({ ids, rowDate: id => d4[id], dragIds: ['e'], beforeId: 'd', now: NOW });
    // lo = start of day (nothing below on this day... e is the mover) → hi = b−1s 07:16:59
    expect(p.ids).toEqual(['c', 'e', 'd']);
    expect(p.dates[0] < '2026-08-30T07:17').toBe(true);
    expect(p.dates[0] > p.dates[1] && p.dates[1] > p.dates[2]).toBe(true);
  });

  it('when the tied minute is too crowded for the group it respreads over the whole gap instead', () => {
    const now = '2026-08-30T07:17:03';
    const p = resolveDrop({ ids, rowDate, dragIds: ['e'], beforeId: 'c', now });
    // minute window [07:17:00, 07:17:03] holds no 3 rows → full bounds lo=d+1s 07:15:01 … hi=now 07:17:03 → 122s/4 = 30s
    expect(p).toEqual({ ids: ['b', 'e', 'c'], mode: 'auto', nudged: ['b', 'c'], dates: ['2026-08-30T07:16:31', '2026-08-30T07:16:01', '2026-08-30T07:15:31'] });
  });

  it('widens towards whichever neighbour is nearer in time', () => {
    const ids6 = ['z', 'a', 'b', 'c', 'd', 'e'];
    const down = { z: '2026-08-30T07:30:00', a: '2026-08-30T07:17:03', b: '2026-08-30T07:17:01', c: '2026-08-30T07:17:00', d: '2026-08-30T07:16:59', e: '2026-08-30T07:10:00' };
    // b/c share no minute-room (1s), d is 1s below c while a is 2s above b → widen DOWN to d
    expect(resolveDrop({ ids: ids6, rowDate: id => down[id], dragIds: ['e'], beforeId: 'c', now: NOW }).ids).toEqual(['b', 'e', 'c', 'd']);
    const up = { ...down, a: '2026-08-30T07:17:02', d: '2026-08-30T07:16:58' };
    expect(resolveDrop({ ids: ids6, rowDate: id => up[id], dragIds: ['e'], beforeId: 'c', now: NOW }).ids).toEqual(['a', 'b', 'e', 'c']);
  });

  it('still asks when the tied neighbours straddle midnight (rows never change day)', () => {
    const d3 = { x: '2026-08-30T00:00:00', y: '2026-08-29T23:59:59', z: '2026-08-29T10:00:00' };
    const p = resolveDrop({ ids: ['x', 'y', 'z'], rowDate: id => d3[id], dragIds: ['z'], beforeId: 'y', now: NOW });
    expect(p.mode).toBe('picker');
    expect(p.ids).toEqual(['z']);
  });
});
