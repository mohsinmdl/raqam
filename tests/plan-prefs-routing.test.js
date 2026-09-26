// Which preference lives where: device-local (theme, mask…), per-PLAN (saved
// views, the "Whole plan" totals switch) or account-level (everything else).
// showPlanTotals is per plan on purpose — it's on for a one-off project plan
// (a wedding) and must stay off for a normal monthly budget.
import { describe, expect, it } from 'vitest';
import { mergePrefsForWrite, planPrefsFacade, routePrefsPatch } from '../src/lib/prefsStore.js';

describe('routePrefsPatch', () => {
  it('routes device, plan and user keys', () => {
    const r = routePrefsPatch({ theme: 'dark', masked: true, planViews: [{ id: 'v' }], builtinViews: [], showPlanTotals: true, planView: 'progress' });
    expect(r.device).toEqual({ theme: 'dark', masked: true });
    expect(r.plan).toEqual({ customViews: [{ id: 'v' }], builtinViews: [], showPlanTotals: true });
    expect(r.user).toEqual({ planView: 'progress' });
  });
});

describe('showPlanTotals is per plan', () => {
  it('turning it on for one plan leaves another plan (and new plans) off', () => {
    const { user, plan } = routePrefsPatch({ showPlanTotals: true });
    const stored = mergePrefsForWrite({ plans: { monthly: { customViews: [] } } }, user, 'wedding', plan);
    expect(planPrefsFacade(stored, 'wedding').showPlanTotals).toBe(true);
    expect(planPrefsFacade(stored, 'monthly').showPlanTotals).toBeUndefined();
    expect(planPrefsFacade(stored, 'brand-new').showPlanTotals).toBeUndefined();
    expect(stored.showPlanTotals).toBeUndefined(); // never leaks to account level
  });

  it('the facade surfaces the open plan\'s views under their screen names', () => {
    const stored = { plans: { p1: { customViews: [{ id: 'a' }], builtinViews: [{ id: 'b' }], showPlanTotals: false } } };
    expect(planPrefsFacade(stored, 'p1')).toEqual({ planViews: [{ id: 'a' }], builtinViews: [{ id: 'b' }], showPlanTotals: false });
  });
});
