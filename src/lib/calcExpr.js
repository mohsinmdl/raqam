// Calculator commit for the ASSIGNED editor: evaluates a left-to-right infix
// chain of `number (op number)*` — pocket-calculator order, NO operator
// precedence (`20+40×2` folds as (20+40)×2 = 120, not 100). A plain number
// replaces the value outright. An expression that STARTS with an operator
// seeds the accumulator with the current cell value instead of the first
// number ('+500' → current + 500, '+20+40' → current + 60), preserving the
// old prefix shorthand while extending it to full chains.
// Returns null for anything invalid — empty input, a non-numeric token, a
// trailing/lone/doubled operator, or division by zero at any step in the
// chain — so the editor can stay open. Rounds only the final result; every
// intermediate fold uses the raw float. Pure.

import { activeFormat } from './planFormat.js';

const OPS = { '+': (a, b) => a + b, '-': (a, b) => a - b, '−': (a, b) => a - b, '×': (a, b) => a * b, '*': (a, b) => a * b, '÷': (a, b) => a / b, '/': (a, b) => a / b };

// Tokenizer: alternates single-char operators with runs of digits/separator
// chars (operands are never signed — a '-' is always an operator token, not
// part of a number). The operand class carries every group/decimal char any
// plan format uses that isn't an operator; whether a given char is legal for
// the ACTIVE plan is parseAmount's call at the boundary below. Operator
// chars keep their arithmetic meaning in every plan — under comma-slash or
// space-dash the '/' and '-' marks still divide and subtract here, and a
// fraction is typed with '.' (parseAmount accepts it universally). If any
// character in the trimmed input matches neither alternative (e.g. a letter),
// the joined tokens won't reconstruct the original string and the whole
// expression is rejected below.
const TOKEN_RE = /[+\-−×*÷/]|[\d.,'\s]+/g; // \s covers the NBSP the space formats render

export function applyCalcExpr(current, input) {
  const s = String(input || '').trim();
  if (!s) return null;

  const tokens = s.match(TOKEN_RE);
  if (!tokens || tokens.join('') !== s) return null;

  let leading = null;
  let i = 0;
  if (OPS[tokens[0]]) { leading = tokens[0]; i = 1; }

  const nums = [];
  const ops = [];
  let expectNumber = true;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (expectNumber) {
      if (OPS[t]) return null; // two consecutive operators
      // Plan separators are normalized HERE, at the tokenizer boundary, and
      // nowhere else (BR-U3-6): parseAmount strips the active plan's group
      // chars and reads its decimal (or '.'); the arithmetic below never sees
      // a separator. A char the active plan doesn't use rejects the operand,
      // and with it the whole expression — same null the old join-check gave.
      const raw = activeFormat().parseAmount(t.trim());
      if (raw == null) return null;
      nums.push(raw);
      expectNumber = false;
    } else {
      // Tokens alternate by construction (operand chars and operator chars
      // are disjoint), so t is necessarily an operator here.
      ops.push(t);
      expectNumber = true;
    }
  }
  if (expectNumber || nums.length === 0) return null; // trailing operator, or a lone/leading-only operator

  let acc;
  if (leading) {
    if ((leading === '÷' || leading === '/') && nums[0] === 0) return null;
    acc = OPS[leading](current, nums[0]);
  } else {
    acc = nums[0];
  }
  for (let k = 0; k < ops.length; k++) {
    const b = nums[k + 1];
    if ((ops[k] === '÷' || ops[k] === '/') && b === 0) return null;
    acc = OPS[ops[k]](acc, b);
  }
  return Math.round(acc);
}
