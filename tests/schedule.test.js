import { describe, it, expect } from 'vitest';
import {
  normalizeSchedule, resolveMonthDay, advanceDue, nextOnOrAfter, nextOccurrences,
  occurrencesUsed, isEnded, ruleStatus, ruleDueLabel, estimatedSuggestion,
  overdueRules, upcomingRules, freqLabel, presetSchedule, PRESETS,
  buildSchedule, formFromSchedule, addDays, ord,
} from '../src/lib/schedule.js';

// August 2026: 1st = Saturday, Mondays fall on 3/10/17/24/31, last Friday = 28.
const NOW = '2026-08-06T09:00';
const rule = over => ({
  id: 'r1', name: 'Rent', type: 'expense', amount: 35000, estimated: false,
  schedule: { every: 1, unit: 'month', days: [5], ends: { kind: 'never' } },
  nextDate: '2026-08-05', category: 'rent', accountId: 'a1',
  status: 'active', autoPost: false, occurrences: [], ...(over || {}),
});
const sched = (every, unit, days, ends) => ({ every, unit, days, ends: ends || { kind: 'never' } });

describe('normalizeSchedule', () => {
  it('migrates the design prototype single-day shape into a day list', () => {
    expect(normalizeSchedule({ every: 1, unit: 'month', day: 5 }))
      .toEqual({ every: 1, unit: 'month', days: [5], ends: { kind: 'never' } });
    expect(normalizeSchedule({ every: 1, unit: 'month', day: 'last' }).days).toEqual(['last']);
  });

  it('survives the empty object the migration backfills and any junk', () => {
    expect(normalizeSchedule({})).toEqual({ every: 1, unit: 'month', days: [], ends: { kind: 'never' } });
    expect(normalizeSchedule(null).unit).toBe('month');
    expect(normalizeSchedule({ every: 0, unit: 'nope' })).toMatchObject({ every: 1, unit: 'month' });
  });

  it('drops day rules for the day unit and sorts the rest', () => {
    expect(normalizeSchedule(sched(3, 'day', [5])).days).toEqual([]);
    expect(normalizeSchedule(sched(1, 'month', [15, 1])).days).toEqual([1, 15]);
    expect(normalizeSchedule(sched(1, 'month', ['last', 10])).days).toEqual([10, 'last']);
  });

  it('normalises end conditions and rejects malformed ones', () => {
    expect(normalizeSchedule(sched(1, 'month', [1], { kind: 'count', count: '3' })).ends).toEqual({ kind: 'count', count: 3 });
    expect(normalizeSchedule(sched(1, 'month', [1], { kind: 'date', date: 'nope' })).ends).toEqual({ kind: 'never' });
  });
});

describe('resolveMonthDay', () => {
  it('clamps overflow to the real end of the month, never into the next one', () => {
    expect(resolveMonthDay(2026, 9, 31)).toBe('2026-09-30');
    expect(resolveMonthDay(2026, 2, 30)).toBe('2026-02-28');
    expect(resolveMonthDay(2028, 2, 31)).toBe('2028-02-29'); // leap year
  });

  it('resolves last day', () => {
    expect(resolveMonthDay(2026, 8, 'last')).toBe('2026-08-31');
    expect(resolveMonthDay(2026, 2, 'last')).toBe('2026-02-28');
  });

  it('resolves nth weekday', () => {
    expect(resolveMonthDay(2026, 8, { nth: 1, weekday: 1 })).toBe('2026-08-03');
    expect(resolveMonthDay(2026, 8, { nth: 3, weekday: 1 })).toBe('2026-08-17');
    expect(resolveMonthDay(2026, 8, { nth: 'last', weekday: 5 })).toBe('2026-08-28');
  });

  it('falls back to the last real occurrence when an nth weekday does not exist', () => {
    // November 2026 has only four Mondays (2, 9, 16, 23, 30 -> five); February 2026 has four.
    expect(resolveMonthDay(2026, 2, { nth: 4, weekday: 1 })).toBe('2026-02-23');
    expect(resolveMonthDay(2026, 2, { nth: 4, weekday: 1 })).toBe(resolveMonthDay(2026, 2, { nth: 'last', weekday: 1 }));
  });
});

