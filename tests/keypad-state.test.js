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
  it('preserves unicode-minus leading-op adjust semantics', () => {
    expect(evaluate(5000, '+500')).toBe(5500);
    expect(evaluate(100, '−50')).toBe(50);      // unicode minus stays an operator
  });
  it('treats a plain ASCII-hyphen-prefixed numeric draft as a literal, not adjust-current', () => {
    // String(negative) produces an ASCII '-' prefix; that must NOT be parsed
    // as a leading-operator adjustment (would wrongly compute current - 50).
    expect(evaluate(100, '-50')).toBe(-50);     // NOT 50
    expect(evaluate(100, '50')).toBe(50);
  });
  it('is idempotent when re-evaluating a negative result (= then Done)', () => {
    const first = evaluate(100, '10−60'); // full expression, not a leading op
    expect(first).toBe(-50);
    const second = evaluate(100, String(first)); // '-50' — must stay -50, not 100-50
    expect(second).toBe(-50);
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
