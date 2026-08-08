import { describe, it, expect } from 'vitest';
import {
  RANGE_PRESETS, rangeFor, inRange, presetOf, rangeLabel, clampRange, yearOpts, shiftRange,
} from '../src/lib/dateRange.js';

const AUG = '2026-08';   // mid-year, nothing wraps
const FEB = '2026-02';   // a three-month window here reaches into last year
const JAN = '2026-01';   // and here it reaches back two

describe('rangeFor', () => {
  it('This Month is a single month', () => {
    expect(rangeFor('month', AUG)).toEqual({ from: '2026-08', to: '2026-08' });
  });

  it('Latest 3 Months includes the current one', () => {
    expect(rangeFor('last3', AUG)).toEqual({ from: '2026-06', to: '2026-08' });
  });

  it('Latest 3 Months reaches into the previous year', () => {
    expect(rangeFor('last3', FEB)).toEqual({ from: '2025-12', to: '2026-02' });
    expect(rangeFor('last3', JAN)).toEqual({ from: '2025-11', to: '2026-01' });
  });

  it('This Year is the full calendar year, not year-to-date', () => {
    expect(rangeFor('year', AUG)).toEqual({ from: '2026-01', to: '2026-12' });
  });

  it('Last Year is the whole previous year', () => {
    expect(rangeFor('lastYear', AUG)).toEqual({ from: '2025-01', to: '2025-12' });
    expect(rangeFor('lastYear', JAN)).toEqual({ from: '2025-01', to: '2025-12' });
  });

  it('All Dates is unbounded on both sides', () => {
    expect(rangeFor('all', AUG)).toEqual({ from: null, to: null });
  });

  it('falls back to the current month for an unknown preset', () => {
    expect(rangeFor('nonsense', AUG)).toEqual({ from: '2026-08', to: '2026-08' });
  });

  it('Today and Yesterday are single day-precise days', () => {
    const DAY = '2026-08-08';
    expect(rangeFor('today', DAY)).toEqual({ from: '2026-08-08', to: '2026-08-08' });
    expect(rangeFor('yesterday', DAY)).toEqual({ from: '2026-08-07', to: '2026-08-07' });
  });

  it('Yesterday rolls back across a month and a year boundary', () => {
    expect(rangeFor('yesterday', '2026-08-01')).toEqual({ from: '2026-07-31', to: '2026-07-31' });
    expect(rangeFor('yesterday', '2026-01-01')).toEqual({ from: '2025-12-31', to: '2025-12-31' });
  });
});

describe('inRange', () => {
  const tx = date => ({ date });

  it('is inclusive at both ends', () => {
    expect(inRange(tx('2026-06-01T00:00'), '2026-06', '2026-08')).toBe(true);
    expect(inRange(tx('2026-08-31T23:59'), '2026-06', '2026-08')).toBe(true);
  });

  it('excludes the months either side', () => {
    expect(inRange(tx('2026-05-31T12:00'), '2026-06', '2026-08')).toBe(false);
    expect(inRange(tx('2026-09-01T00:00'), '2026-06', '2026-08')).toBe(false);
  });

  it('treats a null bound as unbounded', () => {
    expect(inRange(tx('1999-01-01T00:00'), null, '2026-08')).toBe(true);
    expect(inRange(tx('2099-01-01T00:00'), '2026-08', null)).toBe(true);
    expect(inRange(tx('2099-01-01T00:00'), null, null)).toBe(true);
  });

  it('crosses a year boundary correctly, which is the point of comparing strings', () => {
    const r = rangeFor('last3', FEB);
    expect(inRange(tx('2025-12-25T12:00'), r.from, r.to)).toBe(true);
    expect(inRange(tx('2025-11-30T12:00'), r.from, r.to)).toBe(false);
    expect(inRange(tx('2026-03-01T12:00'), r.from, r.to)).toBe(false);
  });

  it('rejects a transaction with no usable date rather than including it', () => {
    expect(inRange({ date: '' }, '2026-01', '2026-12')).toBe(false);
    expect(inRange({}, null, null)).toBe(false);
  });

  it('filters at day precision when the bounds carry a day', () => {
    // A Today window (both bounds the same day) admits only that calendar day.
    expect(inRange(tx('2026-08-08T04:45'), '2026-08-08', '2026-08-08')).toBe(true);
    expect(inRange(tx('2026-08-08T23:59'), '2026-08-08', '2026-08-08')).toBe(true);
    expect(inRange(tx('2026-08-07T23:59'), '2026-08-08', '2026-08-08')).toBe(false);
    expect(inRange(tx('2026-08-09T00:00'), '2026-08-08', '2026-08-08')).toBe(false);
  });
});