describe('advanceDue', () => {
  it('is always strictly after the given date', () => {
    const cases = [sched(1, 'day', []), sched(3, 'day', []), sched(1, 'week', [1]),
      sched(2, 'week', [5]), sched(1, 'month', [15]), sched(3, 'month', ['last']),
      sched(1, 'year', ['03-01']), sched(1, 'month', [{ nth: 2, weekday: 3 }])];
    for (const s of cases) {
      for (let d = 1; d <= 28; d++) {
        const from = `2026-0${d % 2 ? 3 : 9}-${String(d).padStart(2, '0')}`;
        expect(advanceDue(s, from) > from).toBe(true);
      }
    }
  });

  it('advances daily rules by the interval, even from far in the past', () => {
    expect(advanceDue(sched(1, 'day', []), '2026-08-05')).toBe('2026-08-06');
    expect(advanceDue(sched(3, 'day', []), '2026-08-30')).toBe('2026-09-02');
    // Deliberately still in the past: a missed occurrence stays overdue rather
    // than silently jumping to today.
    expect(advanceDue(sched(1, 'day', []), '2020-01-01')).toBe('2020-01-02');
  });

  it('advances weekly rules to the named weekday', () => {
    expect(advanceDue(sched(1, 'week', [1]), '2026-08-06')).toBe('2026-08-10');
    expect(advanceDue(sched(2, 'week', [1]), '2026-08-06')).toBe('2026-08-17');
    expect(advanceDue(sched(4, 'week', [1]), '2026-08-06')).toBe('2026-08-31');
  });

  it('advances monthly rules and clamps short months', () => {
    expect(advanceDue(sched(1, 'month', [5]), '2026-08-05')).toBe('2026-09-05');
    expect(advanceDue(sched(1, 'month', [31]), '2026-08-31')).toBe('2026-09-30');
    expect(advanceDue(sched(3, 'month', ['last']), '2026-08-31')).toBe('2026-11-30');
  });

  it('takes the earliest of several day rules in the same month', () => {
    const s = sched(1, 'month', [1, 15]);
    expect(advanceDue(s, '2026-08-05')).toBe('2026-08-15');
    expect(advanceDue(s, '2026-08-15')).toBe('2026-09-01');
    const mixed = sched(1, 'month', [{ nth: 2, weekday: 2 }, 'last']);
    expect(advanceDue(mixed, '2026-08-01')).toBe('2026-08-11');
    expect(advanceDue(mixed, '2026-08-11')).toBe('2026-08-31');
  });

  it('advances yearly rules across the year boundary', () => {
    expect(advanceDue(sched(1, 'year', ['03-01']), '2026-08-06')).toBe('2027-03-01');
    expect(advanceDue(sched(2, 'year', ['12-25']), '2026-12-25')).toBe('2028-12-25');
    expect(advanceDue(sched(1, 'year', ['02-20', '08-20']), '2026-08-06')).toBe('2026-08-20');
    expect(advanceDue(sched(1, 'year', ['02-20', '08-20']), '2026-08-20')).toBe('2027-02-20');
  });

  it('still advances when a schedule carries no day rules', () => {
    expect(advanceDue({ every: 1, unit: 'month', days: [] }, '2026-08-05')).toBe('2026-09-05');
  });

  it('returns null for a malformed date', () => {
    expect(advanceDue(sched(1, 'month', [5]), 'nope')).toBe(null);
  });
});

describe('nextOnOrAfter', () => {
  it('includes the boundary date itself', () => {
    expect(nextOnOrAfter(sched(1, 'month', [5]), '2026-08-05')).toBe('2026-08-05');
    expect(nextOnOrAfter(sched(1, 'month', [5]), '2026-08-06')).toBe('2026-09-05');
  });
});

