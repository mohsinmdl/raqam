import { describe, it, expect } from 'vitest';
import {
  buildPlanInsert, dateFormatExample, deleteConfirmReady,
  PLAN_NAME_MAX, planNameError, switcherPlans,
} from '../src/ui/plans/planShellLogic.js';
import { resetAll } from '../src/store/actions.js';
import { CATEGORIES, PLAN_DATE_FORMATS, PLAN_DEFAULTS } from '../src/store/seed.js';

// U4 plan-shell pure logic: name validation, the typed-name delete confirm,
// the switcher's list selector, FirstPlanSetup's insert payload, and the
// fresh-id rule on resetAll (U2 handoff).

describe('planNameError', () => {
  it('accepts an ordinary trimmed name', () => {
    expect(planNameError('My Plan')).toBe(null);
    expect(planNameError('  padded  ')).toBe(null); // trims before judging
  });

  it('rejects empty and whitespace-only names (US-4/US-16 inline validation)', () => {
    expect(planNameError('')).toBeTruthy();
    expect(planNameError('   ')).toBeTruthy();
    expect(planNameError(undefined)).toBeTruthy();
  });

  it('caps at exactly 80 characters, matching createPlan', () => {
    expect(planNameError('x'.repeat(PLAN_NAME_MAX))).toBe(null);
    expect(planNameError('x'.repeat(PLAN_NAME_MAX + 1))).toBeTruthy();
    // Trailing whitespace beyond the cap trims away rather than blocking.
    expect(planNameError('x'.repeat(PLAN_NAME_MAX) + ' ')).toBe(null);
  });
});

describe('deleteConfirmReady', () => {
  it('requires the exact plan name', () => {
    expect(deleteConfirmReady('My Plan', 'My Plan')).toBe(true);
    expect(deleteConfirmReady('My Pla', 'My Plan')).toBe(false);
    expect(deleteConfirmReady('', 'My Plan')).toBe(false);
  });

  it('is case-sensitive (BR-U2-9)', () => {
    expect(deleteConfirmReady('my plan', 'My Plan')).toBe(false);
  });

  it("forgives only the input's own leading/trailing whitespace", () => {
    expect(deleteConfirmReady('  My Plan  ', 'My Plan')).toBe(true);
    expect(deleteConfirmReady('My  Plan', 'My Plan')).toBe(false); // interior stays exact
  });
});

describe('switcherPlans', () => {
  const plans = [
    { id: 'p2', name: 'Zebra Fund' },
    { id: 'p1', name: 'Alpha Plan' },
    { id: 'p3', name: 'my plan' },
  ];

  it('orders by name with localeCompare and marks the open plan', () => {
    const list = switcherPlans(plans, 'p2');
    // localeCompare puts lowercase 'my plan' between the capitalized names,
    // where code-point order would banish it past 'Zebra Fund'.
    expect(list.map(p => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(list.map(p => p.open)).toEqual([false, false, true]);
  });

  it('leaves the input list untouched and tolerates empty/missing input', () => {
    const copy = [...plans];
    switcherPlans(plans, 'p1');
    expect(plans).toEqual(copy);
    expect(switcherPlans([], 'p1')).toEqual([]);
    expect(switcherPlans(undefined, 'p1')).toEqual([]);
  });

  it('marks nothing when the open id is absent (first-remaining-by-name callers)', () => {
    expect(switcherPlans(plans, null).every(p => !p.open)).toBe(true);
  });
});

describe('dateFormatExample', () => {
  it('renders the worked example the selects show', () => {
    expect(dateFormatExample('DD/MM/YYYY')).toBe('30/12/2026');
    expect(dateFormatExample('YYYY-MM-DD')).toBe('2026-12-30');
    expect(dateFormatExample('MM/DD/YYYY')).toBe('12/30/2026');
  });

  it('covers every catalogue key with no pattern letters left over', () => {
    for (const key of PLAN_DATE_FORMATS) {
      expect(dateFormatExample(key)).not.toMatch(/[YMD]/);
    }
  });
});

describe('buildPlanInsert (FirstPlanSetup payload)', () => {
  const fields = { id: 'plan-1', name: '  Household  ', currency: 'USD', currencyPlacement: 'before', numberFormat: 'lakh', dateFormat: 'YYYY-MM-DD' };

  it('passes valid fields through with the name trimmed', () => {
    expect(buildPlanInsert(fields)).toEqual({
      id: 'plan-1', name: 'Household', currency: 'USD',
      currencyPlacement: 'before', numberFormat: 'lakh', dateFormat: 'YYYY-MM-DD',
    });
  });

  it('clamps out-of-catalogue settings to PLAN_DEFAULTS, like createPlan', () => {
    const out = buildPlanInsert({ id: 'p', name: 'x', currency: 'usd', currencyPlacement: 'left', numberFormat: 'nope', dateFormat: 'DD MM YYYY' });
    expect(out).toEqual({ id: 'p', name: 'x', ...PLAN_DEFAULTS });
  });

  it('returns null on an invalid name — the backstop behind the form guard', () => {
    expect(buildPlanInsert({ ...fields, name: '  ' })).toBe(null);
    expect(buildPlanInsert({ ...fields, name: 'x'.repeat(PLAN_NAME_MAX + 1) })).toBe(null);
  });
});

describe('resetAll fresh category ids (U2 handoff)', () => {
  it('seeds the full default set with ids disjoint from the fixed catalogue', () => {
    const s = resetAll();
    expect(s.categories).toHaveLength(CATEGORIES.length);
    const catalogueIds = new Set(CATEGORIES.map(c => c.id));
    for (const c of s.categories) expect(catalogueIds.has(c.id)).toBe(false);
    // Everything except the id survives untouched.
    s.categories.forEach((c, i) => {
      const { id: _seedId, ...seedRest } = CATEGORIES[i];
      const { id, ...rest } = c;
      expect(rest).toEqual(seedRest);
      expect(typeof id).toBe('string');
    });
  });

  it('mints unique ids per call — two resets can never collide', () => {
    const a = resetAll().categories.map(c => c.id);
    const b = resetAll().categories.map(c => c.id);
    expect(new Set(a).size).toBe(a.length);
    expect(a.some(id => b.includes(id))).toBe(false);
  });
});
