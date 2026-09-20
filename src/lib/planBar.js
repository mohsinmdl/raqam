// Plan category-row progress bar descriptor (pure). Turns an envelope fold row
// { assigned, activity, available, carryIn } plus its category into what the
// desktop CategoryRow renders in "progress" view: a YNAB-style label + a
// two-segment bar (green striped fill, then a dark-red overage segment).
//
// Two shapes, mirroring the existing branch in Plan.jsx:
//  - Target categories (hasTarget): funding progress toward the target. Green
//    fills to the funded fraction; label is "<need> more needed" / "Funded".
//  - Spending categories: spend against the month's budget (carryIn + assigned).
//    Green fills to spend/budget; if overspent, green fills the budgeted share
//    and a dark-red segment shows the overage. Label is
//    "Spent <spend> of <budget>" / "Fully Spent" / "Overspent. <spend> of <budget>".
//
// `money` is injected so this stays pure and framework-free (same convention as
// targetSummary in targets.js). Returns { show, label, greenPct, redPct, state }
// where greenPct + redPct are 0..1 fractions of the full bar width and state is
// one of 'funding' | 'full' | 'partial' | 'over' | 'empty'.
import { hasTarget, targetNeeded } from './targets.js';

const clamp01 = n => Math.min(1, Math.max(0, n));

export function planBar(row, cat, money) {
  const r = row || { assigned: 0, activity: 0, available: 0, carryIn: 0 };

  if (hasTarget(cat)) {
    const target = cat.targetAmount;
    const funded = cat.targetMode === 'setaside' ? (r.assigned || 0) : (r.available || 0);
    const pct = target > 0 ? clamp01(funded / target) : 0;
    const need = targetNeeded(r, cat);
    return {
      show: true,
      label: need > 0 ? money(need) + ' more needed' : 'Funded',
      greenPct: pct,
      redPct: 0,
      state: need > 0 ? 'funding' : 'full',
    };
  }

  const budget = Math.max(0, (r.carryIn || 0) + (r.assigned || 0));
  const spend = Math.max(0, -(r.activity || 0));

  // Nothing budgeted and nothing spent: a clean, empty row (no bar, no label).
  if (budget === 0 && spend === 0) {
    return { show: false, label: '', greenPct: 0, redPct: 0, state: 'empty' };
  }

  // Overspent: the bar's full width represents total spend; green covers the
  // budgeted share, dark red the overage beyond it.
  if (spend > budget) {
    const greenPct = spend > 0 ? clamp01(budget / spend) : 0;
    return {
      show: true,
      label: 'Overspent. ' + money(spend) + ' of ' + money(budget),
      greenPct,
      redPct: 1 - greenPct,
      state: 'over',
    };
  }

  // Fully spent: spent exactly the budget.
  if (spend === budget) {
    return { show: true, label: 'Fully Spent', greenPct: 1, redPct: 0, state: 'full' };
  }

  // Partially spent.
  return {
    show: true,
    label: 'Spent ' + money(spend) + ' of ' + money(budget),
    greenPct: clamp01(spend / budget),
    redPct: 0,
    state: 'partial',
  };
}
