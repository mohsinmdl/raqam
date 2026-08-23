// Live thousands separators for amount entry.
//
// Grouping the digits is the easy half. The caret is the hard half: a controlled
// input that reformats on every keystroke sends the caret to the end, so
// correcting a digit in the middle of a number becomes impossible — you type
// one character and your cursor jumps away.
//
// The fix is to measure the caret in DIGITS rather than characters. Separators
// appear and disappear as the number grows; digits do not. So we record how many
// value characters sat before the caret, reformat, then put the caret back after
// that same count.
//
// Which characters are separators and which mark the decimal comes from the
// open plan's format (planFormat singleton); the caret logic itself is
// separator-agnostic — it only needs a consistent answer to "is this a value
// character", and a typed '.' and the plan decimal it normalizes into count
// the same on both sides of a reformat.
//
// Storing the grouped text in form state is safe because every consumer reads it
// through parseAmt (src/lib/util.js), which strips the plan's separators
// before parsing.
import { activeFormat } from './planFormat.js';

// A value char is a digit or a decimal mark: the plan's own decimal, plus '.'
// wherever '.' is not this plan's GROUP char (people type '.' for a fraction
// regardless of plan — but under dot-comma a '.' IS grouping and must not
// read as a decimal, or reformatting the field's own output would corrupt it).
const isValueChar = (ch, f) =>
  (ch >= '0' && ch <= '9') || ch === f.decimal || (ch === '.' && f.group !== '.');

export function formatAmountInput(raw) {
  const f = activeFormat();
  // Normalize every decimal mark to the plan's own char, keep digits, drop
  // everything else (group chars re-insert below; letters/symbols vanish).
  // A leading '-' never survives: these amount fields are unsigned, and under
  // space-dash the '-' decimal mark is only a decimal AFTER some digits.
  let cleaned = '';
  for (const ch of String(raw ?? '')) {
    if (ch >= '0' && ch <= '9') cleaned += ch;
    else if (isValueChar(ch, f) && !(ch === f.decimal && f.decimal === '-' && cleaned === '')) cleaned += f.decimal;
  }
  const dot = cleaned.indexOf(f.decimal);
  if (dot < 0) return f.groupDigits(cleaned);
  // Keep the first decimal mark and drop any later ones, so a stray second one
  // cannot silently change the number. A trailing mark survives: it is a normal
  // moment mid-typing, and removing it would fight the person entering it.
  const frac = cleaned.slice(dot + 1).split(f.decimal).join('');
  return f.groupDigits(cleaned.slice(0, dot)) + f.decimal + frac;
}

// How many value characters precede the caret. Separators are skipped, so this
// survives regrouping.
export function digitsBefore(text, caret) {
  const f = activeFormat();
  let n = 0;
  const upto = String(text ?? '').slice(0, caret ?? 0);
  for (const ch of upto) if (isValueChar(ch, f)) n++;
  return n;
}

// The character offset just after the nth value character — where the caret
// belongs once the text has been regrouped.
export function caretAfterDigits(text, n) {
  if (n <= 0) return 0;
  const f = activeFormat();
  let seen = 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    if (isValueChar(s[i], f) && ++seen === n) return i + 1;
  }
  return s.length;
}
