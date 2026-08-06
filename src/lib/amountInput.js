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
// Storing the grouped text in form state is safe because every consumer reads it
// through parseAmt (src/lib/util.js), which strips commas before parsing.

const VALUE_CHAR = /[\d.]/;

// 1000000 -> 1,000,000. Applied to the integer part only; a fractional part
// never takes separators.
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatAmountInput(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot < 0) return group(cleaned);
  // Keep the first decimal point and drop any later ones, so a stray second dot
  // cannot silently change the number. A trailing dot survives: it is a normal
  // moment mid-typing, and removing it would fight the person entering it.
  return group(cleaned.slice(0, dot)) + '.' + cleaned.slice(dot + 1).replace(/\./g, '');
}

// How many value characters precede the caret. Separators are skipped, so this
// survives regrouping.
export function digitsBefore(text, caret) {
  let n = 0;
  const upto = String(text ?? '').slice(0, caret ?? 0);
  for (const ch of upto) if (VALUE_CHAR.test(ch)) n++;
  return n;
}

// The character offset just after the nth value character — where the caret
// belongs once the text has been regrouped.
export function caretAfterDigits(text, n) {
  if (n <= 0) return 0;
  let seen = 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    if (VALUE_CHAR.test(s[i]) && ++seen === n) return i + 1;
  }
  return s.length;
}
