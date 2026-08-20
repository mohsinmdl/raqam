import { describe, expect, it } from 'vitest';
import { maskDigits, fmtPKR, fmtSigned } from './calc.js';

// Wave M — masked mode is digit-preserving: every digit becomes '•', while
// the 'Rs ' prefix, grouping commas, decimal point, and any sign survive
// untouched. Bullet count differentiates magnitude without revealing it.
describe('maskDigits', () => {
  it('replaces every digit with a bullet, leaving separators alone', () => {
    expect(maskDigits('Rs 425,000')).toBe('Rs •••,•••');
  });

  it('masks a small ungrouped figure to a shorter run of bullets', () => {
    expect(maskDigits('Rs 450')).toBe('Rs •••');
  });

  it('masks zero', () => {
    expect(maskDigits('Rs 0')).toBe('Rs •');
  });

  it('preserves a decimal point and both fraction digits', () => {
    expect(maskDigits('Rs 1,234.50')).toBe('Rs •,•••.••');
  });

  it('preserves a leading sign', () => {
    expect(maskDigits('−Rs 1,234')).toBe('−Rs •,•••');
    expect(maskDigits('+Rs 1,234')).toBe('+Rs •,•••');
  });

  it('leaves no digit surviving in the output', () => {
    expect(maskDigits('Rs 9,876,543.21')).not.toMatch(/[0-9]/);
  });
});

describe('fmtPKR / fmtSigned masked branch', () => {
  it('fmtPKR masks a large grouped amount, preserving commas', () => {
    expect(fmtPKR(425000, true)).toBe('Rs •••,•••');
  });

  it('fmtPKR masks a small amount to fewer bullets', () => {
    expect(fmtPKR(450, true)).toBe('Rs •••');
  });

  it('fmtPKR masks zero', () => {
    expect(fmtPKR(0, true)).toBe('Rs •');
  });

  it('fmtPKR masks a negative amount, preserving the minus sign', () => {
    expect(fmtPKR(-425000, true)).toBe('−Rs •••,•••');
  });

  it('fmtPKR masks with decimals on, preserving the decimal point', () => {
    expect(fmtPKR(1234.5, true, true)).toBe('Rs •,•••.••');
  });

  it('fmtSigned masks a positive amount, preserving the plus sign', () => {
    expect(fmtSigned(425000, true)).toBe('+Rs •••,•••');
  });

  it('fmtSigned masks a negative amount, preserving the minus sign', () => {
    expect(fmtSigned(-450, true)).toBe('−Rs •••');
  });

  it('unmasked path is untouched — no bullets when masked is falsy', () => {
    expect(fmtPKR(425000, false)).toBe('Rs 425,000');
    expect(fmtSigned(425000, false)).toBe('+Rs 425,000');
  });
});
