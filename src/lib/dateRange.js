// Month ranges, shared by the Transactions filter and the Reflect reports'
// date pill. Both need the same arithmetic over the same bound format; the
// two differences (which presets each offers, and whether a year gate
// applies) are parameters, not separate implementations.
//
// A range is two 'YYYY-MM' strings, either of which may be null meaning
// unbounded. Because months are zero-padded text, chronological order IS
// lexicographic order — so the whole filter is a string comparison and needs no
// Date objects. The store relies on the same property everywhere else.
//
// The date arithmetic lives here rather than in the screen because the awkward
// cases (a three-month window in February reaching back into last year) are
// worth testing, and a component is not.
import { MN, monthLabel } from './calc.js';
import { addDays, addMonths, currentMonth, todayStr } from './dates.js';

// A bound is either a month ('YYYY-MM'), a day ('YYYY-MM-DD'), or null
// (unbounded). Today/Yesterday are day-precise; the other presets are months.
// Because both formats are zero-padded, lexicographic order stays chronological,
// so inRange compares a same-length prefix of the transaction date against each
// bound and needs no Date objects.
export const RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'month', label: 'This Month' },
  { id: 'last3', label: 'Latest 3 Months' },
  { id: 'year', label: 'This Year' },
  { id: 'lastYear', label: 'Last Year' },
  { id: 'all', label: 'All Dates' },
];

// YNAB-order presets for the Reflect reports' date menu. Separate list because
// it drops Today/Yesterday (day precision isn't offered on reports) and adds
// last6/last12/ytd.
export const REPORT_PRESETS = [
  { id: 'month', label: 'This Month' },
  { id: 'last3', label: 'Last 3 Months' },
  { id: 'last6', label: 'Last 6 Months' },
  { id: 'last12', label: 'Last 12 Months' },
  { id: 'ytd', label: 'Year To Date' },
  { id: 'lastYear', label: 'Last Year' },
  { id: 'all', label: 'All Dates' },
];

export const MONTH_OPTS = MN.map((name, i) => ({ id: String(i + 1).padStart(2, '0'), label: name }));

// `today` is injectable so the tests don't depend on the wall clock. It may be
// a day ('YYYY-MM-DD') or a bare month ('YYYY-MM'); when only a month is given
// the day presets fall back to the 1st, which is all the month-level tests need.
export function rangeFor(presetId, today) {
  const now = today || todayStr();
  const month = now.slice(0, 7);
  const year = now.slice(0, 4);
  const day = now.length >= 10 ? now : month + '-01';
  switch (presetId) {
    case 'today': return { from: day, to: day };
    case 'yesterday': { const y = addDays(day, -1); return { from: y, to: y }; }
    case 'month': return { from: month, to: month };
    // Three months INCLUDING this one, so -2. In February this reaches back
    // into December of the previous year, which addMonths handles.
    case 'last3': return { from: addMonths(month, -2), to: month };
    case 'last6': return { from: addMonths(month, -5), to: month };
    case 'last12': return { from: addMonths(month, -11), to: month };
    case 'ytd': return { from: year + '-01', to: month };
    case 'year': return { from: year + '-01', to: year + '-12' };
    case 'lastYear': {
      const y = String(Number(year) - 1);
      return { from: y + '-01', to: y + '-12' };
    }
    case 'all': return { from: null, to: null };
    default: return { from: month, to: month };
  }
}

// Inclusive at both ends; a null bound is unbounded on that side. Each bound is
// compared against the same-length prefix of the transaction date, so a month
// bound filters by month and a day bound filters by day.
export function inRange(t, from, to) {
  const d = String(t.date || '');
  if (!d) return false;
  if (from && d.slice(0, from.length) < from) return false;
  if (to && d.slice(0, to.length) > to) return false;
  return true;
}

