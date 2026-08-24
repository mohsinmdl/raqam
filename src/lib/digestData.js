// U4 insights-digest — the client's aggregate assembler. Pure: (S, month) =>
// the DigestRequest wire shape (modal/schemas.py / fixtures/digest.request.json).
// The CLIENT computes every figure from the SAME report selectors the Reflect
// Overview tab already uses; only aggregates cross the wire — never the raw
// transaction array (privacy + FR-4.3: the app's numbers are authoritative, the
// LLM only narrates them). Integer PKR throughout. Imports selectors + dates
// only; no React, no test/fixture code — so it stays unit-testable in node env.
import { incomeExpenseSeries, spendingByCategory, spendingStats } from './reports.js';
import { addMonths } from './dates.js';

// How many category rows the narrative gets. The prompt only needs the leaders;
// a long tail adds tokens without changing the story.
const TOP_CATEGORIES = 5;

// Share-of-spend as an integer percent (the fixture carries `pct: 36`, not the
// selector's 0..1 fraction). Rounded the same way the Spending Breakdown labels.
const asPct = fraction => Math.round((fraction || 0) * 100);

// buildDigestPayload(S, month) -> DigestRequest. Assembled ENTIRELY from the
// existing selectors: spendingStats (totals + leaders), spendingByCategory
// (top-N with a previous-month delta), incomeExpenseSeries (the income/expense
// trend). No raw transactions — merchant text appears only where the selectors
// already expose it (largestOutflow.merchant), never as a transaction list.
export function buildDigestPayload(S, month) {
  const st = spendingStats(S, month);

  // Previous month's per-category spend, keyed by id, for the prevAmt delta the
  // narrative uses to say "up/down vs last month" (fixture: byCategory[].prevAmt).
  const prevMonth = addMonths(month, -1);
  const prevById = {};
  spendingByCategory(S, prevMonth).forEach(r => { prevById[r.id] = r.amt; });

  const byCategory = spendingByCategory(S, month)
    // Drop the synthetic Uncategorized bucket and any zero rows — the narrative
    // is about named spending leaders, not an "uncategorized" placeholder.
    .filter(r => r.id !== 'uncategorized' && r.amt > 0)
    .slice(0, TOP_CATEGORIES)
    .map(r => ({
      name: r.name,
      amt: r.amt,
      pct: asPct(r.pct),
      prevAmt: prevById[r.id] || 0,
    }));

  const incomeExpense = incomeExpenseSeries(S)
    .map(m => ({ month: m.month, income: m.income, expense: m.expense }));

  return {
    month,
    stats: {
      total: st.total,
      avgDaily: st.avgDaily,
      // mostFrequent/largestOutflow are null when the month has no qualifying
      // spend; the LLM prompt tolerates nulls (and simply won't reference them).
      mostFrequent: st.mostFrequent ? { name: st.mostFrequent.cat.name, count: st.mostFrequent.count } : null,
      largestOutflow: st.largestOutflow ? { merchant: st.largestOutflow.merchant, amt: st.largestOutflow.amt } : null,
    },
    byCategory,
    incomeExpense,
  };
}

// Gate for the card: a month with no spending has nothing to narrate, so the
// card shows a quiet "not enough data yet" state instead of a Generate button.
// Derived from the selector total (0 for an empty month) — no transaction peek.
export function hasEnoughData(S, month) {
  return spendingStats(S, month).total > 0;
}
