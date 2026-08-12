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

const OPS = { '+': (a, b) => a + b, '-': (a, b) => a - b, '−': (a, b) => a - b, '×': (a, b) => a * b, '*': (a, b) => a * b, '÷': (a, b) => a / b, '/': (a, b) => a / b };

// Tokenizer: alternates single-char operators with runs of digits/dot/comma/
// space (operands are never signed — a '-' is always an operator token, not
// part of a number). If any character in the trimmed input matches neither
// alternative (e.g. a letter), the joined tokens won't reconstruct the
// original string and the whole expression is rejected below.
const TOKEN_RE = /[+\-−×*÷/]|[\d.,\s]+/g;

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
      const numText = t.replace(/,/g, '').trim();
      if (!numText) return null;
      const raw = parseFloat(numText);
      if (!Number.isFinite(raw)) return null;
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
