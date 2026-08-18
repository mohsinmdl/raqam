// Pure derivation of the "Ready to Assign" breakdown rows — shared by the desktop
// RtaBreakdown popover (Plan.jsx) and the phone Assign sheet (AssignSheetBody in
// MoneySheets.jsx), so the two surfaces can never drift apart. It itemizes how
// `rta` was reached: last month's leftover, this month's opening balances, income,
// balance adjustments, assignments, uncategorized spend, and a derived overspending
// line. Zero rows are hidden; callers render the total separately.
//
// Exact by construction: rearranging the fold's own identity
//   rta = prevRta + opening + income + adjustments − assigned − uncategorized − prevOverspend
// (envelope.js) for prevOverspend is what makes the rows sum to `rta`. `overspend`
// is the one term envelope.js doesn't hand back directly; the same identity that
// makes it exact also guarantees it is >= 0 — it only ever subtracts from the total.
import { monthLabel } from './calc.js';

export function rtaBreakdownLines(env, prevRta, month) {
  const monthName = monthLabel(month).split(' ')[0];
  const adj = env.adjustments || 0; // signed: reconciles + account-close zeroing (+found / −lost)
  const overspend = prevRta + env.openingTotal + env.income + adj - env.assignedTotal - env.uncategorized - env.rta;
  return [
    { label: 'Left over from last month', value: prevRta },
    { label: '+ Opening balances', value: env.openingTotal },
    { label: '+ Inflow: income in ' + monthName, value: env.income },
    { label: '± Balance adjustments', value: adj },
    { label: '− Assigned in ' + monthName, value: -env.assignedTotal },
    { label: '− Uncategorized outflows', value: -env.uncategorized },
    { label: '− Last month’s overspending', value: -overspend },
  ].filter(r => r.value !== 0);
}