describe('presets', () => {
  it('offers thirteen options starting with Never', () => {
    expect(PRESETS).toHaveLength(13);
    expect(PRESETS[0]).toEqual({ id: 'never', label: 'Never' });
    expect(PRESETS.map(p => p.label)).toContain('Twice a month');
    expect(PRESETS.map(p => p.label)).toContain('Twice a year');
  });

  it('Never creates no rule', () => {
    expect(presetSchedule('never', '2026-08-06')).toBe(null);
    expect(presetSchedule('', '2026-08-06')).toBe(null);
  });

  it('anchors each preset on the transaction date', () => {
    const on = id => presetSchedule(id, '2026-08-17'); // a Monday, day 17
    expect(on('daily')).toMatchObject({ every: 1, unit: 'day', days: [] });
    expect(on('weekly')).toMatchObject({ every: 1, unit: 'week', days: [1] });
    expect(on('biweekly')).toMatchObject({ every: 2, unit: 'week', days: [1] });
    expect(on('every-4-weeks')).toMatchObject({ every: 4, unit: 'week', days: [1] });
    expect(on('monthly')).toMatchObject({ every: 1, unit: 'month', days: [17] });
    expect(on('every-other-month')).toMatchObject({ every: 2, unit: 'month', days: [17] });
    expect(on('every-3-months')).toMatchObject({ every: 3, unit: 'month', days: [17] });
    expect(on('every-4-months')).toMatchObject({ every: 4, unit: 'month', days: [17] });
    expect(on('yearly')).toMatchObject({ every: 1, unit: 'year', days: ['08-17'] });
    expect(on('every-other-year')).toMatchObject({ every: 2, unit: 'year', days: ['08-17'] });
  });

  it('Twice a month pairs the day with one half a month away', () => {
    expect(presetSchedule('twice-monthly', '2026-08-03').days).toEqual([3, 18]);
    expect(presetSchedule('twice-monthly', '2026-08-17').days).toEqual([2, 17]);
    expect(presetSchedule('twice-monthly', '2026-08-31').days).toEqual([16, 31]);
    // The 31st half still lands inside a 30-day month.
    expect(advanceDue(presetSchedule('twice-monthly', '2026-08-31'), '2026-09-16')).toBe('2026-09-30');
  });

  it('Twice a year pairs the date with the same date six months away', () => {
    expect(presetSchedule('twice-yearly', '2026-08-20').days).toEqual(['02-20', '08-20']);
    expect(presetSchedule('twice-yearly', '2026-02-20').days).toEqual(['02-20', '08-20']);
    // 31 August's partner is 31 February, which resolves to the real month end.
    expect(presetSchedule('twice-yearly', '2026-08-31').days).toEqual(['02-31', '08-31']);
    expect(advanceDue(presetSchedule('twice-yearly', '2026-08-31'), '2026-09-01')).toBe('2027-02-28');
  });

  it('every preset produces a first due date after the transaction', () => {
    for (const p of PRESETS.filter(p => p.id !== 'never')) {
      const s = presetSchedule(p.id, '2026-08-17');
      expect(advanceDue(s, '2026-08-17') > '2026-08-17').toBe(true);
    }
  });
});

