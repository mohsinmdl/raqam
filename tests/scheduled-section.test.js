import { describe, it, expect } from 'vitest';
import { scheduledRules, sourceLabel } from '../src/lib/schedule.js';
import { ruleRowOf, txGroups } from '../src/lib/txRow.js';

const NOW = '2026-08-06T10:00';

const rule = over => ({
  id: 'r1', name: 'Rent', type: 'expense', amount: 45000, estimated: false,
  category: 'rent', accountId: 'a1', cardId: null, status: 'active',
  nextDate: '2026-08-20', schedule: { every: 1, unit: 'month', days: [20], ends: { kind: 'never' } },
  occurrences: [], ...(over || {}),
});
const store = over => ({
  categories: [{ id: 'rent', name: 'Rent', color: '#c33', type: 'expense', status: 'active' }],
  accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
  cards: [{ id: 'c1', nickname: 'Platinum', last4: '4417' }],
  recurring: [rule()], ...(over || {}),
});
const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };

describe('scheduledRules', () => {
  it('keeps rules whose next date falls inside the range', () => {
    const got = scheduledRules(store(), '2026-08', '2026-08', NOW);
    expect(got.map(r => r.id)).toEqual(['r1']);
  });

  it('drops rules due outside the range', () => {
    expect(scheduledRules(store(), '2026-09', '2026-09', NOW)).toEqual([]);
    expect(scheduledRules(store(), '2026-01', '2026-07', NOW)).toEqual([]);
  });

  it('spans a multi-month range', () => {
    const S = store({ recurring: [rule(), rule({ id: 'r2', nextDate: '2026-10-01' })] });
    expect(scheduledRules(S, '2026-08', '2026-12', NOW).map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('treats an empty range as all dates', () => {
    const S = store({ recurring: [rule({ nextDate: '2021-03-01' })] });
    expect(scheduledRules(S, '', '', NOW).map(r => r.id)).toEqual(['r1']);
  });

  it('includes overdue rules when the range covers the date they were due', () => {
    const S = store({ recurring: [rule({ nextDate: '2026-08-01' })] });
    expect(scheduledRules(S, '2026-08', '2026-08', NOW).map(r => r.id)).toEqual(['r1']);
  });

  it('excludes paused rules', () => {
    expect(scheduledRules(store({ recurring: [rule({ status: 'paused' })] }), '2026-08', '2026-08', NOW)).toEqual([]);
  });

  it('excludes ended rules even while their status is still active', () => {
    const ended = rule({ schedule: { every: 1, unit: 'month', days: [20], ends: { kind: 'date', date: '2026-07-01' } } });
    expect(scheduledRules(store({ recurring: [ended] }), '2026-08', '2026-08', NOW)).toEqual([]);
  });

  it('excludes rules with no next date', () => {
    expect(scheduledRules(store({ recurring: [rule({ nextDate: null })] }), '', '', NOW)).toEqual([]);
  });

  it('returns soonest first', () => {
    const S = store({ recurring: [rule({ id: 'late', nextDate: '2026-08-28' }), rule({ id: 'soon', nextDate: '2026-08-09' })] });
    expect(scheduledRules(S, '2026-08', '2026-08', NOW).map(r => r.id)).toEqual(['soon', 'late']);
  });

  it('tolerates a store with no recurring rules at all', () => {
    expect(scheduledRules({}, '2026-08', '2026-08', NOW)).toEqual([]);
  });
});

describe('sourceLabel', () => {
  it('names the account', () => expect(sourceLabel(store(), rule())).toBe('Main'));
  it('names the card with its last four, which wins over the account', () =>
    expect(sourceLabel(store(), rule({ cardId: 'c1' }))).toBe('Platinum ••4417'));
  it('falls back to a dash when neither resolves', () =>
    expect(sourceLabel(store(), rule({ accountId: 'gone' }))).toBe('—'));
});

describe('ruleRowOf', () => {
  it('namespaces the key so it can never collide with a transaction id', () => {
    expect(ruleRowOf(rule(), store(), fmt, NOW).key).toBe('rule:r1');
    expect(ruleRowOf(rule(), store(), fmt, NOW).ruleId).toBe('r1');
  });

  it('carries the fields the shared row cells read', () => {
    const row = ruleRowOf(rule(), store(), fmt, NOW);
    expect(row.merchant).toBe('Rent');
    expect(row.catName).toBe('Rent');
    expect(row.catColor).toBe('#c33');
    expect(row.acctLabel).toBe('Main');
    expect(row.isRepeating).toBe(true);
    expect(row.isRule).toBe(true);
  });

  it('marks a future occurrence Scheduled and a past one Overdue', () => {
    expect(ruleRowOf(rule(), store(), fmt, NOW).stLabel).toBe('Scheduled');
    expect(ruleRowOf(rule(), store(), fmt, NOW).isOverdue).toBe(false);
    const past = ruleRowOf(rule({ nextDate: '2026-08-01' }), store(), fmt, NOW);
    expect(past.stLabel).toBe('Overdue');
    expect(past.isOverdue).toBe(true);
    expect(past.stFg).toBe('var(--neg)');
  });

  it('counts today as due, not overdue', () => {
    const today = ruleRowOf(rule({ nextDate: '2026-08-06' }), store(), fmt, NOW);
    expect(today.isOverdue).toBe(false);
    expect(today.timeLabel).toBe('Due today');
  });

  it('keeps the ~ on estimated amounts rather than implying a firm figure', () => {
    expect(ruleRowOf(rule({ estimated: true }), store(), fmt, NOW).amtLabel).toBe('~Rs 45000');
    expect(ruleRowOf(rule(), store(), fmt, NOW).amtLabel).toBe('Rs 45000');
  });

  it('colours income differently from money going out', () => {
    expect(ruleRowOf(rule({ type: 'income' }), store(), fmt, NOW).amtColor).toBe('var(--pos)');
    expect(ruleRowOf(rule(), store(), fmt, NOW).amtColor).toBe('var(--text)');
  });

  it('sorts on the due date', () => {
    expect(ruleRowOf(rule(), store(), fmt, NOW).sortKey).toBe('2026-08-20');
  });

  it('offers nothing selectable or editable — a rule is not a transaction', () => {
    const row = ruleRowOf(rule(), store(), fmt, NOW);
    expect(row.canEdit).toBe(false);
    expect(row.canRepeat).toBe(false);
    expect(row.id).toBeUndefined();
  });

  it('survives a rule with no category', () => {
    const row = ruleRowOf(rule({ category: null }), store(), fmt, NOW);
    expect(row.catName).toBe('—');
    expect(row.catColor).toBe('var(--border)');
  });
});

// --- grouping ---------------------------------------------------------------
const tx = over => ({
  id: 't1', date: '2026-08-05T12:00', type: 'expense', amount: 100, status: 'cleared',
  accountId: 'a1', category: 'rent', merchant: 'Shop', notes: '', ...(over || {}),
});
const RANGE = { from: '2026-08', to: '2026-08' };

describe('txGroups', () => {
  const S = store();

  it('sends a transaction dated ahead of now to the scheduled group', () => {
    const list = [tx({ id: 'past' }), tx({ id: 'ahead', date: '2026-08-30T09:00' })];
    const g = txGroups(list, S, fmt, NOW, RANGE, true);
    expect(g.postedRows.map(r => r.id)).toEqual(['past']);
    expect(g.scheduled.map(x => x.selId)).toEqual(['ahead']);
  });

  it('counts a transaction dated exactly now as posted, not scheduled', () => {
    const g = txGroups([tx({ id: 'now', date: NOW })], S, fmt, NOW, RANGE, true);
    expect(g.postedRows.map(r => r.id)).toEqual(['now']);
    expect(g.scheduled).toEqual([]);
  });

  it('never lets a row appear in both groups', () => {
    const list = [tx({ id: 'a' }), tx({ id: 'b', date: '2026-08-30T09:00' }), tx({ id: 'c' })];
    const g = txGroups(list, S, fmt, NOW, RANGE, false);
    const posted = g.postedRows.map(r => r.id);
    const sched = g.scheduled.map(x => x.selId).filter(Boolean);
    expect(posted.filter(id => sched.includes(id))).toEqual([]);
    expect(posted.length + sched.length).toBe(list.length);
  });

  it('interleaves rules and future transactions soonest first', () => {
    const S2 = store({ recurring: [rule({ id: 'r1', nextDate: '2026-08-20' })] });
    const list = [tx({ id: 'early', date: '2026-08-10T09:00' }), tx({ id: 'late', date: '2026-08-25T09:00' })];
    const g = txGroups(list, S2, fmt, NOW, RANGE, false);
    expect(g.scheduled.map(x => x.selId || x.row.ruleId)).toEqual(['early', 'r1', 'late']);
  });

  it('puts an overdue rule at the top of the group and counts it', () => {
    const S2 = store({ recurring: [rule({ id: 'due', nextDate: '2026-08-20' }), rule({ id: 'late', nextDate: '2026-08-01' })] });
    const g = txGroups([], S2, fmt, NOW, RANGE, false);
    expect(g.scheduled.map(x => x.row.ruleId)).toEqual(['late', 'due']);
    expect(g.overdueCount).toBe(1);
  });

  it('drops the rules while a filter is on but keeps future transactions', () => {
    const list = [tx({ id: 'ahead', date: '2026-08-30T09:00' })];
    const on = txGroups(list, S, fmt, NOW, RANGE, true);
    expect(on.scheduled.map(x => x.selId)).toEqual(['ahead']);
    expect(on.overdueCount).toBe(0);
    const off = txGroups(list, S, fmt, NOW, RANGE, false);
    expect(off.scheduled.length).toBe(2);
  });

  it('gives future transactions a selectable id and rules none', () => {
    const S2 = store();
    const g = txGroups([tx({ id: 'ahead', date: '2026-08-30T09:00' })], S2, fmt, NOW, RANGE, false);
    const ruleEntry = g.scheduled.find(x => x.row.isRule);
    const txEntry = g.scheduled.find(x => !x.row.isRule);
    expect(ruleEntry.selId).toBeUndefined();
    expect(txEntry.selId).toBe('ahead');
  });

  it('honours the range for rules — a rule due next month stays out', () => {
    const S2 = store({ recurring: [rule({ nextDate: '2026-09-20' })] });
    expect(txGroups([], S2, fmt, NOW, RANGE, false).scheduled).toEqual([]);
    expect(txGroups([], S2, fmt, NOW, { from: '2026-08', to: '2026-09' }, false).scheduled.length).toBe(1);
  });

  it('returns empty groups for an empty list and no rules', () => {
    const g = txGroups([], store({ recurring: [] }), fmt, NOW, RANGE, false);
    expect(g.scheduled).toEqual([]);
    expect(g.postedRows).toEqual([]);
    expect(g.overdueCount).toBe(0);
  });
});
