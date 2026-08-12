// "Left to spend" for the mobile dashboard: money still sitting in envelopes
// this month — the sum of POSITIVE available across expense categories.
// Overspent envelopes are excluded: a negative envelope is money already gone,
// not money that can still be spent. (Deliberately NOT Ready-to-Assign, which
// is a planning number; confirmed in the 2026-08-11 shape brief.)
export function leftToSpend(env) {
  let sum = 0;
  env.rows.forEach(r => { if (r.available > 0) sum += r.available; });
  return sum;
}
