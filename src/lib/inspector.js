// Pure math for the Plan inspector (Phase 3). Every Auto-Assign action is
// expressed as a list of moveAssigned args ("the plan") so the screen can
// chain them in ONE applyData call — one undo step, audit rows for free.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase3-inspector-design.md
import { prevMonth } from './calc.js';

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

export function underfundedFor(env, catIds) {
  return catIds.reduce((n, id) => n + Math.max(0, -rowOf(env, id).available), 0);
}

// Spent = outflow, so a month's "spent" figure is max(0, −activity).
const spentIn = (envAt, catId, month) => Math.max(0, -rowOf(envAt(month), catId).activity);
const AVG_N = 3; // previous 3 calendar months; empty months count as 0 (spec assumption)
const mean3 = vals => Math.round(vals.reduce((a, b) => a + b, 0) / AVG_N);

// The figure each button SHOWS (the target/total, YNAB-style — not the delta).
export function autoAssignAmount(kind, catIds, ctx) {
  const { S, month, env, envAt } = ctx;
  const per = catId => {
    if (kind === 'assignedLastMonth') return assignedIn(S, catId, prevMonth(month));
    if (kind === 'spentLastMonth') return spentIn(envAt, catId, prevMonth(month));
    if (kind === 'avgAssigned') return mean3(trailingMonths(month, AVG_N).map(m => assignedIn(S, catId, m)));
    if (kind === 'avgSpent') return mean3(trailingMonths(month, AVG_N).map(m => spentIn(envAt, catId, m)));
    if (kind === 'resetAvailable') return rowOf(env, catId).available;
    if (kind === 'resetAssigned') return rowOf(env, catId).assigned;
    throw new Error('unknown auto-assign kind: ' + kind);
  };
  if (kind === 'underfunded') return underfundedFor(env, catIds);
  return catIds.reduce((n, id) => n + per(id), 0);
}

// The moves that get the categories TO the shown figure. Target kinds emit the
// signed delta vs the current assigned; reset kinds emit the zeroing move.
export function autoAssignPlan(kind, catIds, ctx) {
  const { month, env } = ctx;
  const moves = [];
  const push = (catId, delta) => {
    if (delta > 0) moves.push({ from: 'rta', to: catId, month, amount: delta });
    else if (delta < 0) moves.push({ from: catId, to: 'rta', month, amount: -delta });
  };
  for (const catId of catIds) {
    const r = rowOf(env, catId);
    if (kind === 'underfunded') { if (r.available < 0) push(catId, -r.available); continue; }
    if (kind === 'resetAvailable') { push(catId, -r.available); continue; }
    if (kind === 'resetAssigned') { push(catId, -r.assigned); continue; }
    push(catId, autoAssignAmount(kind, [catId], ctx) - r.assigned);
  }
  return moves;
}
