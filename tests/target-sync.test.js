import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/store/sync.js';

const categories = COLLECTIONS.find(c => c.name === 'categories');

describe('categories sync mapping — target fields', () => {
  it('toRow serializes target fields, defaulting to explicit null', () => {
    const bare = categories.toRow({ id: 'c1', name: 'Rent', type: 'expense', color: '#000', excludeFromBudget: false });
    expect(bare.target_amount).toBe(null);
    expect(bare.target_mode).toBe(null);
    expect(bare.target_due_day).toBe(null);
    const withT = categories.toRow({ id: 'c2', name: 'Fuel', type: 'expense', color: '#000', targetAmount: 25000, targetMode: 'refill', targetDueDay: 15 });
    expect(withT.target_amount).toBe(25000);
    expect(withT.target_mode).toBe('refill');
    expect(withT.target_due_day).toBe(15);
  });
  it('fromRow hydrates target fields and omits them when null', () => {
    const bare = categories.fromRow({ id: 'c1', name: 'Rent', type: 'expense', color: '#000', target_amount: null, target_mode: null, target_due_day: null });
    expect('targetAmount' in bare).toBe(false);
    expect('targetMode' in bare).toBe(false);
    const withT = categories.fromRow({ id: 'c2', name: 'Fuel', type: 'expense', color: '#000', target_amount: 25000, target_mode: 'setaside', target_due_day: null });
    expect(withT.targetAmount).toBe(25000);
    expect(withT.targetMode).toBe('setaside');
    expect('targetDueDay' in withT).toBe(false); // null due-day = last day of month, omitted
  });
});
