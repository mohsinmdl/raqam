import { describe, it, expect } from 'vitest';
import { calendarCells, shiftMonth, yearGridFor } from '../src/lib/calendar.js';

describe('shiftMonth', () => {
  it('steps forward across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('steps backward across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('calendarCells', () => {
  it('starts on the Sunday on or before the 1st', () => {
    // Aug 2026 starts on a Saturday → grid starts Sun 26 Jul.
    const cells = calendarCells('2026-08', null, '2026-08-20');
    expect(cells[0].iso).toBe('2026-07-26');
    expect(cells[0].out).toBe(true);
  });
  it('drops a trailing all-out-of-month week (five-row month)', () => {
    const cells = calendarCells('2026-08', null, '2026-08-20');
    expect(cells.length).toBe(42); // Aug 2026 spans 6 weeks (Sat start, 31 days)
    const jun = calendarCells('2026-06', null, '2026-08-20');
    expect(jun.length).toBe(35); // June 2026 fits 5 rows
  });
  it('marks selected and today', () => {
    const cells = calendarCells('2026-08', '2026-08-17', '2026-08-20');
    expect(cells.find(c => c.iso === '2026-08-17').sel).toBe(true);
    expect(cells.find(c => c.iso === '2026-08-20').today).toBe(true);
  });
});

describe('yearGridFor', () => {
  it('returns 12 years with the center year 5 in from the start', () => {
    const years = yearGridFor(2026);
    expect(years.length).toBe(12);
    expect(years[5]).toBe(2026);
  });
  it('spans 5 years back and 6 years forward of the center', () => {
    const years = yearGridFor(2026);
    expect(years[0]).toBe(2021);
    expect(years[years.length - 1]).toBe(2032);
  });
  it('is contiguous', () => {
    const years = yearGridFor(2000);
    for (let i = 1; i < years.length; i++) expect(years[i]).toBe(years[i - 1] + 1);
  });
});
