// toCsv escaping + join rules. downloadCsv is browser-only (Blob/anchor) and
// is intentionally not tested here.
import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/lib/csv.js';

describe('toCsv', () => {
  it('includes the header row', () => {
    const csv = toCsv(['Category', 'Amount'], [['Rent', 40000]]);
    expect(csv.split('\r\n')[0]).toBe('Category,Amount');
  });

  it('joins rows with CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('escapes fields containing a comma', () => {
    const csv = toCsv(['Name'], [['Food, drink']]);
    expect(csv).toBe('Name\r\n"Food, drink"');
  });

  it('escapes fields containing a double-quote by doubling it', () => {
    const csv = toCsv(['Name'], [['Say "hi"']]);
    expect(csv).toBe('Name\r\n"Say ""hi"""');
  });

  it('escapes fields containing a newline', () => {
    const csv = toCsv(['Name'], [['Line1\nLine2']]);
    expect(csv).toBe('Name\r\n"Line1\nLine2"');
  });

  it('escapes fields containing a carriage return', () => {
    const csv = toCsv(['Name'], [['Line1\rLine2']]);
    expect(csv).toBe('Name\r\n"Line1\rLine2"');
  });

  it('leaves plain numbers and strings unescaped', () => {
    const csv = toCsv(['Category', 'Amount', 'Percent'], [['Rent', 40000, '33%']]);
    expect(csv).toBe('Category,Amount,Percent\r\nRent,40000,33%');
  });

  it('handles an empty rows array (header only)', () => {
    const csv = toCsv(['A', 'B'], []);
    expect(csv).toBe('A,B');
  });
});
