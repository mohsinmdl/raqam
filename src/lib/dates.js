// Real-date layer — replaces the prototype's frozen DEMO_NOW / TODAY / MONTHS.
// All strings are local-time: 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD', 'YYYY-MM'.
import { daysInMonth } from './calc.js';
import { activeFormat } from './planFormat.js';

const p2 = n => String(n).padStart(2, '0');

export function nowIso() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
// Seconds-precision sibling of nowIso(), used only on the transaction
// create/reorder path (0019 relaxes the DB CHECK to allow the optional :SS).
// nowIso() stays minute-precision because schedule math, due_date comparisons
// and stampFor all expect exactly 'YYYY-MM-DDTHH:mm'.
export function nowIsoSec() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
export function todayStr() { return nowIso().slice(0, 10); }

// Local-time ISO ('YYYY-MM-DD', '...THH:mm', '...THH:mm:ss') to epoch ms via a
// local Date, so a value written by nowIso/nowIsoSec round-trips to the same
// wall clock. A missing time reads as local midnight; missing seconds as :00.
export function toEpochMs(iso) {
  const s = String(iso || '');
  const [datePart, timePart = ''] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss).getTime();
}
// Epoch ms back to a seconds-precision local ISO string — the write format for
// every reordered/interpolated timestamp.
export function fmtIsoSec(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
// The moment exactly between two timestamps, floored to the whole second (the
// finest granularity the stored string carries). Order-agnostic.
export function midpointIso(aIso, bIso) {
  const mid = Math.floor((toEpochMs(aIso) + toEpochMs(bIso)) / 2 / 1000) * 1000;
  return fmtIsoSec(mid);
}
// Absolute difference in CALENDAR days between two timestamps — the "3-day
// window" that decides auto-interpolate vs. picker reads this, not elapsed
// hours, so two rows a minute apart across midnight count as 1 day. Rounded to
// absorb DST-shortened days.
export function dayGapAbs(aIso, bIso) {
  const a = toEpochMs(String(aIso).slice(0, 10));
  const b = toEpochMs(String(bIso).slice(0, 10));
  return Math.abs(Math.round((a - b) / 86400000));
}
export function currentMonth() { return nowIso().slice(0, 7); }

export function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + k;
  return `${Math.floor(i / 12)}-${p2((i % 12) + 1)}`;
}
// Day arithmetic on a 'YYYY-MM-DD' string, via a local Date so month/year
// rollover is handled for us. Used by the Today/Yesterday range presets and the
// day-stepping arrows.
export function addDays(ymd, k) {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + k);
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
}
// A typed date, read the way a person types one. The register's date cell is a
// text field (dd/mm/yyyy), so this accepts what a hand actually produces:
//   '17'         → the 17th of the month you are in
//   '17/8'       → this year
//   '17/8/26'    → a two-digit year is 20xx
//   '17/08/2026' → in full
//   '2026-08-17' → ISO order, recognised by a four-digit FIRST part
// Separators are anything non-digit-ish (/, -, .), and `today` is injected —
// like the rest of this file, nothing reads the wall clock. Returns
// 'YYYY-MM-DD', or null for anything that is not a real date (31/2, 13 as a
// month, a stray letter): null is what puts the --neg ring on the field, so
// being strict AFTER being lenient is the whole point.
// The characters a typed date is ever allowed to contain — digits and the
// three separators parseTypedDate reads (/, ., -) plus a bare space. Shared
// with filterDateChars below so the DATE cell can strip anything else AS THE
// USER TYPES (garbage never appears in the field at all) using the exact same
// definition parseTypedDate itself rejects on, rather than two charsets that
// could drift apart.
const DATE_CHAR = /[0-9/.\- ]/;

export function parseTypedDate(text, today, order) {
  const s = String(text == null ? '' : text).trim();
  if (!s || [...s].some(ch => !DATE_CHAR.test(ch))) return null;
  const parts = s.split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  let y, m, d;
  if (parts.length === 3 && parts[0].length === 4) {
    [y, m, d] = parts.map(Number);
  } else {
    // Short forms follow the plan's date order (BR-U3-5): an 'MDY' plan reads
    // '3/4' as March 4. A bare part is a day-of-this-month in every order, and
    // 'YMD' plans type ISO-style — that's the 4-digit-first branch above — so
    // their short forms keep the historical day-first reading.
    const mdy = (order || activeFormat().typedDateOrder) === 'MDY' && parts.length >= 2;
    d = Number(parts[mdy ? 1 : 0]);
    m = parts.length >= 2 ? Number(parts[mdy ? 0 : 1]) : Number(today.slice(5, 7));
    if (parts.length === 3) y = parts[2].length <= 2 ? 2000 + Number(parts[2]) : Number(parts[2]);
    else y = Number(today.slice(0, 4));
  }
  if (!(y >= 1900 && y <= 2999) || !(m >= 1 && m <= 12)) return null;
  const ym = `${y}-${p2(m)}`;
  if (!(d >= 1 && d <= daysInMonth(ym))) return null;
  return `${ym}-${p2(d)}`;
}

export function monthsBetween(fromYm, toYm) {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}
export function clampDay(ym, day) { return Math.min(day, daysInMonth(ym)); }

// The typed date field's hint text — the plan's own pattern, lowercased
// ('dd/mm/yyyy' under the legacy default), so the placeholder never promises
// an order parseTypedDate would then read differently.
export function datePlaceholder() {
  return activeFormat().datePattern.toLowerCase();
}

// Strips anything parseTypedDate would reject BEFORE it ever reaches the
// field — so typing "17aug" leaves "17" on screen instead of a rejected
// draft, and the --neg invalid ring only ever means "a real date string that
// still doesn't resolve" (an impossible day/month), never "you typed a
// letter".
export function filterDateChars(s) {
  return [...String(s == null ? '' : s)].filter(ch => DATE_CHAR.test(ch)).join('');
}

// Contiguous month list from the earliest month with data up to the current
// month, plus an opt-in lookahead of future months tacked on past `cur`.
// This is what the header month selector navigates. `lookahead` defaults to 0
// because reports.js's trend series also drive off this list via
// `.slice(-window)` — a nonzero default would push empty future months into
// their window and crowd out real history, so its trend windows must stay
// past-only. Callers that want future months (the header stepper, via
// MonthContext) pass `{ lookahead }` explicitly; reports.js keeps calling
// `monthsFor(store)` unchanged.
const MAX_MONTHS = 24;
export function monthsFor(store, { lookahead = 0 } = {}) {
  const cur = currentMonth();
  let earliest = cur;
  const consider = ym => { if (ym && ym < earliest) earliest = ym; };
  if (store) {
    // Only months that actually hold data — account creation alone doesn't add empty months.
    store.transactions.forEach(t => consider(t.date.slice(0, 7)));
    store.snapshots.forEach(s => { if (s.status === 'confirmed') consider(s.month); });
  }
  const span = Math.min(monthsBetween(earliest, cur), MAX_MONTHS - 1);
  const out = [];
  for (let k = span; k >= 0; k--) out.push(addMonths(cur, -k));
  for (let k = 1; k <= lookahead; k++) out.push(addMonths(cur, k));
  return out;
}
