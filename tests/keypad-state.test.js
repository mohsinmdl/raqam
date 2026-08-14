// tests/keypad-state.test.js
import { describe, it, expect } from 'vitest';
import { pressDigit, pressOp, pressBackspace, pressClear, evaluate, displayOf } from '../src/ui/plan/phone/keypadState.js';

describe('keypad draft editing', () => {
  it('appends digits', () => {
    expect(pressDigit('', '5')).toBe('5');
    expect(pressDigit('5', '0')).toBe('50');
  });
  it('blocks a redundant leading zero per number segment', () => {
    expect(pressDigit('0', '0')).toBe('0');
    expect(pressDigit('', '0')).toBe('0');
    expect(pressDigit('0', '5')).toBe('5');      // 0 then 5 → 5, calculator style
    expect(pressDigit('10+0', '0')).toBe('10+0'); // second segment guarded too
    expect(pressDigit('10+0', '7')).toBe('10+7');
  });
  it('appends operators and replaces a trailing operator', () => {
    expect(pressOp('500', '+')).toBe('500+');
    expect(pressOp('500+', '×')).toBe('500×');
    expect(pressOp('', '+')).toBe('+'); // leading op → adjust-current semantics
  });
  it('backspace and clear', () => {
    expect(pressBackspace('500+')).toBe('500');
    expect(pressBackspace('')).toBe('');
    expect(pressClear()).toBe('');
  });
});

describe('evaluate', () => {
  it('delegates to applyCalcExpr semantics', () => {
    expect(evaluate(0, '20+40')).toBe(60);
    expect(evaluate(0, '20+40×2')).toBe(120);   // left-to-right
    expect(evaluate(5000, '+500')).toBe(5500);  // leading op seeds current
    expect(evaluate(100, '')).toBe(null);
    expect(evaluate(100, '20+')).toBe(null);    // trailing op invalid
  });
});

describe('displayOf', () => {
  it('groups each digit run', () => {
    expect(displayOf('1500')).toBe('1,500');
    expect(displayOf('1500+40')).toBe('1,500+40');
    expect(displayOf('1500000×2')).toBe('1,500,000×2');
    expect(displayOf('')).toBe('');
    expect(displayOf('+500')).toBe('+500');
  });
});
