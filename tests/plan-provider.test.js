import { describe, it, expect } from 'vitest';
import { resolveOpenPlan, bootPlanDecision } from '../src/store/PlanProvider.jsx';

// The pure boot resolution (L2, US-9): persisted id → first-by-name → null.
const plans = [
  { id: 'p2', name: 'Zebra Fund' },
  { id: 'p1', name: 'Alpha Plan' },
  { id: 'p3', name: 'my plan' },
];

describe('resolveOpenPlan', () => {
  it('returns the persisted plan when it still exists', () => {
    expect(resolveOpenPlan(plans, 'p2')).toBe(plans[0]);
  });

  it('falls back to the first plan by name when the persisted id is stale or absent', () => {
    expect(resolveOpenPlan(plans, 'deleted-plan').id).toBe('p1'); // deleted-plan fallback (BR-U2-6)
    expect(resolveOpenPlan(plans, undefined).id).toBe('p1');
  });

  it('sorts with localeCompare, not code points, and leaves the input list untouched', () => {
    // Code-point order would put 'my plan' (lowercase m) after 'Zebra Fund';
    // localeCompare orders names the way the switcher displays them.
    expect(resolveOpenPlan([{ id: 'a', name: 'my plan' }, { id: 'b', name: 'Zebra' }], undefined).id).toBe('a');
    const copy = [...plans];
    resolveOpenPlan(plans, undefined);
    expect(plans).toEqual(copy);
  });

  it('returns null for the zero-plan first-use state', () => {
    expect(resolveOpenPlan([], 'p1')).toBe(null);
    expect(resolveOpenPlan(undefined, undefined)).toBe(null);
  });

  it('prefers the first override that still exists: URL, then tab pin, then persisted', () => {
    expect(resolveOpenPlan(plans, 'p1', ['p3', 'p2']).id).toBe('p3');
    expect(resolveOpenPlan(plans, 'p1', [null, 'p2']).id).toBe('p2');
    expect(resolveOpenPlan(plans, 'p2', [null, null]).id).toBe('p2');
  });

  it('lets a stale override fall through to the next candidate', () => {
    expect(resolveOpenPlan(plans, 'p2', ['deleted-plan', 'p3']).id).toBe('p3');
    expect(resolveOpenPlan(plans, 'p2', ['deleted-plan', 'also-gone']).id).toBe('p2');
    expect(resolveOpenPlan(plans, 'gone', ['deleted-plan']).id).toBe('p1'); // first by name
    expect(resolveOpenPlan([], 'p1', ['p2'])).toBe(null);
  });
});

// Everything boot decides beyond WHICH plan: whether the device-wide id needs
// healing, and whether the user has to be told they did not get what they
// asked for.
describe('bootPlanDecision', () => {
  it('opens the URL plan without touching a valid device-wide id', () => {
    const d = bootPlanDecision({ plans, persistedId: 'p1', urlId: 'p3', tabPin: null });
    expect(d.open.id).toBe('p3');
    expect(d.healOpenPlanId).toBe(null); // a second tab must not change what a fresh launch opens
    expect(d.missed).toBe(null);
  });

  it('heals a stale, deleted or never-set device-wide id to the plan it opened', () => {
    expect(bootPlanDecision({ plans, persistedId: 'deleted-plan', urlId: null, tabPin: null }).healOpenPlanId).toBe('p1');
    expect(bootPlanDecision({ plans, persistedId: undefined, urlId: null, tabPin: null }).healOpenPlanId).toBe('p1');
    expect(bootPlanDecision({ plans, persistedId: 'deleted-plan', urlId: 'p3', tabPin: null }).healOpenPlanId).toBe('p3');
  });

  // The URL id is the user's explicit choice of LEDGER — opening another one
  // without saying so is how entries end up in the wrong plan.
  it('reports a missed URL plan', () => {
    const d = bootPlanDecision({ plans, persistedId: 'p2', urlId: 'deleted-plan', tabPin: null });
    expect(d.open.id).toBe('p2');
    expect(d.missed).toBe('url');
  });

  it('reports a missed tab pin (the plan this tab was on is gone), but only when no URL plan was asked for', () => {
    expect(bootPlanDecision({ plans, persistedId: 'p2', urlId: null, tabPin: 'deleted-plan' }).missed).toBe('pin');
    expect(bootPlanDecision({ plans, persistedId: 'p2', urlId: 'p3', tabPin: 'deleted-plan' }).missed).toBe(null);
    expect(bootPlanDecision({ plans, persistedId: 'p2', urlId: 'gone', tabPin: 'deleted-plan' }).missed).toBe('url');
  });

  it('never reports a stale device-wide id — that one degrades quietly by design', () => {
    expect(bootPlanDecision({ plans, persistedId: 'deleted-plan', urlId: null, tabPin: null }).missed).toBe(null);
  });

  it('decides nothing in the zero-plan first-use state', () => {
    expect(bootPlanDecision({ plans: [], persistedId: 'p1', urlId: 'p2', tabPin: 'p3' }))
      .toEqual({ open: null, healOpenPlanId: null, missed: null });
  });
});