describe('presetOf', () => {
  it('recognises every preset it produced', () => {
    for (const p of RANGE_PRESETS) {
      const r = rangeFor(p.id, AUG);
      expect(presetOf(r.from, r.to, AUG)).toBe(p.id);
    }
  });

  it('reports an arbitrary window as custom', () => {
    expect(presetOf('2026-03', '2026-07', AUG)).toBe('custom');
  });

  it('recognises the day presets against a day-precise today', () => {
    const DAY = '2026-08-08';
    expect(presetOf('2026-08-08', '2026-08-08', DAY)).toBe('today');
    expect(presetOf('2026-08-07', '2026-08-07', DAY)).toBe('yesterday');
    // A single day that is neither today nor yesterday is custom, not a month.
    expect(presetOf('2026-08-05', '2026-08-05', DAY)).toBe('custom');
  });
});

describe('rangeLabel', () => {
  it('names a single month in full', () => {
    expect(rangeLabel('2026-08', '2026-08')).toBe('August 2026');
  });

  it('collapses a same-year span to one year', () => {
    expect(rangeLabel('2026-06', '2026-08')).toBe('Jun – Aug 2026');
  });

  it('spells out both years when they differ', () => {
    expect(rangeLabel('2025-12', '2026-02')).toBe('Dec 2025 – Feb 2026');
  });

  it('handles unbounded ranges', () => {
    expect(rangeLabel(null, null)).toBe('All dates');
    expect(rangeLabel('2026-08', null)).toBe('From August 2026');
    expect(rangeLabel(null, '2026-08')).toBe('Up to August 2026');
  });

  it('names a single day, using Today/Yesterday when today is known', () => {
    const DAY = '2026-08-08';
    expect(rangeLabel('2026-08-08', '2026-08-08', DAY)).toBe('Today');
    expect(rangeLabel('2026-08-07', '2026-08-07', DAY)).toBe('Yesterday');
    expect(rangeLabel('2026-08-05', '2026-08-05', DAY)).toBe('5 Aug 2026');
    // Without a today reference a day range still reads as its date.
    expect(rangeLabel('2026-08-08', '2026-08-08')).toBe('8 Aug 2026');
  });
});

describe('clampRange', () => {
  it('swaps a backwards range rather than showing nothing', () => {
    expect(clampRange('2026-08', '2026-02')).toEqual({ from: '2026-02', to: '2026-08' });
  });

  it('leaves a valid range alone', () => {
    expect(clampRange('2026-02', '2026-08')).toEqual({ from: '2026-02', to: '2026-08' });
    expect(clampRange('2026-08', '2026-08')).toEqual({ from: '2026-08', to: '2026-08' });
  });

  it('passes nulls through', () => {
    expect(clampRange(null, null)).toEqual({ from: null, to: null });
  });
});

