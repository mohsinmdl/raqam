import { describe, expect, it } from 'vitest';
import { rtaBreakdownLines } from './rtaBreakdown.js';

// rtaBreakdownLines derives the prior-month overspend so the rows sum to `rta`
// exactly. These tests exercise the load-bearing invariant with every term
// non-zero — the case the envelope tests can't reach — and pin the new
// adjustments row + its presence in the overspend derivation.
const sum = rows => rows.reduce((s, r) => s + r.value, 0);
const row = (rows, needle) => rows.find(r => r.label.includes(needle));

describe('rtaBreakdownLines', () => {
  it('rows sum to rta exactly with every term non-zero, and recover the true overspend', () => {
    const prevRta = 100, trueOverspend = 25;
    const env = {
      openingTotal: 1000, income: 300, adjustments: 40,
      assignedTotal: 500, uncategorized: 60,
      // rta as the fold would produce it, given a known prior-month overspend
      rta: prevRta + 1000 + 300 + 40 - 500 - 60 - trueOverspend, // 855
    };
    const rows = rtaBreakdownLines(env, prevRta, '2026-08');
    expect(sum(rows)).toBe(env.rta);
    // Recovering trueOverspend proves `adjustments` is in the overspend formula,
    // not only in its own row — drop it from the formula and this value is off by 40.
    expect(row(rows, 'overspending').value).toBe(-trueOverspend);
  });

  it('surfaces the signed balance-adjustments row (negative = lost/closed money)', () => {
    const env = { openingTotal: 0, income: 0, adjustments: -700, assignedTotal: 0, uncategorized: 0, rta: -700 };
    const rows = rtaBreakdownLines(env, 0, '2026-08');
    expect(row(rows, 'Balance adjustments').value).toBe(-700);
    expect(sum(rows)).toBe(-700);
  });

  it('hides the balance-adjustments row when it is zero', () => {
    const env = { openingTotal: 1000, income: 0, adjustments: 0, assignedTotal: 0, uncategorized: 0, rta: 1000 };
    expect(row(rtaBreakdownLines(env, 0, '2026-08'), 'Balance adjustments')).toBeUndefined();
  });
});
