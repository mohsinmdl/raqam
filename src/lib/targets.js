// Monthly category-target math (v1). Pure. Reads the envelope fold row shape
// { assigned, activity, available, carryIn } from src/lib/envelope.js.
// Spec: docs/superpowers/specs/2026-08-09-category-targets-design.md
//
// Two modes: 'refill' (spend-envelope — need enough to bring AVAILABLE up to the
// amount; leftover reduces it) and 'setaside' (savings — need another amount
// ASSIGNED each month; carry-in is ignored — it's a recurring monthly-flow goal,
// not a stock target, so pre-existing available shouldn't count toward the base
// shortfall; overspend is covered separately, as its own term, below).

// The only valid target modes. Mirrors AUTO_ASSIGN_KINDS (src/lib/inspector.js):
// one frozen list so a caller can validate against it instead of drifting.
export const TARGET_MODES = Object.freeze(['setaside', 'refill']);

export function hasTarget(cat) {
  return !!cat && !cat.excludeFromBudget && typeof cat.targetAmount === 'number' && cat.targetAmount > 0 && TARGET_MODES.includes(cat.targetMode);
}

export function targetNeeded(row, cat) {
  if (!hasTarget(cat)) return 0;
  if (cat.targetMode === 'setaside') {
    // Cover the monthly set-aside shortfall AND any overspend (negative available).
    return Math.max(0, Math.round(cat.targetAmount - (row.assigned || 0)), Math.round(-(row.available || 0)));
  }
  // refill: bring AVAILABLE up to the amount — already covers overspend.
  return Math.max(0, Math.round(cat.targetAmount - (row.available || 0)));
}

export function isOverTarget(row, cat) {
  if (!hasTarget(cat)) return false;
  const have = cat.targetMode === 'setaside' ? (row.assigned || 0) : (row.available || 0);
  return have > cat.targetAmount;
}

export function costToBeMe(cats) {
  return (cats || []).reduce((n, c) => n + (hasTarget(c) ? Math.round(c.targetAmount) : 0), 0);
}

export function targetSummary(cat, money) {
  if (!hasTarget(cat)) return '';
  const verb = cat.targetMode === 'setaside' ? 'Set aside' : 'Refill up to';
  return verb + ' ' + money(Math.round(cat.targetAmount)) + ' monthly';
}

// The amount a category needs THIS MONTH to be whole: its target shortfall
// (targetNeeded, which now covers overspend for both modes) if it has a target,
// else cover overspending. Excluded categories need nothing. This single figure
// drives the Underfunded pill, the Auto-Assign "Underfunded" action, and their
// agreement — the pill matches iff this is > 0; the action funds exactly this.
export function underfundedNeed(row, cat) {
  if (!cat || cat.excludeFromBudget) return 0;
  if (hasTarget(cat)) return targetNeeded(row, cat);
  return Math.max(0, -(row.available || 0));
}
