// "Whole plan" totals — the Plan sidebar/phone card that answers "of the whole
// budget, how much is spent and how much is left?". Fixture reproduces the
// user's Wedding Plan: 20 lakh assigned in August, +5,77,500 net in September
// (including negative moves out of two categories), 10,66,500 spent in September.
import { describe, expect, it } from 'vitest';
import { planTotals } from '../src/lib/planTotals.js';
import { envelopeFor } from '../src/lib/envelope.js';

const NOW = '2026-09-27T12:00';
const cat = (id, name) => ({ id, name, type: 'expense', status: 'active', groupId: 'g1' });
const asg = (category, month, amount) => ({ id: category + month, category, month, amount });
const exp = (id, day, amount, category, over = {}) =>
  ({ id, type: 'expense', amount, category, accountId: 'wb', status: 'cleared', date: `2026-09-${day}T10:00`, ...over });

function wedding(over = {}) {
  return {
    categoryGroups: [{ id: 'g1', name: 'Wedding', sortOrder: 1 }],
    categories: [
      cat('gold', 'Gold'), cat('bari', 'Bari'), cat('clothes', 'Family Clothes'), cat('catering', 'Walima Catering'),
      cat('washer', 'Washing Machine'), cat('streamer', 'Streamer'), cat('mayun', "Bride's Mayun Suit"), cat('honeymoon', 'Honey Moon'),
      { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
    ],
    accounts: [{ id: 'wb', nickname: 'Wedding Budget', status: 'active' }],
    snapshots: [
      { accountId: 'wb', month: '2026-08', amount: 2000000, status: 'confirmed' },
      { accountId: 'wb', month: '2026-09', amount: 2000000, status: 'confirmed' },
    ],
    assignments: [
      // August: the initial 20 lakh, spread across the plan.
      asg('gold', '2026-08', 600000), asg('bari', '2026-08', 200000), asg('catering', '2026-08', 350000),
      asg('washer', '2026-08', 80000), asg('mayun', '2026-08', 50000), asg('honeymoon', '2026-08', 250000),
      asg('clothes', '2026-08', 470000),
      // September: +5,77,500 net — top-ups plus two negative moves (−9,000, −19,000).
      asg('gold', '2026-09', 14000), asg('streamer', '2026-09', 61500), asg('washer', '2026-09', -9000),
      asg('mayun', '2026-09', -19000), asg('clothes', '2026-09', 530000),
    ],
    transactions: [
      exp('t1', '02', 614000, 'gold'), exp('t2', '09', 200000, 'bari'), exp('t3', '15', 20000, 'catering'),
      exp('t4', '20', 100000, 'clothes'), exp('t5', '20', 71000, 'washer'), exp('t6', '27', 61500, 'streamer'),
    ],
    budgets: [], cards: [], recurring: [], audit: [],
    ...over,
  };
}

describe('planTotals — the wedding plan', () => {
  it('total budget, spent, remaining, cash and the shortfall', () => {
    const t = planTotals(wedding(), NOW);
    expect(t.budget).toBe(2577500);
    expect(t.spent).toBe(1066500);
    expect(t.remaining).toBe(1511000);
    expect(t.cash).toBe(933500);
    expect(t.toFund).toBe(577500);
    expect(t.unassigned).toBe(0);
    expect(t.covered).toBe(0);
    expect(t.pctSpent).toBeCloseTo(1066500 / 2577500, 10);
  });

  it('remaining matches what the Plan shows as Available for the month', () => {
    const S = wedding();
    const env = envelopeFor(S, '2026-09', NOW);
    const avail = [...env.rows.values()].reduce((s, r) => s + r.available, 0);
    expect(planTotals(S, NOW).remaining).toBe(avail);
  });
});

describe('planTotals — scope and edge cases', () => {
  it('counts assignments in FUTURE months in the total budget and the shortfall', () => {
    const S = wedding();
    S.assignments.push(asg('honeymoon', '2026-11', 100000));
    const t = planTotals(S, NOW);
    expect(t.budget).toBe(2677500);
    expect(t.remaining).toBe(1611000);
    expect(t.toFund).toBe(677500);
  });

  it('does not count pending or future-dated spending', () => {
    const S = wedding();
    S.transactions.push(exp('p1', '25', 5000, 'gold', { status: 'pending' }));
    S.transactions.push(exp('f1', '30', 7000, 'gold'));
    expect(planTotals(S, NOW).spent).toBe(1066500);
  });

  it('overspend absorbed from Ready to Assign is reported, and remaining = budget − spent + covered', () => {
    const S = wedding();
    // Bari overspent by 50,000 in August (assigned 2 lakh in Aug, 2.5 lakh spent in Aug).
    S.transactions.push({ ...exp('o1', '10', 250000, 'bari'), date: '2026-08-10T10:00' });
    const t = planTotals(S, NOW);
    expect(t.covered).toBe(50000);
    expect(t.remaining).toBe(t.budget - t.spent + t.covered);
  });

  it('cash not yet budgeted when RTA is positive', () => {
    const S = wedding();
    S.transactions.push({ id: 'i1', type: 'income', amount: 1000000, category: 'salary', accountId: 'wb', status: 'cleared', date: '2026-09-01T09:00' });
    const t = planTotals(S, NOW);
    expect(t.toFund).toBe(0);
    expect(t.unassigned).toBe(422500);
  });

  it('assignments the fold ignores (income / deleted categories) never move the end month', () => {
    // Current month overspent by 10,000 — the case that shifts if `end` moves.
    const S = wedding();
    S.transactions.push(exp('o2', '21', 10000, 'streamer')); // Streamer: 61,500 assigned, 71,500 spent
    const base = planTotals(S, NOW);
    expect(base.covered).toBe(0);
    expect(base.remaining).toBe(base.budget - base.spent); // this month's −10,000 stays in Remaining
    const stray = wedding();
    stray.transactions = S.transactions;
    stray.assignments.push(asg('salary', '2026-10', 0), asg('ghost-deleted', '2026-12', 5));
    expect(planTotals(stray, NOW)).toEqual(base);
  });

  it('an empty plan is all zeros with no division by zero', () => {
    const t = planTotals(wedding({ assignments: [], transactions: [], snapshots: [] }), NOW);
    expect(t).toMatchObject({ budget: 0, spent: 0, remaining: 0, toFund: 0, unassigned: 0, covered: 0, pctSpent: 0 });
  });
});

describe('envelopeFor — toDate running totals', () => {
  it('sums assigned and spending up to the viewed month without changing month figures', () => {
    const S = wedding();
    const aug = envelopeFor(S, '2026-08', NOW);
    const sep = envelopeFor(S, '2026-09', NOW);
    expect(aug.toDate).toEqual({ assigned: 2000000, spent: 0, covered: 0 });
    expect(sep.toDate).toEqual({ assigned: 2577500, spent: 1066500, covered: 0 });
    expect(sep.assignedTotal).toBe(577500); // month-scoped field unchanged
  });
});
