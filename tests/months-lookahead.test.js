// monthsFor lookahead — pure lib capability, no behavior change to the
// existing default call. Mirrors tests/reports.test.js: months are anchored
// to the REAL currentMonth() via addMonths rather than hardcoded literals,
// since monthsFor walks back from the real clock.
import { describe, it, expect } from 'vitest';
import { monthsFor, addMonths, currentMonth, monthsBetween } from '../src/lib/dates.js';

const CUR = currentMonth();

function makeStore(transactions, overrides) {
  return {
    transactions: transactions || [],
    snapshots: [],
    ...(overrides || {}),
  };
}
const tx = (date) => ({ date });

describe('monthsFor lookahead', () => {
  it('default call: last element is exactly currentMonth() — nothing future', () => {
    const S = makeStore([tx(CUR + '-10T12:00')]);
    const months = monthsFor(S);
    expect(months[months.length - 1]).toBe(CUR);
  });

  it('lookahead: 3 appends [cur+1, cur+2, cur+3] in order, after the default list', () => {
    const S = makeStore([tx(CUR + '-10T12:00')]);
    const withoutLookahead = monthsFor(S);
    const withLookahead = monthsFor(S, { lookahead: 3 });
    expect(withLookahead.slice(0, withoutLookahead.length)).toEqual(withoutLookahead);
    expect(withLookahead.slice(withoutLookahead.length)).toEqual([
      addMonths(CUR, 1), addMonths(CUR, 2), addMonths(CUR, 3),
    ]);
  });

  it('empty/absent store with lookahead 3: [cur, cur+1, cur+2, cur+3]', () => {
    expect(monthsFor(undefined, { lookahead: 3 })).toEqual([
      CUR, addMonths(CUR, 1), addMonths(CUR, 2), addMonths(CUR, 3),
    ]);
    expect(monthsFor(makeStore([]), { lookahead: 3 })).toEqual([
      CUR, addMonths(CUR, 1), addMonths(CUR, 2), addMonths(CUR, 3),
    ]);
  });

  it('past-span cap: a transaction >24 months back still yields 24 past+current months; lookahead is additive on top', () => {
    const farBack = addMonths(CUR, -30);
    const S = makeStore([tx(farBack + '-10T12:00')]);

    const months = monthsFor(S);
    expect(months).toHaveLength(24);
    expect(months[months.length - 1]).toBe(CUR);
    expect(monthsBetween(months[0], CUR)).toBe(23); // 24 contiguous months, capped

    const withLookahead = monthsFor(S, { lookahead: 3 });
    expect(withLookahead).toHaveLength(24 + 3);
    expect(withLookahead.slice(0, 24)).toEqual(months);
    expect(withLookahead.slice(24)).toEqual([addMonths(CUR, 1), addMonths(CUR, 2), addMonths(CUR, 3)]);
  });

  it('lookahead: 0 explicitly === default result', () => {
    const S = makeStore([tx(CUR + '-10T12:00')]);
    expect(monthsFor(S, { lookahead: 0 })).toEqual(monthsFor(S));
  });
});
