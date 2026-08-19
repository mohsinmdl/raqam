import { describe, it, expect } from 'vitest';
import { showMonthSel } from '../src/lib/headerNav.js';

describe('showMonthSel — app-header month stepper visibility', () => {
  it('shows on Dashboard (root and /dashboard)', () => {
    expect(showMonthSel('/')).toBe(true);
    expect(showMonthSel('/dashboard')).toBe(true);
  });

  it('shows on Budget', () => {
    expect(showMonthSel('/budget')).toBe(true);
  });

  it('shows on the month-scoped Reflect tabs', () => {
    expect(showMonthSel('/reflect')).toBe(true);           // Overview
    expect(showMonthSel('/reflect/trends')).toBe(true);
    expect(showMonthSel('/reflect/net-worth')).toBe(true);
    expect(showMonthSel('/reflect/income-expense')).toBe(true);
    expect(showMonthSel('/reflect/age-of-money')).toBe(true);
  });

  it('is HIDDEN on Spending Breakdown, which owns its own range picker', () => {
    expect(showMonthSel('/reflect/spending')).toBe(false);
  });

  it('is hidden on unrelated routes', () => {
    expect(showMonthSel('/transactions')).toBe(false);
    expect(showMonthSel('/accounts')).toBe(false);
    expect(showMonthSel('/settings')).toBe(false);
  });
});
