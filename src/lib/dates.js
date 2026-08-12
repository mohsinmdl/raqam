// Real-date layer — replaces the prototype's frozen DEMO_NOW / TODAY / MONTHS.
// All strings are local-time: 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD', 'YYYY-MM'.
import { daysInMonth } from './calc.js';

const p2 = n => String(n).padStart(2, '0');

export function nowIso() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function todayStr() { return nowIso().slice(0, 10); }
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
export function monthsBetween(fromYm, toYm) {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}
export function clampDay(ym, day) { return Math.min(day, daysInMonth(ym)); }

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
