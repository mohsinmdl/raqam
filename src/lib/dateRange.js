// Month ranges for the Transactions filter.
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
import { addMonths, currentMonth } from './dates.js';

export const RANGE_PRESETS = [
  { id: 'month', label: 'This Month' },
  { id: 'last3', label: 'Latest 3 Months' },
  { id: 'year', label: 'This Year' },
  { id: 'lastYear', label: 'Last Year' },
  { id: 'all', label: 'All Dates' },
];

export const MONTH_OPTS = MN.map((name, i) => ({ id: String(i + 1).padStart(2, '0'), label: name }));

// `today` is injectable so the tests don't depend on the wall clock.
export function rangeFor(presetId, today) {
  const now = today || currentMonth();
  const year = now.slice(0, 4);
  switch (presetId) {
    case 'month': return { from: now, to: now };
    // Three months INCLUDING this one, so -2. In February this reaches back
    // into December of the previous year, which addMonths handles.
    case 'last3': return { from: addMonths(now, -2), to: now };
    case 'year': return { from: year + '-01', to: year + '-12' };
    case 'lastYear': {
      const y = String(Number(year) - 1);
      return { from: y + '-01', to: y + '-12' };
    }
    case 'all': return { from: null, to: null };
    default: return { from: now, to: now };
  }
}

// Inclusive at both ends; a null bound is unbounded on that side.
export function inRange(t, from, to) {
  const m = String(t.date || '').slice(0, 7);
  if (!m) return false;
  if (from && m < from) return false;
  if (to && m > to) return false;
  return true;
}

// Which preset a range corresponds to, or 'custom'. Lets the popover show the
// right chip highlighted after From/To have been edited back to a known window.
export function presetOf(from, to, today) {
  const hit = RANGE_PRESETS.find(p => {
    const r = rangeFor(p.id, today);
    return r.from === from && r.to === to;
  });
  return hit ? hit.id : 'custom';
}

export function rangeLabel(from, to) {
  if (!from && !to) return 'All dates';
  if (from && !to) return 'From ' + monthLabel(from);
  if (!from && to) return 'Up to ' + monthLabel(to);
  if (from === to) return monthLabel(from);
  const shortM = ym => MN[Number(ym.slice(5)) - 1].slice(0, 3);
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

// Years worth offering: earliest data through this year, never an empty list.
export function yearOpts(store, today) {
  const now = today || currentMonth();
  const thisYear = Number(now.slice(0, 4));
  let earliest = thisYear;
  for (const t of (store && store.transactions) || []) {
    const y = Number(String(t.date).slice(0, 4));
    if (y && y < earliest) earliest = y;
  }
  const out = [];
  for (let y = earliest; y <= thisYear; y++) out.push(String(y));
  return out;
}
