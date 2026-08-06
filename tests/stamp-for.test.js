import { describe, it, expect } from 'vitest';
import { stampFor } from '../src/store/actions.js';
import { hasOccurred } from '../src/lib/calc.js';
import { timeLabel } from '../src/lib/calc.js';

// Balance adjustments, card adjustments and card payments used to be stamped at
// a flat T12:00. A correction entered at 02:02 therefore displayed "12:00 pm"
// — a time that never happened — and sorted into the middle of the day rather
// than where it belonged. (It also read as the future to the money math until
// that guard was made day-granular.)
const NOW = '2026-08-07T02:02';

describe('stampFor', () => {
  it('gives today the real clock time, not a made-up midday', () => {
    expect(stampFor('2026-08-07', NOW)).toBe('2026-08-07T02:02');
  });

  it('defaults to today when no date was picked', () => {
    expect(stampFor(null, NOW)).toBe(NOW);
    expect(stampFor(undefined, NOW)).toBe(NOW);
    expect(stampFor('', NOW)).toBe(NOW);
  });

  it('keeps a neutral midday for another day, where no time was supplied', () => {
    expect(stampFor('2026-08-01', NOW)).toBe('2026-08-01T12:00');
    expect(stampFor('2026-07-15', NOW)).toBe('2026-07-15T12:00');
  });

  it('always returns a value the schema accepts', () => {
    for (const d of [null, '2026-08-07', '2026-08-01', '2025-12-31']) {
      expect(stampFor(d, NOW)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    }
  });

  it('displays the time the entry was actually made', () => {
    // The reported symptom: a 2am correction reading "12:00 pm".
    expect(timeLabel(stampFor('2026-08-07', NOW))).toBe('2:02 am');
  });

  it('orders same-day entries by when they happened', () => {
    const early = stampFor('2026-08-07', '2026-08-07T02:02');
    const later = stampFor('2026-08-07', '2026-08-07T17:30');
    expect([later, early].sort()).toEqual([early, later]);
  });

  it('never dates an entry ahead of the moment it was made', () => {
    // What the flat noon did: an 02:02 entry stamped 12:00 was, for ten hours,
    // a future transaction that no balance counted.
    for (const now of ['2026-08-07T00:01', '2026-08-07T02:02', '2026-08-07T11:59', '2026-08-07T23:59']) {
      const stamped = stampFor('2026-08-07', now);
      expect(stamped <= now).toBe(true);
      expect(hasOccurred({ date: stamped }, now)).toBe(true);
    }
  });

  it('leaves a genuinely future date in the future', () => {
    expect(hasOccurred({ date: stampFor('2026-08-20', NOW) }, NOW)).toBe(false);
  });
});