// Which preset a range corresponds to, or 'custom'. Lets the popover show the
// right chip highlighted after From/To have been edited back to a known window.
// `presets` is overridable so the Reflect date menu matches against
// REPORT_PRESETS instead of the Transactions filter's RANGE_PRESETS — matching
// against the wrong list would leave a valid preset reading as 'custom'.
export function presetOf(from, to, today, presets = RANGE_PRESETS) {
  const hit = presets.find(p => {
    const r = rangeFor(p.id, today);
    return r.from === from && r.to === to;
  });
  return hit ? hit.id : 'custom';
}

// `today` (optional, day-precise) lets a single-day range name itself
// 'Today' / 'Yesterday'; without it a day range reads as its date ('8 Aug 2026').
export function rangeLabel(from, to, today) {
  if (!from && !to) return 'All dates';
  // A day-precise single day (both bounds the same 10-char date).
  if (from && from === to && from.length === 10) {
    if (today && from === today) return 'Today';
    if (today && from === addDays(today, -1)) return 'Yesterday';
    const [y, m, d] = from.split('-').map(Number);
    return d + ' ' + MN[m - 1].slice(0, 3) + ' ' + y;
  }
  if (from && !to) return 'From ' + monthLabel(from);
  if (!from && to) return 'Up to ' + monthLabel(to);
  if (from === to) return monthLabel(from);
  // slice(5,7) so a stray day bound still resolves to its month here.
  const shortM = ym => MN[Number(ym.slice(5, 7)) - 1].slice(0, 3);
  // Same year reads as one span rather than repeating it: 'Jun – Aug 2026'.
  if (from.slice(0, 4) === to.slice(0, 4)) return shortM(from) + ' – ' + shortM(to) + ' ' + from.slice(0, 4);
  return shortM(from) + ' ' + from.slice(0, 4) + ' – ' + shortM(to) + ' ' + to.slice(0, 4);
}

// From after To is meaningless; the later of the two wins so the range is never
// empty for a reason the user can't see.
export function clampRange(from, to) {
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

// Steps a range by whole months, keeping its width: Jan–Jun goes to Feb–Jul,
// not to a single month. Only the bounds that exist move, so 'From Aug 2026'
// stays open-ended.
//
// Returns null when the step is impossible, which is what disables the arrows.
// Two reasons: 'All dates' has no bounds to move, and — only when the optional
// `years` gate is supplied — a step outside it would put a value in the
// From/To selects with no matching <option>, the exact failure yearOpts below
// exists to prevent. Callers with no such selects (the Reflect date pill) omit
// `years`, so only the 'All dates' case disables their arrows.
export function shiftRange(from, to, delta, years) {
  if (!from && !to) return null;
  // A day-precise range steps by day (Today → Yesterday → …); a month range
  // steps by whole months, keeping its width.
  const isDay = (from && from.length === 10) || (to && to.length === 10);
  const step = ym => (isDay ? addDays(ym, delta) : addMonths(ym, delta));
  const next = {
    from: from ? step(from) : null,
    to: to ? step(to) : null,
  };
  if (years && years.length) {
    const lo = years[0], hi = years[years.length - 1];
    const outside = ym => ym && (ym.slice(0, 4) < lo || ym.slice(0, 4) > hi);
    if (outside(next.from) || outside(next.to)) return null;
  }
  return next;
}

// Every year the controls can land on. Last year is always included even with
// no data there, because the "Last Year" preset selects it — otherwise the
// select holds a value with no matching option and the browser silently
// displays a different year. Data years beyond this one are included for the
// same reason: a future-dated transaction must be reachable.
export function yearOpts(store, today) {
  const now = today || currentMonth();
  const thisYear = Number(now.slice(0, 4));
  let earliest = thisYear - 1, latest = thisYear;
  for (const t of (store && store.transactions) || []) {
    const y = Number(String(t.date).slice(0, 4));
    if (!y) continue;
    if (y < earliest) earliest = y;
    if (y > latest) latest = y;
  }
  const out = [];
  for (let y = earliest; y <= latest; y++) out.push(String(y));
  return out;
}
