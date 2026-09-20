import { describe, it, expect } from 'vitest';
import { resolveOpenPlan } from '../src/store/PlanProvider.jsx';

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

  // A tab owns its plan: the URL's one-shot ?plan= and this tab's session pin
  // outrank the device-wide last-used id, in that order.
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
