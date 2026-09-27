// Low-balance hint: an account whose balance is under the user's threshold gets
// a subtle "top up" marker. Threshold is a user pref (default 5000); 0 disables.
import { describe, it, expect } from 'vitest';
import { LOW_BALANCE_DEFAULT, lowBalanceThreshold, isLowBalance } from '../src/lib/lowBalance.js';

describe('lowBalanceThreshold', () => {
  it('defaults to 5000 when the pref is unset or invalid', () => {
    expect(LOW_BALANCE_DEFAULT).toBe(5000);
    expect(lowBalanceThreshold(undefined)).toBe(5000);
    expect(lowBalanceThreshold({})).toBe(5000);
    expect(lowBalanceThreshold({ lowBalanceThreshold: null })).toBe(5000);
    expect(lowBalanceThreshold({ lowBalanceThreshold: 'abc' })).toBe(5000);
    expect(lowBalanceThreshold({ lowBalanceThreshold: NaN })).toBe(5000);
    expect(lowBalanceThreshold({ lowBalanceThreshold: -10 })).toBe(5000); // negative is invalid → default
  });
  it('honours a set threshold, including 0 (disabled)', () => {
    expect(lowBalanceThreshold({ lowBalanceThreshold: 10000 })).toBe(10000);
    expect(lowBalanceThreshold({ lowBalanceThreshold: 0 })).toBe(0);
    expect(lowBalanceThreshold({ lowBalanceThreshold: 250.5 })).toBe(250.5);
  });
});

describe('isLowBalance', () => {
  it('flags balances strictly under a positive threshold, negatives included', () => {
    expect(isLowBalance(4999, 5000)).toBe(true);
    expect(isLowBalance(0, 5000)).toBe(true);
    expect(isLowBalance(-200, 5000)).toBe(true);
    expect(isLowBalance(5000, 5000)).toBe(false); // exactly at threshold is fine
    expect(isLowBalance(5001, 5000)).toBe(false);
  });
  it('is disabled when the threshold is 0 or negative', () => {
    expect(isLowBalance(10, 0)).toBe(false);
    expect(isLowBalance(-10, 0)).toBe(false);
    expect(isLowBalance(10, -5)).toBe(false);
  });
  it('ignores a non-finite balance', () => {
    expect(isLowBalance(NaN, 5000)).toBe(false);
    expect(isLowBalance(undefined, 5000)).toBe(false);
  });
});
