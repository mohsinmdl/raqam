// Pure math + validation for split-expense entry (see
// docs/superpowers/specs/2026-08-11-split-transaction-design.md). A split is
// entered as the TOTAL the user actually paid plus N category lines; lines
// must sum to the total exactly (PKR integers — no rounding tolerance). The
// form stores lines as strings; everything parses through parseAmt so entry
// quirks ("2,500") behave like the main amount field.
import { parseAmt } from './format.js';
import { uid } from './util.js';

export const blankLine = () => ({ id: uid(), category: '', amount: '', newCat: '', newCatGroup: '' });

export function splitRemainder(totalStr, lines) {
  return (parseAmt(totalStr) || 0) - lines.reduce((s, l) => s + (parseAmt(l.amount) || 0), 0);
}

// The remainder chip's target line: the LAST line without a positive amount
// (a fresh '' line, a stray '0', or garbage input) — so a tap always lands on
// a line that still needs the money rather than overwriting one already
// filled in. -1 when every line already carries a positive amount, meaning
// there is nowhere left for the chip to put the remainder.
export function fillRemainderIndex(lines) {
  const amts = lines.map(l => parseAmt(l.amount));
  // "Not filled in" means not a positive amount — a fresh line's amount is
  // '', and parseAmt('') is NaN (not 0), so this can't just lastIndexOf(0).
  for (let i = amts.length - 1; i >= 0; i--) {
    if (!(amts[i] > 0)) return i;
  }
  return -1;
}

// One error string at a time (the form shows a single FieldError under the
// lines), ordered so the user fixes structure before arithmetic.
//
// `store` is optional. Omitted, validateSplit runs the pure structural and
// arithmetic checks only — the shape the original unit tests exercise. Passed
// (TxForm's submit path), it also catches category refs that have gone stale
// since the picker last rendered them (deleted/archived/retyped mid-edit),
// mirroring validate.js's single-path category messages, and rejects __new
// lines that collide with each other or with an existing active category.
//
// `fmt` formats the sum-error amounts. Defaults to a locale-naive 'Rs n' so
// pure callers/tests keep working unchanged; TxForm passes its moneyRaw so
// the message respects the privacy mask like every other amount in the form.

// Category names from the YNAB import often carry a leading emoji (“⚡️ Utilities”);
// compare names with any leading non-letter/digit prefix stripped so “Utilities”
// still collides with “⚡️ Utilities”.
const catName = s => String(s).trim().toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '');

export function validateSplit(totalStr, lines, store, fmt) {
  const money = fmt || (n => 'Rs ' + n.toLocaleString());
  if (lines.length < 2) return 'A split needs at least two lines.';
  if (lines.some(l => !l.category || (l.category === '__new' && !l.newCat)))
    return 'Choose a category for every line.';
  const ids = lines.filter(l => l.category !== '__new').map(l => l.category);
  if (new Set(ids).size !== ids.length) return 'Two lines use the same category — merge them.';
  const newNames = lines.filter(l => l.category === '__new').map(l => catName(l.newCat));
  if (new Set(newNames).size !== newNames.length) return 'Two lines create the same new category — merge them.';
  if (store) {
    for (const n of new Set(newNames)) {
      const collide = store.categories.find(c => c.type === 'expense' && c.status === 'active' && catName(c.name) === n);
      if (collide) return 'Another expense category is already called “' + collide.name + '”.';
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.category === '__new') continue;
      const cat = store.categories.find(c => c.id === l.category);
      const ctx = 'Line ' + (i + 1) + ': ';
      if (!cat) return ctx + 'That category no longer exists.';
      if (cat.type !== 'expense') return ctx + 'That category is an ' + cat.type + ' category — choose one that matches this transaction.';
      if (cat.status !== 'active') return ctx + 'That category is archived — choose an active one.';
    }
  }
  if (lines.some(l => !(parseAmt(l.amount) > 0)))
    return 'Enter an amount greater than zero on every line.';
  const rem = splitRemainder(totalStr, lines);
  if (rem > 0) return money(rem) + ' of the total is not assigned to a line.';
  if (rem < 0) return 'The lines exceed the total by ' + money(Math.abs(rem)) + '.';
  return null;
}
