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
});
