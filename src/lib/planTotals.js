// "Whole plan" totals for the Plan sidebar card and the phone Assign sheet: of
// EVERYTHING assigned (every month, future ones included), how much has been
// spent and how much is left — plus the cash actually in the accounts and how
// much of the budget that cash doesn't cover yet. Independent of the month the
// Plan screen is viewing. Pure — no React.
//
// Built on one envelopeFor fold run to the LAST month anything is assigned in
// (or the current month, if later), so its running `toDate` totals cover the
// whole plan and its Ready to Assign reflects future assignments too:
//   budget    = Σ assigned to expense categories, all months
//   spent     = Σ categorized spending to date, net of refunds (pending/future
//               excluded — same rules as the ACTIVITY column; recoverable
//               categories count; uncategorized outflows and transfer fees
//               don't — they come straight off Ready to Assign)
//   remaining = Σ available across expense categories (archived included) at
//               that month = budget − spent + covered
//   covered   = overspending the fold moved off its category and onto Ready to
//               Assign (the month after it happened). The end month's own
//               overspend stays negative in `remaining`; when anything is
//               assigned in a later month, the current month's overspend is
//               "moved" too — YNAB semantics, not only past months'.
//   cash      = today's balance of active accounts (sidebar's account total)
//   toFund    = the Ready to Assign shortfall (−RTA at the end month): assigned
//               money you don't have yet — roughly remaining − cash
//   unassigned= cash not yet given a job (RTA when positive)
import { envelopeFor } from './envelope.js';
import { accountRows } from './sidebarAccounts.js';
import { nowIso } from './dates.js';

const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

export function planTotals(store, now = nowIso()) {
  const cur = String(now).slice(0, 7);
  // Only assignments the fold actually counts (expense categories) may extend
  // it: a row on an income or deleted category would otherwise push `end`
  // past the current month and shift this month's overspend into `covered`.
  const expenseIds = new Set((store.categories || []).filter(c => c.type === 'expense').map(c => c.id));
  let end = cur;
  (store.assignments || []).forEach(a => {
    if (expenseIds.has(a.category) && isMonth(a.month) && a.month > end) end = a.month;
  });

  const env = envelopeFor(store, end, now);
  const { assigned: budget, spent, covered } = env.toDate;
  let remaining = 0;
  env.rows.forEach(r => { remaining += r.available; });
  const cash = accountRows(store, cur, now).total;

  return {
    budget, spent, remaining, covered, cash,
    toFund: Math.max(0, -env.rta),
    unassigned: Math.max(0, env.rta),
    pctSpent: budget > 0 ? spent / budget : 0,
  };
}
