import { describe, it, expect } from 'vitest';
import { showMonthSel } from '../src/lib/headerNav.js';

describe('showMonthSel — app-header month stepper visibility', () => {
  // Defensive branch: neither path is a live header route (both redirect into
  // Reflect — Dashboard is now the /reflect "Overview" index tab), but the
  // predicate covers them so the stepper is correct during any transient render.
  it('shows on the root/redirect Dashboard paths (defensive)', () => {
    expect(showMonthSel('/')).toBe(true);
    expect(showMonthSel('/dashboard')).toBe(true);
  });

  it('shows on Budget, but NOT its sub-routes (exact match)', () => {
    expect(showMonthSel('/budget')).toBe(true);
    // /budget/recurring is a real, non-redirecting route (App.jsx). The exact
    // `pathname === '/budget'` check must keep the stepper off it; a refactor
    // to `seg === 'budget'` would silently regress this, so pin it.
    expect(showMonthSel('/budget/recurring')).toBe(false);
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

  // Boundary contract: the exclusion is an exact string compare, so a
  // trailing-slash variant would fall through and re-show the stepper. This is
  // documented, not a supported input — React Router's useLocation().pathname
  // strips trailing slashes (and excludes query/hash), so the live app only
  // ever passes the canonical '/reflect/spending'. Pin the assumption so a
  // future normalization change surfaces here.
  it('matches the canonical pathname exactly (trailing slash is not normalized)', () => {
    expect(showMonthSel('/reflect/spending/')).toBe(true);
  });

  it('is hidden on unrelated routes', () => {
    expect(showMonthSel('/transactions')).toBe(false);
    expect(showMonthSel('/accounts')).toBe(false);
    expect(showMonthSel('/settings')).toBe(false);
  });
});
