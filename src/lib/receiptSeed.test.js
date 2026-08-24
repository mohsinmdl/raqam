// U3 receipt-scan — seed builder unit tests (Step 5). Pure, node env: exercises
// the seed shape, the missing-total and missing-date defaults, the usability
// guard, and lockstep with the pinned modal fixture.
import { describe, expect, it } from 'vitest';
import receiptRes from '../../modal/fixtures/parse-receipt.response.json';
import { todayStr } from './dates.js';
import { isUsableReceipt, toReceiptSeed } from './receiptSeed.js';

describe('toReceiptSeed — shape', () => {
  it('maps a full parse to an expense seed (integer PKR string, iso date)', () => {
    const seed = toReceiptSeed({ merchant: 'SHELL', date: '2026-08-20', total: 6000 });
    expect(seed).toEqual({ type: 'expense', amount: '6000', date: '2026-08-20', merchant: 'SHELL' });
  });
});

describe('toReceiptSeed — missing fields', () => {
  it('no total → amount is empty so the editor requires it', () => {
    const seed = toReceiptSeed({ merchant: 'SHELL', date: '2026-08-20' });
    expect(seed.amount).toBe('');
    expect(seed.merchant).toBe('SHELL');
  });

  it('no date → falls back to today (never invents a past date)', () => {
    const seed = toReceiptSeed({ merchant: 'SHELL', total: 100 });
    expect(seed.date).toBe(todayStr());
  });

  it('empty parse → blank expense seed', () => {
    expect(toReceiptSeed({})).toEqual({ type: 'expense', amount: '', date: todayStr(), merchant: '' });
    expect(toReceiptSeed(null)).toEqual({ type: 'expense', amount: '', date: todayStr(), merchant: '' });
  });
});

describe('isUsableReceipt', () => {
  it('is usable with a total OR a merchant, not with neither', () => {
    expect(isUsableReceipt({ total: 500 })).toBe(true);
    expect(isUsableReceipt({ merchant: 'SHELL' })).toBe(true);
    expect(isUsableReceipt({ merchant: '   ' })).toBe(false);
    expect(isUsableReceipt({})).toBe(false);
    expect(isUsableReceipt(null)).toBe(false);
  });
});

describe('toReceiptSeed — fixture lockstep', () => {
  it('matches modal/fixtures/parse-receipt.response.json', () => {
    const parsed = receiptRes.parsed;
    expect(isUsableReceipt(parsed)).toBe(true);
    expect(toReceiptSeed(parsed)).toEqual({
      type: 'expense',
      amount: '5420',
      date: '2026-08-24',
      merchant: 'Imtiaz Super Market',
    });
  });
});
