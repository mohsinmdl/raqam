import { describe, expect, it } from 'vitest';
import { toEpochMs, fmtIsoSec, midpointIso, dayGapAbs, nowIsoSec } from './dates.js';

// All strings are local-time (no timezone suffix), so a round-trip through
// epoch-ms must land back on the same wall-clock string.
describe('toEpochMs / fmtIsoSec round-trip', () => {
  it('round-trips a seconds-precision local string', () => {
    const iso = '2026-08-30T14:30:15';
    expect(fmtIsoSec(toEpochMs(iso))).toBe(iso);
  });
  it('reads a bare-minute string as :00 seconds', () => {
    expect(fmtIsoSec(toEpochMs('2026-08-30T14:30'))).toBe('2026-08-30T14:30:00');
  });
  it('reads a date-only string as local midnight', () => {
    expect(fmtIsoSec(toEpochMs('2026-08-30'))).toBe('2026-08-30T00:00:00');
  });
});

describe('midpointIso', () => {
  it('returns the second-floored midpoint of two moments', () => {
    // 10 seconds apart -> +5s midpoint
    expect(midpointIso('2026-08-30T14:00:00', '2026-08-30T14:00:10')).toBe('2026-08-30T14:00:05');
  });
  it('is order-agnostic', () => {
    expect(midpointIso('2026-08-30T14:00:10', '2026-08-30T14:00:00')).toBe('2026-08-30T14:00:05');
  });
  it('floors to the whole second on an odd gap', () => {
    // 3 seconds apart -> 1.5s -> floored to +1s
    expect(midpointIso('2026-08-30T14:00:00', '2026-08-30T14:00:03')).toBe('2026-08-30T14:00:01');
  });
  it('spans a day boundary correctly', () => {
    // 23:59:58 and 00:00:02 next day are 4s apart -> midpoint 00:00:00
    expect(midpointIso('2026-08-30T23:59:58', '2026-08-31T00:00:02')).toBe('2026-08-31T00:00:00');
  });
});

describe('dayGapAbs', () => {
  it('is 0 within the same day regardless of time', () => {
    expect(dayGapAbs('2026-08-30T23:59:00', '2026-08-30T00:00:00')).toBe(0);
  });
  it('counts calendar days, not elapsed hours', () => {
    // 1 minute apart but across midnight = 1 calendar day
    expect(dayGapAbs('2026-08-31T00:00:00', '2026-08-30T23:59:00')).toBe(1);
  });
  it('is symmetric', () => {
    expect(dayGapAbs('2026-08-27T09:00', '2026-08-30T21:00')).toBe(3);
    expect(dayGapAbs('2026-08-30T21:00', '2026-08-27T09:00')).toBe(3);
  });
});

describe('nowIsoSec', () => {
  it('emits a seconds-precision local timestamp', () => {
    expect(nowIsoSec()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

// Malformed input must surface as NaN/'' — never a bogus 1900 date or a truthy
// 'NaN-…' string — so a bad neighbour date routes a drop to the picker and can
// never be laundered into the store.
describe('date helpers reject malformed input honestly', () => {
  it('toEpochMs returns NaN for missing/empty/garbage input', () => {
    expect(toEpochMs(undefined)).toBeNaN();
    expect(toEpochMs(null)).toBeNaN();
    expect(toEpochMs('')).toBeNaN();
    expect(toEpochMs('garbage')).toBeNaN();
  });
  it('fmtIsoSec returns empty string for a non-finite ms', () => {
    expect(fmtIsoSec(NaN)).toBe('');
    expect(fmtIsoSec(toEpochMs('nope'))).toBe('');
  });
  it('midpointIso returns empty string when a side is unparseable', () => {
    expect(midpointIso('garbage', '2026-08-30T10:00:00')).toBe('');
  });
  it('dayGapAbs returns NaN when a side is unparseable', () => {
    expect(dayGapAbs('garbage', '2026-08-30')).toBeNaN();
  });
});
