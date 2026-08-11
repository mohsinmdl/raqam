// Pure math + validation for split-expense entry (see the 2026-08-11 split
// design doc). A split is entered as the TOTAL the user actually paid plus N
// category lines; lines must sum to the total exactly (PKR integers — no
// rounding tolerance). The form stores lines as strings; everything parses
// through parseAmt so entry quirks ("2,500") behave like the main amount field.
import { parseAmt } from './format.js';

export const blankLine = () => ({ category: '', amount: '', newCat: '', newCatGroup: '' });

export function splitRemainder(totalStr, lines) {
  return (parseAmt(totalStr) || 0) - lines.reduce((s, l) => s + (parseAmt(l.amount) || 0), 0);
}

// One error string at a time (the form shows a single FieldError under the
// lines), ordered so the user fixes structure before arithmetic.
export function validateSplit(totalStr, lines) {
  if (lines.length < 2) return 'A split needs at least two lines.';
  if (lines.some(l => !l.category || (l.category === '__new' && !l.newCat)))
    return 'Choose a category for every line.';
  const ids = lines.filter(l => l.category !== '__new').map(l => l.category);
  if (new Set(ids).size !== ids.length) return 'Two lines use the same category — merge them.';
  if (lines.some(l => !(parseAmt(l.amount) > 0)))
    return 'Enter an amount greater than zero on every line.';
  const rem = splitRemainder(totalStr, lines);
  if (rem > 0) return 'Rs ' + rem.toLocaleString() + ' of the total is not assigned to a line.';
  if (rem < 0) return 'The lines exceed the total by Rs ' + Math.abs(rem).toLocaleString() + '.';
  return null;
}
