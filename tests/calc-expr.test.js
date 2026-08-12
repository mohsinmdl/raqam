import { describe, it, expect } from 'vitest';
import { applyCalcExpr } from '../src/lib/calcExpr.js';

describe('applyCalcExpr', () => {
  it('plain numbers replace the value', () => {
    expect(applyCalcExpr(5000, '12000')).toBe(12000);
    expect(applyCalcExpr(5000, '12,000')).toBe(12000);
    expect(applyCalcExpr(5000, '  700 ')).toBe(700);
  });
  it('applies leading operators to the current value', () => {
    expect(applyCalcExpr(5000, '+500')).toBe(5500);
    expect(applyCalcExpr(5000, '-500')).toBe(4500);
    expect(applyCalcExpr(5000, '−500')).toBe(4500);   // unicode minus
    expect(applyCalcExpr(5000, '×2')).toBe(10000);
    expect(applyCalcExpr(5000, '*2')).toBe(10000);
    expect(applyCalcExpr(5000, '÷4')).toBe(1250);
    expect(applyCalcExpr(5000, '/4')).toBe(1250);
  });
  it('rounds results and allows negatives', () => {
    expect(applyCalcExpr(100, '÷3')).toBe(33);
    expect(applyCalcExpr(100, '-250')).toBe(-150);
    expect(applyCalcExpr(100, '×1.5')).toBe(150);
  });
  it('rejects invalid input with null', () => {
    expect(applyCalcExpr(100, '')).toBe(null);
    expect(applyCalcExpr(100, 'abc')).toBe(null);
    expect(applyCalcExpr(100, '+')).toBe(null);
    expect(applyCalcExpr(100, '÷0')).toBe(null);
    expect(applyCalcExpr(100, '+-3')).toBe(null);
  });

  it('evaluates a left-to-right infix chain of plain numbers', () => {
    expect(applyCalcExpr(5000, '20+40')).toBe(60);
    expect(applyCalcExpr(5000, '20 + 40')).toBe(60);
    expect(applyCalcExpr(5000, '1,000+500')).toBe(1500);
  });

  it('a leading operator seeds the accumulator with current, then folds the rest', () => {
    expect(applyCalcExpr(5000, '+20+40')).toBe(5060);
    expect(applyCalcExpr(5000, '+500')).toBe(5500);
  });

  it('has no operator precedence — strictly left-to-right', () => {
    expect(applyCalcExpr(5000, '20+40×2')).toBe(120); // NOT 100
    expect(applyCalcExpr(5000, '100-30-20')).toBe(50);
    expect(applyCalcExpr(5000, '100÷4÷5')).toBe(5);
  });

  it('mixes unicode and ASCII operators in one chain', () => {
    expect(applyCalcExpr(5000, '20 × 2 ÷ 4')).toBe(10);
  });

  it('rejects malformed or unsafe chains with null', () => {
    expect(applyCalcExpr(100, '20+')).toBe(null);
    expect(applyCalcExpr(100, '20++40')).toBe(null);
    expect(applyCalcExpr(100, '20÷0+5')).toBe(null);
    expect(applyCalcExpr(100, '20+abc')).toBe(null);
  });
});
