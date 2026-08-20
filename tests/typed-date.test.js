import { describe, it, expect } from 'vitest';
import { parseTypedDate } from '../src/lib/dates.js';

// The register's DATE cell is a typed field. These pin what a hand is allowed
// to produce — and, just as importantly, what must come back null so the cell
// wears the --neg ring instead of silently inventing a date.
const TODAY = '2026-08-20';

describe('parseTypedDate — the lenient half', () => {
  it('reads a bare day as that day of the month you are in', () => {
    expect(parseTypedDate('17', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('1', TODAY)).toBe('2026-08-01');
    expect(parseTypedDate('31', TODAY)).toBe('2026-08-31');
  });

  it('reads day/month as this year', () => {
    expect(parseTypedDate('17/8', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('3/1', TODAY)).toBe('2026-01-03');
  });

  it('expands a two-digit year to 20xx', () => {
    expect(parseTypedDate('17/8/26', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('1/1/99', TODAY)).toBe('2099-01-01');
  });

  it('takes a full four-digit year', () => {
    expect(parseTypedDate('17/08/2026', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('9/3/1998', TODAY)).toBe('1998-03-09');
  });

  it('accepts . and - as separators too, and zero padding either way', () => {
    expect(parseTypedDate('17-8-26', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('17.08.2026', TODAY)).toBe('2026-08-17');
    expect(parseTypedDate('07/09', TODAY)).toBe('2026-09-07');
  });

  it('recognises ISO order by its four-digit first part', () => {
    expect(parseTypedDate('2026-08-17', TODAY)).toBe('2026-08-17');
  });

  it('ignores surrounding whitespace', () => {
    expect(parseTypedDate('  17/8  ', TODAY)).toBe('2026-08-17');
  });

  it('keeps the day inside the month it lands in, leap year included', () => {
    expect(parseTypedDate('29/2/2028', TODAY)).toBe('2028-02-29'); // leap
  });
});

describe('parseTypedDate — the strict half', () => {
  it('rejects empty and blank input', () => {
    expect(parseTypedDate('', TODAY)).toBe(null);
    expect(parseTypedDate('   ', TODAY)).toBe(null);
    expect(parseTypedDate(null, TODAY)).toBe(null);
    expect(parseTypedDate(undefined, TODAY)).toBe(null);
  });

  it('rejects a day the month does not have', () => {
    expect(parseTypedDate('31/2', TODAY)).toBe(null);
    expect(parseTypedDate('31/4/2026', TODAY)).toBe(null);
    expect(parseTypedDate('29/2/2026', TODAY)).toBe(null); // 2026 is not a leap year
    expect(parseTypedDate('0/8', TODAY)).toBe(null);
  });

  it('rejects an impossible month', () => {
    expect(parseTypedDate('17/13', TODAY)).toBe(null);
    expect(parseTypedDate('17/0', TODAY)).toBe(null);
  });

  it('rejects a bare day the current month does not have', () => {
    expect(parseTypedDate('31', '2026-09-15')).toBe(null); // September has 30
    expect(parseTypedDate('32', TODAY)).toBe(null);
  });

  it('rejects letters and junk rather than guessing', () => {
    expect(parseTypedDate('yesterday', TODAY)).toBe(null);
    expect(parseTypedDate('17 aug', TODAY)).toBe(null);
    expect(parseTypedDate('17/8/2026/1', TODAY)).toBe(null);
  });

  it('rejects a year outside the range a ledger plausibly holds', () => {
    expect(parseTypedDate('1/1/1899', TODAY)).toBe(null);
    expect(parseTypedDate('1/1/3001', TODAY)).toBe(null);
  });
});
