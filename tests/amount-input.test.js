import { describe, it, expect } from 'vitest';
import { caretAfterDigits, digitsBefore, formatAmountInput } from '../src/lib/amountInput.js';
import { parseAmt } from '../src/lib/util.js';

describe('formatAmountInput', () => {
  it('groups thousands as you type', () => {
    expect(formatAmountInput('1000000')).toBe('1,000,000');
    expect(formatAmountInput('1000')).toBe('1,000');
    expect(formatAmountInput('45000')).toBe('45,000');
  });

  it('leaves short numbers alone', () => {
    expect(formatAmountInput('7')).toBe('7');
    expect(formatAmountInput('999')).toBe('999');
    expect(formatAmountInput('')).toBe('');
  });

  it('regroups text that already has separators, so re-editing is stable', () => {
    expect(formatAmountInput('1,000,000')).toBe('1,000,000');
    // A digit typed into the middle: separators land in their new places.
    expect(formatAmountInput('1,0900,000')).toBe('10,900,000');
  });

  it('discards anything that is not a number', () => {
    expect(formatAmountInput('Rs 3,200')).toBe('3,200');
    expect(formatAmountInput('12ab34')).toBe('1,234');
    expect(formatAmountInput('-500')).toBe('500');
  });

  it('groups only the integer part', () => {
    expect(formatAmountInput('1234567.89')).toBe('1,234,567.89');
  });

  it('keeps a trailing dot, which is a normal moment mid-typing', () => {
    expect(formatAmountInput('1234.')).toBe('1,234.');
  });

  it('keeps the first decimal point and drops later ones', () => {
    expect(formatAmountInput('12.34.56')).toBe('12.3456');
  });

  it('never changes the number parseAmt reads, for anything numeric', () => {
    for (const raw of ['1000000', '3200', '45000.75', '999', '0', '1,234,567']) {
      expect(parseAmt(formatAmountInput(raw))).toBe(parseAmt(raw));
    }
  });

  it('strips stray letters rather than truncating at them', () => {
    // parseAmt alone would read '12ab34' as 12, because parseFloat stops at the
    // first letter. Formatting keeps every digit instead: 1,234. The two can
    // only disagree on input the field can no longer hold — letters are removed
    // on the keystroke that types them — so this is documented, not relied on.
    expect(formatAmountInput('12ab34')).toBe('1,234');
    expect(parseAmt('12ab34')).toBe(12);
  });

  it('is idempotent — formatting formatted text changes nothing', () => {
    for (const raw of ['1000000', '1,234,567.89', '7', '']) {
      const once = formatAmountInput(raw);
      expect(formatAmountInput(once)).toBe(once);
    }
  });
});

describe('caret tracking', () => {
  it('counts value characters, skipping separators', () => {
    expect(digitsBefore('1,000,000', 9)).toBe(7);   // end
    expect(digitsBefore('1,000,000', 0)).toBe(0);   // start
    expect(digitsBefore('1,000,000', 5)).toBe(4);   // after "1,000"
  });

  it('places the caret after the nth value character', () => {
    expect(caretAfterDigits('1,000,000', 7)).toBe(9);
    expect(caretAfterDigits('1,000,000', 1)).toBe(1);
    expect(caretAfterDigits('1,000,000', 0)).toBe(0);
  });

  it('round-trips: the caret keeps its place across a regroup', () => {
    // Typing "0" at the end of "100,000" gives "100,0000"; after regrouping to
    // "1,000,000" the caret must still sit at the end, not jump.
    const typed = '100,0000';
    const n = digitsBefore(typed, typed.length);
    const regrouped = formatAmountInput(typed);
    expect(regrouped).toBe('1,000,000');
    expect(caretAfterDigits(regrouped, n)).toBe(regrouped.length);
  });

  it('holds position when a separator is inserted to the left of the caret', () => {
    // "999" -> type "1" at the front -> "1999" -> "1,999". The caret was after
    // one digit; it must stay after that digit, not drift across the new comma.
    const n = digitsBefore('1999', 1);
    expect(caretAfterDigits(formatAmountInput('1999'), n)).toBe(1);
  });

  it('clamps past the end rather than returning a bad offset', () => {
    expect(caretAfterDigits('1,000', 99)).toBe(5);
    expect(caretAfterDigits('', 3)).toBe(0);
  });
});