describe('yearOpts', () => {
  it('spans the earliest transaction year through this year', () => {
    const store = { transactions: [{ date: '2024-03-01T12:00' }, { date: '2026-08-01T12:00' }] };
    expect(yearOpts(store, AUG)).toEqual(['2024', '2025', '2026']);
  });

  it('always offers last year, so the Last Year preset has an option to select', () => {
    // Without this the select holds 2025 with no matching option and the
    // browser silently shows a different year.
    expect(yearOpts({ transactions: [{ date: '2026-08-01T12:00' }] }, AUG)).toEqual(['2025', '2026']);
    expect(yearOpts({ transactions: [] }, AUG)).toEqual(['2025', '2026']);
    expect(yearOpts(null, AUG)).toEqual(['2025', '2026']);
  });

  it('reaches forward to a future-dated transaction so it stays selectable', () => {
    const store = { transactions: [{ date: '2028-01-01T12:00' }] };
    expect(yearOpts(store, AUG)).toEqual(['2025', '2026', '2027', '2028']);
  });

  it('covers every year each preset can select', () => {
    const years = yearOpts({ transactions: [] }, AUG);
    for (const p of RANGE_PRESETS) {
      const r = rangeFor(p.id, AUG);
      for (const bound of [r.from, r.to]) {
        if (bound) expect(years).toContain(bound.slice(0, 4));
      }
    }
  });
});

describe('shiftRange', () => {
  const YEARS = ['2025', '2026', '2027'];

  it('steps a single month', () => {
    expect(shiftRange(AUG, AUG, 1, YEARS)).toEqual({ from: '2026-09', to: '2026-09' });
    expect(shiftRange(AUG, AUG, -1, YEARS)).toEqual({ from: '2026-07', to: '2026-07' });
  });

  it('keeps the width of a multi-month span', () => {
    // The whole point of the arrows: Jan-Jun must not collapse to one month.
    expect(shiftRange('2026-01', '2026-06', 1, YEARS)).toEqual({ from: '2026-02', to: '2026-07' });
    expect(shiftRange('2026-01', '2026-06', -1, YEARS)).toEqual({ from: '2025-12', to: '2026-05' });
  });

  it('carries a span across a year boundary', () => {
    expect(shiftRange('2026-11', '2026-12', 1, YEARS)).toEqual({ from: '2026-12', to: '2027-01' });
  });

  it('moves only the bound that exists, so an open end stays open', () => {
    expect(shiftRange(AUG, null, 1, YEARS)).toEqual({ from: '2026-09', to: null });
    expect(shiftRange(null, AUG, 1, YEARS)).toEqual({ from: null, to: '2026-09' });
  });

  it('refuses to step All Dates — there is nothing to move', () => {
    expect(shiftRange(null, null, 1, YEARS)).toBeNull();
    expect(shiftRange(null, null, -1, YEARS)).toBeNull();
  });

  it('refuses a step past the selectable years, either end', () => {
    // Landing outside `years` would leave the From/To selects showing a year
    // they have no option for.
    expect(shiftRange('2027-12', '2027-12', 1, YEARS)).toBeNull();
    expect(shiftRange('2025-01', '2025-01', -1, YEARS)).toBeNull();
    // A span is refused when EITHER end would leave the window, so it can
    // never be silently truncated.
    expect(shiftRange('2027-06', '2027-12', 1, YEARS)).toBeNull();
    expect(shiftRange('2025-01', '2025-06', -1, YEARS)).toBeNull();
  });

  it('allows a step that stays inside the window', () => {
    expect(shiftRange('2027-11', '2027-11', 1, YEARS)).toEqual({ from: '2027-12', to: '2027-12' });
  });

  it('is unbounded when no years are supplied', () => {
    expect(shiftRange('2099-12', '2099-12', 1)).toEqual({ from: '2100-01', to: '2100-01' });
  });

  it('round-trips: stepping back undoes stepping forward', () => {
    const r = shiftRange('2026-01', '2026-06', 1, YEARS);
    expect(shiftRange(r.from, r.to, -1, YEARS)).toEqual({ from: '2026-01', to: '2026-06' });
  });

  it('steps a day-precise range by a day, not a month', () => {
    expect(shiftRange('2026-08-08', '2026-08-08', -1, YEARS)).toEqual({ from: '2026-08-07', to: '2026-08-07' });
    expect(shiftRange('2026-08-08', '2026-08-08', 1, YEARS)).toEqual({ from: '2026-08-09', to: '2026-08-09' });
    // Day stepping rolls across a month boundary.
    expect(shiftRange('2026-08-01', '2026-08-01', -1, YEARS)).toEqual({ from: '2026-07-31', to: '2026-07-31' });
  });
});
