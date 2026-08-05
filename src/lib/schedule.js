// Recurrence engine for recurring rules. Pure date maths, no money logic —
// which is why it lives here rather than in calc.js.
//
// A schedule is:
//   { every, unit: 'day'|'week'|'month'|'year', days: [dayRule], ends }
//
//   day   → days is ignored
//   week  → dayRule = 0..6 (Sunday = 0)
//   month → dayRule = 1..31 | 'last' | { nth: 1|2|3|4|'last', weekday: 0..6 }
//   year  → dayRule = 'MM-DD'
//
// `days` is a LIST so one rule can fire more than once per period ("1st and
// 15th", "2nd Tuesday and the last day") — which is also what makes the
// "Twice a month" / "Twice a year" presets expressible.
//
//   ends = { kind: 'never' }
//        | { kind: 'count', count: N }   // N occurrences, recorded OR skipped
//        | { kind: 'date',  date: 'YYYY-MM-DD' }
//
// Every date in and out is a naive local 'YYYY-MM-DD' string, matching the
// store contract. Overflow always CLAMPS to the real end of the month and
// never rolls into the next one: the 31st in a 30-day month is the 30th.
import { MN, daysUntil, shortDate, dayLabel } from './calc.js';

export const UNITS = ['day', 'week', 'month', 'year'];
const UNIT_LABEL = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };
const UNIT_HEAD = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTHS = [1, 2, 3, 4, 'last'];

