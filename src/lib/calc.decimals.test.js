import { describe, expect, it } from 'vitest';
import { fmtNum, fmtPKR, fmtSigned } from './calc.js';

// The `decimals` flag (3rd arg on fmtPKR/fmtSigned, 2nd on fmtNum) is opt-in:
// omitted → current whole-rupee behaviour; truthy → always two fraction digits.
describe('formatter decimals flag', () => {
  it('fmtNum keeps whole rupees when decimals is falsy', () => {
    expect(fmtNum(1234)).toBe('1,234');
    expect(fmtNum(1234.6)).toBe('1,235'); // rounds, as before
  });

  it('fmtNum shows two fraction digits when decimals is on', () => {
    expect(fmtNum(1234, true)).toBe('1,234.00');
    expect(fmtNum(1234.5, true)).toBe('1,234.50'); // no rounding away of fractions
  });

  it('fmtPKR threads decimals through, sign preserved', () => {
    expect(fmtPKR(1234, false)).toBe('Rs 1,234');
    expect(fmtPKR(1234, false, true)).toBe('Rs 1,234.00');
    expect(fmtPKR(-1234, false, true)).toBe('−Rs 1,234.00');
  });

  it('fmtSigned threads decimals through, sign preserved', () => {
    expect(fmtSigned(1234, false, true)).toBe('+Rs 1,234.00');
    expect(fmtSigned(-1234, false, true)).toBe('−Rs 1,234.00');
    expect(fmtSigned(0, false, true)).toBe('Rs 0.00');
  });

  it('mask still wins over decimals', () => {
    expect(fmtPKR(1234, true, true)).toBe('Rs ••••••');
    expect(fmtSigned(1234, true, true)).toBe('Rs ••••••');
  });
});
