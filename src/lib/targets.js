// Monthly category-target math (v1). Pure. Reads the envelope fold row shape
// { assigned, activity, available, carryIn } from src/lib/envelope.js.
// Spec: docs/superpowers/specs/2026-08-09-category-targets-design.md
//
// Two modes: 'refill' (spend-envelope — need enough to bring AVAILABLE up to the
// amount; leftover reduces it) and 'setaside' (savings — need another amount
// ASSIGNED each month; carry-in is ignored).

export function hasTarget(cat) {
  return !!cat && !cat.excludeFromBudget && typeof cat.targetAmount === 'number' && cat.targetAmount > 0;
}

export function targetNeeded(row, cat) {
  if (!hasTarget(cat)) return 0;
  const have = cat.targetMode === 'setaside' ? (row.assigned || 0) : (row.available || 0);
  return Math.max(0, Math.round(cat.targetAmount - have));
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
