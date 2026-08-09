import { describe, it, expect } from 'vitest';
import { hasTarget, targetNeeded, isOverTarget, costToBeMe, targetSummary } from '../src/lib/targets.js';

const money = n => 'Rs ' + n.toLocaleString('en-US');
const cat = over => ({ id: 'c', name: 'Fuel', type: 'expense', status: 'active', excludeFromBudget: false, ...over });
const row = over => ({ assigned: 0, activity: 0, available: 0, carryIn: 0, ...over });

describe('hasTarget', () => {
  it('true only with a positive amount and not excluded', () => {
    expect(hasTarget(cat({ targetAmount: 5000, targetMode: 'refill' }))).toBe(true);
    expect(hasTarget(cat({ targetAmount: 0, targetMode: 'refill' }))).toBe(false);
    expect(hasTarget(cat({}))).toBe(false);
    expect(hasTarget(cat({ targetAmount: 5000, targetMode: 'refill', excludeFromBudget: true }))).toBe(false);
  });
});

describe('targetNeeded', () => {
  it('refill: shortfall against available, floored at 0', () => {
    const c = cat({ targetAmount: 10000, targetMode: 'refill' });
    expect(targetNeeded(row({ available: 3000 }), c)).toBe(7000);
    expect(targetNeeded(row({ available: 10000 }), c)).toBe(0);
    expect(targetNeeded(row({ available: 12000 }), c)).toBe(0); // over-funded floors at 0
  });
  it('setaside: shortfall against assigned, ignoring carry-in', () => {
    const c = cat({ targetAmount: 5000, targetMode: 'setaside' });
    expect(targetNeeded(row({ assigned: 2000, carryIn: 9999, available: 11999 }), c)).toBe(3000);
    expect(targetNeeded(row({ assigned: 5000 }), c)).toBe(0);
  });
  it('is 0 when there is no target or the category is excluded', () => {
    expect(targetNeeded(row({ available: 0 }), cat({}))).toBe(0);
    expect(targetNeeded(row({ available: 0 }), cat({ targetAmount: 9000, targetMode: 'refill', excludeFromBudget: true }))).toBe(0);
  });
});

describe('isOverTarget', () => {
  it('refill compares available, setaside compares assigned', () => {
    expect(isOverTarget(row({ available: 12000 }), cat({ targetAmount: 10000, targetMode: 'refill' }))).toBe(true);
    expect(isOverTarget(row({ available: 10000 }), cat({ targetAmount: 10000, targetMode: 'refill' }))).toBe(false);
    expect(isOverTarget(row({ assigned: 6000 }), cat({ targetAmount: 5000, targetMode: 'setaside' }))).toBe(true);
    expect(isOverTarget(row({ assigned: 6000 }), cat({}))).toBe(false); // no target
  });
});

describe('costToBeMe', () => {
  it('sums targetAmount over targeted, non-excluded cats only', () => {
    const cats = [
      cat({ id: 'a', targetAmount: 5000, targetMode: 'refill' }),
      cat({ id: 'b', targetAmount: 3000, targetMode: 'setaside', excludeFromBudget: true }), // excluded → skip
      cat({ id: 'c' }), // no target → skip
      cat({ id: 'd', targetAmount: 2000, targetMode: 'refill' }),
    ];
    expect(costToBeMe(cats)).toBe(7000);
  });
});

describe('targetSummary', () => {
  it('reads mode + amount + monthly cadence', () => {
    expect(targetSummary(cat({ targetAmount: 25000, targetMode: 'refill' }), money)).toBe('Refill up to Rs 25,000 monthly');
    expect(targetSummary(cat({ targetAmount: 5000, targetMode: 'setaside' }), money)).toBe('Set aside Rs 5,000 monthly');
  });
});
