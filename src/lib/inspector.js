// Pure math for the Plan inspector (Phase 3). Every Auto-Assign action is
// expressed as a list of moveAssigned args ("the plan") so the screen can
// chain them in ONE applyData call — one undo step, audit rows for free.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase3-inspector-design.md
import { prevMonth } from './calc.js';
import { hasTarget, targetNeeded } from './targets.js';

export function trailingMonths(month, n) {
  const out = [];
  let m = month;
  for (let i = 0; i < n; i++) { m = prevMonth(m); out.push(m); }
  return out;
}

export function assignedIn(S, catId, month) {
  const row = (S.assignments || []).find(a => a.category === catId && a.month === month);
  return row ? Math.round(row.amount) || 0 : 0;
}

const rowOf = (env, id) => env.rows.get(id) || { assigned: 0, activity: 0, available: 0, carryIn: 0 };

export function selectionSummary(env, catIds) {
  return catIds.reduce((acc, id) => {
    const r = rowOf(env, id);
    acc.carryIn += r.carryIn; acc.assigned += r.assigned;
    acc.activity += r.activity; acc.available += r.available;
    return acc;
  }, { carryIn: 0, assigned: 0, activity: 0, available: 0 });
}

// Amount needed to fund each category up to its target (targeted cats) or to
// cover overspending (untargeted cats), summed. Excluded cats contribute 0.
export function underfundedFor(env, catIds, S) {
  const catById = new Map((S?.categories || []).map(c => [c.id, c]));
  return catIds.reduce((n, id) => {
    const r = env.rows.get(id) || { available: 0 };
    const cat = catById.get(id);
    if (cat && cat.excludeFromBudget) return n; // excluded: contributes 0
    if (cat && hasTarget(cat)) return n + targetNeeded(r, cat);
    return n + Math.max(0, -r.available); // untargeted: cover overspending
  }, 0);
}

// Spent = outflow, so a month's "spent" figure is max(0, −activity).
const spentIn = (envAt, catId, month) => Math.max(0, -rowOf(envAt(month), catId).activity);
const AVG_N = 3; // previous 3 calendar months; empty months count as 0 (spec assumption)
const mean3 = vals => Math.round(vals.reduce((a, b) => a + b, 0) / AVG_N);

// The complete set of Auto-Assign kinds — the UI's SIX_KINDS/KIND_LABELS
// (src/ui/plan/Inspector.jsx) derive from this so the list can't drift.
export const AUTO_ASSIGN_KINDS = Object.freeze([
  'underfunded', 'assignedLastMonth', 'spentLastMonth',
  'avgAssigned', 'avgSpent', 'resetAvailable', 'resetAssigned',
]);

// Both public functions below take the same ctx shape; validate it once here
// rather than let a caller who omits e.g. envAt only find out when a user
// happens to click a kind that needs it.
function assertCtx(ctx) {
  if (!ctx || !ctx.S || !ctx.month || !ctx.env || typeof ctx.envAt !== 'function') {
    throw new Error('inspector: ctx must be { S, month, env, envAt }');
  }
}

// The figure each button SHOWS (the target/total, YNAB-style — not the delta).
export function autoAssignAmount(kind, catIds, ctx) {
  if (!AUTO_ASSIGN_KINDS.includes(kind)) throw new Error('unknown auto-assign kind: ' + kind);
  assertCtx(ctx);
  const { S, month, env, envAt } = ctx;
  const per = catId => {
    if (kind === 'assignedLastMonth') return assignedIn(S, catId, prevMonth(month));
    if (kind === 'spentLastMonth') return spentIn(envAt, catId, prevMonth(month));
    if (kind === 'avgAssigned') return mean3(trailingMonths(month, AVG_N).map(m => assignedIn(S, catId, m)));
    if (kind === 'avgSpent') return mean3(trailingMonths(month, AVG_N).map(m => spentIn(envAt, catId, m)));
    if (kind === 'resetAvailable') return rowOf(env, catId).available;
    return rowOf(env, catId).assigned; // resetAssigned — the only kind left, guarded above
  };
  if (kind === 'underfunded') return underfundedFor(env, catIds, ctx.S);
  return catIds.reduce((n, id) => n + per(id), 0);
}

// The moves that get the categories TO the shown figure: 'underfunded' covers
// each overspent category from rta; target kinds emit the signed delta vs the
// current assigned; reset kinds emit the zeroing move.
export function autoAssignPlan(kind, catIds, ctx) {
  if (!AUTO_ASSIGN_KINDS.includes(kind)) throw new Error('unknown auto-assign kind: ' + kind);
  assertCtx(ctx);
  const { month, env } = ctx;
  const moves = [];
  // Rounded so a plan can never carry a fractional amount — every input is
  // integral today only because it's rounded upstream, and moveAssigned's
  // `amt <= 0` guard would otherwise silently drop a fractional leg mid-reduce.
  const push = (catId, delta) => {
    const amt = Math.round(delta);
    if (amt > 0) moves.push({ from: 'rta', to: catId, month, amount: amt });
    else if (amt < 0) moves.push({ from: catId, to: 'rta', month, amount: -amt });
  };
  for (const catId of catIds) {
    const r = rowOf(env, catId);
    if (kind === 'underfunded') {
      const cat = (ctx.S?.categories || []).find(c => c.id === catId);
      const need = cat && cat.excludeFromBudget ? 0
        : cat && hasTarget(cat) ? targetNeeded(r, cat) : Math.max(0, -r.available);
      if (need > 0) push(catId, need); // push(catId, delta): from RTA into the category
      continue;
    }
    if (kind === 'resetAvailable') { push(catId, -r.available); continue; }
    if (kind === 'resetAssigned') { push(catId, -r.assigned); continue; }
    push(catId, autoAssignAmount(kind, [catId], ctx) - r.assigned);
  }
  return moves;
}
