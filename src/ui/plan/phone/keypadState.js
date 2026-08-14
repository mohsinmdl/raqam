// src/ui/plan/phone/keypadState.js
// Pure draft-string editing for the phone keypad sheet. The draft is a raw
// calculator expression ('1500+40'); rendering/grouping is displayOf's job and
// evaluation is applyCalcExpr's (same left-to-right semantics as the desktop
// ASSIGNED cell).
import { applyCalcExpr } from '../../../lib/calcExpr.js';

const OPS = ['−', '+', '×', '÷'];
const lastSegment = draft => draft.split(/[−+×÷]/).pop();

export function pressDigit(draft, d) {
  const seg = lastSegment(draft);
  if (d === '0' && seg === '0') return draft;            // no 00
  if (seg === '0') return draft.slice(0, -1) + d;        // 0 then 5 → 5
  return draft + d;
}
export function pressOp(draft, op) {
  if (OPS.includes(draft.slice(-1))) return draft.slice(0, -1) + op;
  return draft + op;
}
export function pressBackspace(draft) { return draft.slice(0, -1); }
export function pressClear() { return ''; }
export function evaluate(current, draft) {
  if (!draft) return null;
  return applyCalcExpr(current, draft);
}
export function displayOf(draft) {
  return draft.replace(/\d+/g, run => run.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}