describe('end conditions', () => {
  const occ = (due, outcome) => ({ due, outcome, amount: outcome === 'recorded' ? 100 : null, txId: null, at: '2026-08-01T10:00' });

  it('counts recorded and skipped alike', () => {
    const r = rule({ occurrences: [occ('2026-06-05', 'recorded'), occ('2026-07-05', 'skipped')] });
    expect(occurrencesUsed(r)).toBe(2);
  });

  it('ends after N occurrences', () => {
    const s = sched(1, 'month', [5], { kind: 'count', count: 3 });
    const r = rule({ schedule: s, occurrences: [occ('2026-06-05', 'recorded'), occ('2026-07-05', 'recorded')] });
    expect(isEnded(r)).toBe(false);
    expect(nextOccurrences(r, 3)).toEqual(['2026-08-05']); // only one left of three
    const done = rule({ schedule: s, occurrences: [occ('2026-06-05', 'recorded'), occ('2026-07-05', 'recorded'), occ('2026-08-05', 'skipped')] });
    expect(isEnded(done)).toBe(true);
    expect(nextOccurrences(done, 3)).toEqual([]);
  });

  it('ends on a date', () => {
    const s = sched(1, 'month', [5], { kind: 'date', date: '2026-10-31' });
    const r = rule({ schedule: s });
    expect(nextOccurrences(r, 5)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(isEnded(r)).toBe(false);
    expect(isEnded(rule({ schedule: s, nextDate: '2026-11-05' }))).toBe(true);
  });

  it('never-ending schedules preview the full window', () => {
    expect(nextOccurrences(rule(), 3)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  });
});

describe('ruleStatus', () => {
  it('classifies by distance from today', () => {
    expect(ruleStatus(rule({ nextDate: '2026-08-05' }), NOW)).toBe('overdue');
    expect(ruleStatus(rule({ nextDate: '2026-08-06' }), NOW)).toBe('due');
    expect(ruleStatus(rule({ nextDate: '2026-08-13' }), NOW)).toBe('due');
    expect(ruleStatus(rule({ nextDate: '2026-08-14' }), NOW)).toBe('later');
  });

  it('reports paused rules as paused whatever their date', () => {
    expect(ruleStatus(rule({ status: 'paused', nextDate: '2026-08-01' }), NOW)).toBe('paused');
  });

  it('ranks ended above paused — a finished rule has nothing to resume to', () => {
    const s = sched(1, 'month', [5], { kind: 'count', count: 1 });
    const r = rule({ schedule: s, status: 'paused', occurrences: [{ due: '2026-07-05', outcome: 'recorded', amount: 1 }] });
    expect(ruleStatus(r, NOW)).toBe('ended');
  });

  it('labels the wait in plain words', () => {
    expect(ruleDueLabel(rule({ nextDate: '2026-08-05' }), NOW)).toBe('1 day overdue');
    expect(ruleDueLabel(rule({ nextDate: '2026-08-01' }), NOW)).toBe('5 days overdue');
    expect(ruleDueLabel(rule({ nextDate: '2026-08-06' }), NOW)).toBe('Due today');
    expect(ruleDueLabel(rule({ nextDate: '2026-08-07' }), NOW)).toBe('Due tomorrow');
    expect(ruleDueLabel(rule({ nextDate: '2026-08-12' }), NOW)).toBe('In 6 days');
  });
});

describe('store selectors', () => {
  const store = {
    recurring: [
      rule({ id: 'a', nextDate: '2026-08-01' }),                               // overdue
      rule({ id: 'b', nextDate: '2026-08-20' }),                               // later, in month
      rule({ id: 'c', nextDate: '2026-08-02', status: 'paused' }),             // paused
      rule({ id: 'd', nextDate: '2026-09-05' }),                               // next month
      rule({ id: 'e', nextDate: '2026-08-25', schedule: sched(1, 'month', [25], { kind: 'count', count: 1 }), occurrences: [{ due: '2026-07-25', outcome: 'recorded', amount: 1 }] }),
    ],
  };

  it('lists overdue rules only, excluding paused and ended', () => {
    expect(overdueRules(store, NOW).map(r => r.id)).toEqual(['a']);
  });

  it('lists this month upcoming, excluding overdue, paused and ended', () => {
    expect(upcomingRules(store, '2026-08', NOW).map(r => r.id)).toEqual(['b']);
  });
});

describe('estimatedSuggestion', () => {
  const rec = (due, amount) => ({ due, outcome: 'recorded', amount, txId: 't', at: '2026-01-01T00:00' });

  it('uses the stored estimate when the rule is fixed', () => {
    const r = rule({ amount: 5000, occurrences: [rec('2026-06-01', 100), rec('2026-07-01', 200)] });
    expect(estimatedSuggestion(r)).toEqual({ amount: 5000, basis: 'estimate', n: 2 });
  });

  it('uses the stored estimate until there are two actuals', () => {
    const r = rule({ estimated: true, amount: 5000, occurrences: [rec('2026-07-01', 900)] });
    expect(estimatedSuggestion(r)).toMatchObject({ amount: 5000, basis: 'estimate', n: 1 });
  });

  it('averages the three most recent actuals', () => {
    const r = rule({
      estimated: true, amount: 5000,
      occurrences: [rec('2026-04-01', 1000), rec('2026-05-01', 22400), rec('2026-06-01', 19850), rec('2026-07-01', 16100)],
    });
    expect(estimatedSuggestion(r)).toEqual({ amount: Math.round((22400 + 19850 + 16100) / 3), basis: 'average', n: 3 });
  });

  it('ignores skipped occurrences, which carry no amount', () => {
    const r = rule({ estimated: true, amount: 5000, occurrences: [rec('2026-06-01', 100), { due: '2026-07-01', outcome: 'skipped', amount: null }] });
    expect(estimatedSuggestion(r)).toMatchObject({ basis: 'estimate', n: 1 });
  });
});

describe('freqLabel', () => {
  it('names the common intervals', () => {
    expect(freqLabel(sched(1, 'day', []))).toBe('Daily');
    expect(freqLabel(sched(3, 'day', []))).toBe('Every 3 days');
    expect(freqLabel(sched(1, 'week', [1]))).toBe('Weekly · Monday');
    expect(freqLabel(sched(1, 'month', [5]))).toBe('Monthly · 5th');
    expect(freqLabel(sched(2, 'month', ['last']))).toBe('Every 2 months · last day');
    expect(freqLabel(sched(1, 'year', ['01-01']))).toBe('Yearly · 1st Jan');
  });

  it('names nth-weekday and multi-day rules', () => {
    expect(freqLabel(sched(1, 'month', [{ nth: 3, weekday: 1 }]))).toBe('Monthly · 3rd Monday');
    expect(freqLabel(sched(1, 'month', [{ nth: 'last', weekday: 5 }]))).toBe('Monthly · last Friday');
    expect(freqLabel(sched(1, 'month', [1, 15]))).toBe('Monthly · 1st & 15th');
    expect(freqLabel(sched(1, 'month', [{ nth: 2, weekday: 2 }, 'last']))).toBe('Monthly · 2nd Tuesday & last day');
    expect(freqLabel(sched(1, 'year', ['02-20', '08-20']))).toBe('Yearly · 20th Feb & 20th Aug');
  });

  it('appends the end condition', () => {
    expect(freqLabel(sched(1, 'month', [5], { kind: 'count', count: 5 }))).toBe('Monthly · 5th · ends after 5');
    expect(freqLabel(sched(1, 'month', [5], { kind: 'date', date: '2026-09-30' }))).toBe('Monthly · 5th · ends 30 Sep 2026');
  });
});

describe('drawer form round trip', () => {
  it('rebuilds every day-rule kind unchanged', () => {
    for (const s of [sched(1, 'day', []), sched(2, 'week', [3]), sched(1, 'month', [1, 15]),
      sched(1, 'month', ['last']), sched(1, 'month', [{ nth: 3, weekday: 1 }]),
      sched(1, 'year', ['02-20', '08-20']), sched(1, 'month', [5], { kind: 'count', count: 4 }),
      sched(1, 'month', [5], { kind: 'date', date: '2026-12-31' })]) {
      expect(buildSchedule(formFromSchedule(s))).toEqual(normalizeSchedule(s));
    }
  });
});

describe('small helpers', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('ord handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ord)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
