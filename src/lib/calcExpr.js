// Calculator commit for the ASSIGNED editor: a plain number replaces the value;
// a leading operator applies it to the current value ('+500' → current + 500).
// Returns null for anything invalid so the editor can stay open. Pure.
import { parseAmt } from './util.js';

const OPS = { '+': (a, b) => a + b, '-': (a, b) => a - b, '−': (a, b) => a - b, '×': (a, b) => a * b, '*': (a, b) => a * b, '÷': (a, b) => a / b, '/': (a, b) => a / b };

export function applyCalcExpr(current, input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const op = OPS[s[0]];
  const numText = op ? s.slice(1).trim() : s;
  if (!numText || !/^[\d.,\s]+$/.test(numText)) return null;
  // Parse without rounding so we can use the float value in calculations
  const raw = parseFloat(numText.replace(/,/g, '').trim());
  if (!Number.isFinite(raw)) return null;
  if ((s[0] === '÷' || s[0] === '/') && raw === 0) return null;
  // If no operator, return the rounded number; otherwise apply the operator
  if (!op) return Math.round(raw);
  return Math.round(op(current, raw));
}
