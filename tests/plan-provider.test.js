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
});