const p2 = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const isoOf = d => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
const dateOf = ymd => new Date(ymd + 'T00:00');
export function addDays(ymd, n) { const d = dateOf(ymd); d.setDate(d.getDate() + n); return isoOf(d); }
export function ord(n) {
  const v = Number(n), t = v % 100;
  if (t >= 11 && t <= 13) return v + 'th';
  return v + ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------
// Accepts the design prototype's single-`day` shape and the `{}` default the
// migration writes, so a legacy or half-built row can never crash the engine.
export function normalizeEnds(e) {
  if (e && e.kind === 'count') {
    const count = Math.max(1, Math.round(Number(e.count) || 1));
    return { kind: 'count', count };
  }
  if (e && e.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return { kind: 'date', date: e.date };
  return { kind: 'never' };
}

function dayRank(unit, dr) {
  if (unit === 'month') {
    if (dr === 'last') return 99;
    if (dr && typeof dr === 'object') return dr.nth === 'last' ? 98 : 1 + (Number(dr.nth) - 1) * 7;
    return Number(dr) || 0;
  }
  if (unit === 'week') return Number(dr) || 0;
  return String(dr);
}

export function normalizeSchedule(s) {
  const src = s && typeof s === 'object' ? s : {};
  const unit = UNITS.includes(src.unit) ? src.unit : 'month';
  const every = Math.max(1, Math.round(Number(src.every) || 1));
  let days = Array.isArray(src.days)
    ? src.days.slice()
    : (src.day === undefined || src.day === null || src.day === '' ? [] : [src.day]);
  days = unit === 'day' ? [] : days.filter(d => d !== undefined && d !== null && d !== '');
  days.sort((a, b) => (dayRank(unit, a) > dayRank(unit, b) ? 1 : dayRank(unit, a) < dayRank(unit, b) ? -1 : 0));
  return { every, unit, days, ends: normalizeEnds(src.ends) };
}

// A schedule with no day rules still has to advance — fall back to the day
// implied by the date we're advancing from rather than refusing to compute.
function daysFor(s, after) {
  if (s.unit === 'day') return [null]; // one pass; the day unit has no day rule
  if (s.days.length) return s.days;
  if (s.unit === 'week') return [dateOf(after).getDay()];
  if (s.unit === 'year') return [after.slice(5)];
  return [Number(after.slice(8, 10))];
}

// ---------------------------------------------------------------------------
// Resolving a day rule inside one month
// ---------------------------------------------------------------------------
// `m` is 1-based. Clamps; never returns a date outside (y, m).
export function resolveMonthDay(y, m, dayRule) {
  const last = new Date(y, m, 0).getDate();
  if (dayRule === 'last') return iso(y, m, last);
  if (dayRule && typeof dayRule === 'object' && dayRule.weekday != null) {
    const wd = Number(dayRule.weekday);
    if (dayRule.nth === 'last') {
      let d = last;
      while (new Date(y, m - 1, d).getDay() !== wd) d--;
      return iso(y, m, d);
    }
    const firstWd = new Date(y, m - 1, 1).getDay();
    let d = 1 + ((wd - firstWd + 7) % 7) + (Math.max(1, Number(dayRule.nth) || 1) - 1) * 7;
    while (d > last) d -= 7; // a 5th Monday that doesn't exist falls back to the 4th
    return iso(y, m, d);
  }
  return iso(y, m, Math.min(Math.max(1, Number(dayRule) || 1), last));
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------
// The first date this schedule fires STRICTLY AFTER `after`. Deliberately not
// "after today": an occurrence that was missed stays in the past so the rule
// reads as overdue until it is recorded or skipped. Nothing auto-advances.
export function advanceDue(schedule, after) {
  const s = normalizeSchedule(schedule);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(after || '')) return null;
  const rules = daysFor(s, after);
  let best = null;
  for (const dr of rules) {
    let cand = null;
    if (s.unit === 'day') {
      cand = addDays(after, s.every);
    } else if (s.unit === 'week') {
      const wd = Number(dr);
      const d = dateOf(after);
      d.setDate(d.getDate() + 1);
      let guard = 0;
      while (d.getDay() !== wd && guard++ < 14) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + (s.every - 1) * 7);
      cand = isoOf(d);
    } else if (s.unit === 'year') {
      const [mm, dd] = String(dr).split('-').map(Number);
      let y = Number(after.slice(0, 4));
      cand = resolveMonthDay(y, mm, dd);
      let guard = 0;
      while (cand <= after && guard++ < 200) { y += s.every; cand = resolveMonthDay(y, mm, dd); }
    } else {
      let y = Number(after.slice(0, 4)), m = Number(after.slice(5, 7));
      cand = resolveMonthDay(y, m, dr);
      let guard = 0;
      while (cand <= after && guard++ < 400) {
        m += s.every;
        while (m > 12) { m -= 12; y += 1; }
        cand = resolveMonthDay(y, m, dr);
      }
    }
    if (cand && (!best || cand < best)) best = cand;
  }
  return best;
}

// First firing on or after `from` — used to re-materialise a rule whose
// nextDate went missing, without silently skipping a due date.
export function nextOnOrAfter(schedule, from) {
  let cand = advanceDue(schedule, addDays(from, -1));
  let guard = 0;
  while (cand && cand < from && guard++ < 500) cand = advanceDue(schedule, cand);
  return cand;
}

// ---------------------------------------------------------------------------
// Occurrences and ends
// ---------------------------------------------------------------------------
export function occurrenceList(rule) { return Array.isArray(rule && rule.occurrences) ? rule.occurrences : []; }
// Both outcomes consume an occurrence: skipping still uses one of "after N times".
export function occurrencesUsed(rule) {
  return occurrenceList(rule).filter(o => o.outcome === 'recorded' || o.outcome === 'skipped').length;
}
export function recordedOccurrences(rule) {
  return occurrenceList(rule).filter(o => o.outcome === 'recorded' && isFinite(o.amount));
}

// The rule a transaction belongs to, found through the occurrence that records
// it. occurrences[].txId is the only link between the two — transactions carry
// no rule column — and it is what stops one transaction spawning two rules.
export function ruleFromTx(store, txId) {
  if (!txId) return null;
  return (store.recurring || []).find(r => occurrenceList(r).some(o => o.txId === txId)) || null;
}

export function isEnded(rule) {
  if (!rule) return false;
  const ends = normalizeSchedule(rule.schedule).ends;
  if (ends.kind === 'count') return occurrencesUsed(rule) >= ends.count;
  if (ends.kind === 'date') return !rule.nextDate || rule.nextDate > ends.date;
  return false;
}

// The next `n` firings, truncated by the end condition — so a rule with two
// occurrences left never previews three.
export function nextOccurrences(rule, n, fromDate) {
  const s = normalizeSchedule(rule && rule.schedule);
  const limit = n || 3;
  const used = occurrencesUsed(rule);
  let cursor = fromDate || (rule && rule.nextDate);
  const out = [];
  let guard = 0;
  while (cursor && out.length < limit && guard++ < 200) {
    if (s.ends.kind === 'date' && cursor > s.ends.date) break;
    if (s.ends.kind === 'count' && used + out.length >= s.ends.count) break;
    out.push(cursor);
    cursor = advanceDue(s, cursor);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
// 'ended' is DERIVED, never stored: editing the end condition re-opens a rule
// with no write-back sweep, and two devices can't disagree about a flag.
// It outranks 'paused' — a finished rule has nothing to resume to.
export function ruleStatus(rule, now) {
  if (!rule) return 'later';
  if (isEnded(rule)) return 'ended';
  if (rule.status === 'paused') return 'paused';
  if (!rule.nextDate) return 'later';
  const d = daysUntil(rule.nextDate, now);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'due';
  return 'later';
}

export function ruleDueLabel(rule, now) {
  if (!rule || !rule.nextDate) return '—';
  const d = daysUntil(rule.nextDate, now);
  if (d < 0) return Math.abs(d) === 1 ? '1 day overdue' : Math.abs(d) + ' days overdue';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return 'In ' + d + ' days';
}

// Estimated rules suggest the mean of recent actuals; below two samples the
// stored estimate is still the better guess.
export function estimatedSuggestion(rule) {
  const recs = recordedOccurrences(rule).slice().sort((a, b) => (a.due < b.due ? 1 : -1)).slice(0, 3);
  if (!rule || !rule.estimated || recs.length < 2) return { amount: rule ? rule.amount : 0, basis: 'estimate', n: recs.length };
  const mean = recs.reduce((s, o) => s + Number(o.amount), 0) / recs.length;
  return { amount: Math.round(mean), basis: 'average', n: recs.length };
}

// ---------------------------------------------------------------------------
// Store-level selectors
// ---------------------------------------------------------------------------
const byNext = (a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0);
export function overdueRules(store, now) {
  return (store.recurring || []).filter(r => ruleStatus(r, now) === 'overdue').sort(byNext);
}
export function upcomingRules(store, month, now) {
  return (store.recurring || [])
    .filter(r => r.status === 'active' && !isEnded(r) && r.nextDate
      && r.nextDate.slice(0, 7) === month && daysUntil(r.nextDate, now) >= 0)
    .sort(byNext);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export function longDate(ymd, now) {
  if (!ymd) return '—';
  const label = shortDate(ymd + 'T00:00');
  const y = ymd.slice(0, 4);
  return y === String(now || '').slice(0, 4) ? label : label + ' ' + y;
}
const plainDate = ymd => dayLabel(ymd + 'T00:00') + ' ' + ymd.slice(0, 4);

export function dayRuleLabel(unit, dr) {
  if (unit === 'week') return WEEKDAYS[Number(dr)] || '—';
  if (unit === 'year') {
    const [mm, dd] = String(dr).split('-').map(Number);
    return ord(dd) + ' ' + MN[mm - 1].slice(0, 3);
  }
  if (dr === 'last') return 'last day';
  if (dr && typeof dr === 'object') {
    const nth = dr.nth === 'last' ? 'last' : ord(dr.nth);
    return nth + ' ' + (WEEKDAYS[Number(dr.weekday)] || '—');
  }
  return ord(dr);
}

export function freqLabel(schedule) {
  const s = normalizeSchedule(schedule);
  const head = s.every === 1 ? UNIT_HEAD[s.unit] : 'Every ' + s.every + ' ' + UNIT_LABEL[s.unit][1];
  let out = head;
  if (s.unit !== 'day' && s.days.length) out += ' · ' + s.days.map(d => dayRuleLabel(s.unit, d)).join(' & ');
  if (s.ends.kind === 'count') out += ' · ends after ' + s.ends.count;
  else if (s.ends.kind === 'date') out += ' · ends ' + plainDate(s.ends.date);
  return out;
}

// ---------------------------------------------------------------------------
// Presets (the transaction form's Repeat dropdown)
// ---------------------------------------------------------------------------
export const PRESETS = [
  { id: 'never', label: 'Never' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every other week' },
  { id: 'twice-monthly', label: 'Twice a month' },
  { id: 'every-4-weeks', label: 'Every 4 weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'every-other-month', label: 'Every other month' },
  { id: 'every-3-months', label: 'Every 3 months' },
  { id: 'every-4-months', label: 'Every 4 months' },
  { id: 'twice-yearly', label: 'Twice a year' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'every-other-year', label: 'Every other year' },
];

// Every preset anchors on the transaction's own date, so the rule continues
// the series the transaction started.
export function presetSchedule(presetId, ymd) {
  if (!presetId || presetId === 'never' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return null;
  const d = Number(ymd.slice(8, 10));
  const wd = dateOf(ymd).getDay();
  const md = ymd.slice(5);
  const ends = { kind: 'never' };
  const S = (every, unit, days) => ({ every, unit, days, ends });
  switch (presetId) {
    case 'daily': return S(1, 'day', []);
    case 'weekly': return S(1, 'week', [wd]);
    case 'biweekly': return S(2, 'week', [wd]);
    case 'every-4-weeks': return S(4, 'week', [wd]);
    // Two firings a month, half a month apart — inexpressible as every-N-units,
    // which is exactly why `days` is a list.
    case 'twice-monthly': return S(1, 'month', d <= 15 ? [d, d + 15] : [d - 15, d]);
    case 'monthly': return S(1, 'month', [d]);
    case 'every-other-month': return S(2, 'month', [d]);
    case 'every-3-months': return S(3, 'month', [d]);
    case 'every-4-months': return S(4, 'month', [d]);
    case 'twice-yearly': {
      const mm = Number(md.slice(0, 2)), dd = md.slice(3);
      const other = p2(((mm - 1 + 6) % 12) + 1) + '-' + dd;
      return S(1, 'year', [md, other].sort());
    }
    case 'yearly': return S(1, 'year', [md]);
    case 'every-other-year': return S(2, 'year', [md]);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Drawer form <-> schedule
// ---------------------------------------------------------------------------
// The form keeps day rules as flat string-bearing objects so plain <select>s
// can drive them; this is the only place that shape is understood.
export function buildSchedule(f) {
  const unit = UNITS.includes(f.unit) ? f.unit : 'month';
  const every = Math.max(1, Math.round(Number(f.every) || 1));
  const days = unit === 'day' ? [] : (f.dayRules || []).map(r => {
    if (unit === 'week') return Number(r.weekday);
    if (unit === 'year') return r.md;
    if (r.kind === 'last') return 'last';
    if (r.kind === 'nth') return { nth: r.nth === 'last' ? 'last' : Number(r.nth), weekday: Number(r.weekday) };
    return Number(r.day);
  });
  let ends = { kind: 'never' };
  if (f.endsKind === 'count') ends = { kind: 'count', count: Math.max(1, Math.round(Number(f.endsCount) || 1)) };
  else if (f.endsKind === 'date') ends = { kind: 'date', date: f.endsDate };
  return normalizeSchedule({ every, unit, days, ends });
}

export function formFromSchedule(schedule) {
  const s = normalizeSchedule(schedule);
  const dayRules = s.unit === 'day' ? [] : s.days.map(d => {
    if (s.unit === 'week') return { kind: 'wd', weekday: String(d) };
    if (s.unit === 'year') return { kind: 'md', md: String(d) };
    if (d === 'last') return { kind: 'last' };
    if (d && typeof d === 'object') return { kind: 'nth', nth: String(d.nth), weekday: String(d.weekday) };
    return { kind: 'dom', day: String(d) };
  });
  return {
    every: String(s.every),
    unit: s.unit,
    dayRules,
    endsKind: s.ends.kind,
    endsCount: s.ends.kind === 'count' ? String(s.ends.count) : '',
    endsDate: s.ends.kind === 'date' ? s.ends.date : '',
  };
}

export const NTH_OPTS = NTHS.map(n => ({ id: String(n), label: n === 'last' ? 'Last' : ord(n) }));
