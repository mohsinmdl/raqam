import { describe, it, expect } from 'vitest';
import { planBar } from '../src/lib/planBar.js';

const money = n => 'Rs ' + n.toLocaleString('en-US');
const cat = over => ({ id: 'c', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: false, ...over });
const row = over => ({ assigned: 0, activity: 0, available: 0, carryIn: 0, ...over });

describe('planBar — spending categories', () => {
  it('empty row: nothing budgeted, nothing spent → no bar, no label', () => {
    const b = planBar(row(), cat(), money);
    expect(b.show).toBe(false);
    expect(b.state).toBe('empty');
    expect(b.label).toBe('');
    expect(b.greenPct).toBe(0);
    expect(b.redPct).toBe(0);
  });

  it('partially spent → green fills spend/budget, "Spent X of Y"', () => {
    const b = planBar(row({ assigned: 200000, activity: -20000 }), cat(), money);
    expect(b.state).toBe('partial');
    expect(b.label).toBe('Spent Rs 20,000 of Rs 200,000');
    expect(b.greenPct).toBeCloseTo(0.1);
    expect(b.redPct).toBe(0);
    expect(b.show).toBe(true);
  });

  it('fully spent → full green bar, "Fully Spent"', () => {
    const b = planBar(row({ assigned: 100, activity: -100 }), cat(), money);
    expect(b.state).toBe('full');
    expect(b.label).toBe('Fully Spent');
    expect(b.greenPct).toBe(1);
    expect(b.redPct).toBe(0);
  });

  it('overspent → green covers the budgeted share, red the overage', () => {
    // spend 150 of budget 100 → green 100/150, red 50/150
    const b = planBar(row({ assigned: 100, activity: -150 }), cat(), money);
    expect(b.state).toBe('over');
    expect(b.label).toBe('Overspent. Rs 150 of Rs 100');
    expect(b.greenPct).toBeCloseTo(100 / 150);
    expect(b.redPct).toBeCloseTo(50 / 150);
    expect(b.greenPct + b.redPct).toBeCloseTo(1);
  });

  it('spending with zero budget but some spend → all red overage', () => {
    const b = planBar(row({ assigned: 0, activity: -50 }), cat(), money);
    expect(b.state).toBe('over');
    expect(b.greenPct).toBe(0);
    expect(b.redPct).toBe(1);
    expect(b.label).toBe('Overspent. Rs 50 of Rs 0');
  });

  it('carryIn counts toward the budget denominator', () => {
    const b = planBar(row({ carryIn: 100, assigned: 100, activity: -100 }), cat(), money);
    expect(b.state).toBe('partial');
    expect(b.greenPct).toBeCloseTo(0.5); // 100 spent of 200 budget
    expect(b.label).toBe('Spent Rs 100 of Rs 200');
  });

  it('positive activity (a refund) is not spend → treated as empty when nothing budgeted', () => {
    const b = planBar(row({ activity: 50 }), cat(), money);
    expect(b.show).toBe(false);
    expect(b.state).toBe('empty');
  });
});

describe('planBar — target categories', () => {
  const refill = over => cat({ targetAmount: 80000, targetMode: 'refill', ...over });

  it('underfunded refill target → "<need> more needed", green to funded fraction', () => {
    const b = planBar(row({ available: 5000 }), refill(), money);
    expect(b.state).toBe('funding');
    expect(b.label).toBe('Rs 75,000 more needed');
    expect(b.greenPct).toBeCloseTo(5000 / 80000);
    expect(b.redPct).toBe(0);
    expect(b.show).toBe(true);
  });

  it('funded refill target → "Funded", full green', () => {
    const b = planBar(row({ available: 80000 }), refill(), money);
    expect(b.state).toBe('full');
    expect(b.label).toBe('Funded');
    expect(b.greenPct).toBe(1);
  });

  it('setaside target funds from assigned, not available', () => {
    const b = planBar(row({ assigned: 40000, available: 0 }), cat({ targetAmount: 80000, targetMode: 'setaside' }), money);
    expect(b.state).toBe('funding');
    expect(b.greenPct).toBeCloseTo(0.5);
    expect(b.label).toBe('Rs 40,000 more needed');
  });

  it('target bar never shows a red overage segment', () => {
    const b = planBar(row({ available: 120000 }), refill(), money);
    expect(b.redPct).toBe(0);
  });
});
