import { describe, it, expect } from 'vitest';
import {
  accountBalance, accountDelta, budgetSpent, cardDelta, cardOutstanding,
  categorySpending, dailySpending, hasOccurred, monthMetrics, recoverableSpending,
} from '../src/lib/calc.js';
import { rolloverMonth } from '../src/store/actions.js';
import { addMonths, currentMonth } from '../src/lib/dates.js';

const NOW = '2026-08-06T10:00';

// Two expenses in the same month: one already spent, one dated later in August.
// The later one is what used to move today's balance before it happened.
const past = { id: 'past', date: '2026-08-02T09:00', type: 'expense', amount: 1000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Shop' };
const ahead = { id: 'ahead', date: '2026-08-30T09:00', type: 'expense', amount: 5000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Rent' };

const store = over => ({
  institutions: [], cardProducts: [],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'adv', name: 'Advance', type: 'expense', status: 'active', excludeFromBudget: true },
  ],
  accounts: [{ id: 'a1', nickname: 'Main', type: 'Current', status: 'active' }],
  cards: [], budgets: [], recurring: [], audit: [],
  snapshots: [{ accountId: 'a1', month: '2026-08', amount: 100000, status: 'confirmed' }],
  transactions: [past, ahead],
  ...(over || {}),
});

describe('hasOccurred', () => {
  it('is true for anything at or before now', () => {
    expect(hasOccurred(past, NOW)).toBe(true);
    expect(hasOccurred({ date: NOW }, NOW)).toBe(true);
  });
  it('is false for a date still ahead', () => expect(hasOccurred(ahead, NOW)).toBe(false));
  it('counts everything when no now is given — the safe default', () => {
    expect(hasOccurred(ahead, undefined)).toBe(true);
    expect(hasOccurred(ahead, null)).toBe(true);
  });
});

describe('accountDelta', () => {
  it('ignores a transaction dated ahead of now', () => {
    expect(accountDelta(ahead, 'a1', NOW)).toBe(0);
    expect(accountDelta(past, 'a1', NOW)).toBe(-1000);
  });
  it('still counts it when no now is passed', () => expect(accountDelta(ahead, 'a1')).toBe(-5000));
  it('guards transfers from both sides', () => {
    const tr = { id: 'x', date: '2026-08-30T09:00', type: 'transfer', amount: 700, fee: 50, status: 'cleared', accountId: 'a1', toAccountId: 'a2' };
    expect(accountDelta(tr, 'a1', NOW)).toBe(0);
    expect(accountDelta(tr, 'a2', NOW)).toBe(0);
    expect(accountDelta(tr, 'a1')).toBe(-750);
    expect(accountDelta(tr, 'a2')).toBe(700);
  });
  it('leaves pending alone — that guard already existed', () => {
    expect(accountDelta({ ...past, status: 'pending' }, 'a1', NOW)).toBe(0);
  });
});

describe('cardDelta', () => {
  const cardAhead = { id: 'c', date: '2026-08-30T09:00', type: 'expense', amount: 2000, status: 'cleared', cardId: 'k1' };
  it('ignores a card charge dated ahead', () => expect(cardDelta(cardAhead, 'k1', NOW)).toBe(0));
  it('counts it once the date arrives', () => expect(cardDelta(cardAhead, 'k1', '2026-09-01T10:00')).toBe(2000));

  it('keeps the outstanding figure off the card until then', () => {
    const S = store({
      cards: [{ id: 'k1', type: 'credit', nickname: 'Plat', last4: '1111', status: 'active', openingOutstanding: { '2026-08': 3000 } }],
      transactions: [cardAhead],
    });
    expect(cardOutstanding(S.cards[0], S, '2026-08', NOW)).toBe(3000);
    expect(cardOutstanding(S.cards[0], S, '2026-08')).toBe(5000);
  });
});

describe('the balance a user actually sees', () => {
  it('excludes money that has not left yet', () => {
    expect(accountBalance(store().accounts[0], store(), '2026-08', NOW)).toBe(99000);
  });
  it('is what the old behaviour got wrong', () => {
    expect(accountBalance(store().accounts[0], store(), '2026-08')).toBe(94000);
  });
  it('picks the amount up once its date arrives', () => {
    expect(accountBalance(store().accounts[0], store(), '2026-08', '2026-08-31T10:00')).toBe(94000);
  });
});

describe('the dashboard agrees with the balance', () => {
  // A half-fix would have been worse than none: the balance excluding the
  // future expense while "expenses this month" still counted it.
  it('leaves a future expense out of expenses, net and category spending alike', () => {
    const M = monthMetrics(store(), '2026-08', NOW);
    expect(M.expenses).toBe(1000);
    expect(M.totalBank).toBe(99000);
    expect(categorySpending(store(), '2026-08', null, NOW).find(c => c.id === 'groc').amt).toBe(1000);
    expect(dailySpending(store(), '2026-08', null, NOW).find(d => d.day === 30).amt).toBe(0);
  });
  it('counts all of it without a now, exactly as before', () => {
    expect(monthMetrics(store(), '2026-08').expenses).toBe(6000);
  });
  it('keeps budgets in step', () => {
    const b = { id: 'b1', category: 'groc', amount: 20000 };
    expect(budgetSpent(store(), b, '2026-08', null, NOW)).toBe(1000);
    expect(budgetSpent(store(), b, '2026-08')).toBe(6000);
  });
  it('keeps recoverable spending in step', () => {
    const S = store({ transactions: [{ ...ahead, category: 'adv' }] });
    expect(recoverableSpending(S, '2026-08', NOW).paid).toBe(0);
    expect(recoverableSpending(S, '2026-08').paid).toBe(5000);
  });
});

describe('the month rollover keeps the whole month', () => {
  // rolloverMonth freezes a month's closing balance as the next month's opening
  // snapshot, and nothing ever recomputes it — so it is deliberately left
  // unguarded. It always rolls the month before the current one, which is
  // entirely in the past, so today the guarded and unguarded figures coincide;
  // the point of the test is that the snapshot does not depend on that.
  const month = currentMonth(), prev = addMonths(month, -1);
  const inPrev = d => prev + '-' + d + 'T09:00';
  const prevStore = () => store({
    snapshots: [{ accountId: 'a1', month: prev, amount: 100000, status: 'confirmed' }],
    transactions: [
      { id: 'p1', date: inPrev('02'), type: 'expense', amount: 1000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Shop' },
      { id: 'p2', date: inPrev('26'), type: 'expense', amount: 5000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Rent' },
    ],
  });

  it('seeds the opening from the previous month\u2019s complete closing balance', () => {
    const next = rolloverMonth(prevStore());
    const opening = next.snapshots.find(s => s.month === month && s.accountId === 'a1');
    expect(opening).toBeDefined();
    expect(opening.amount).toBe(94000);
  });

  it('matches the unguarded balance, which is what a snapshot must mean', () => {
    const S = prevStore();
    const next = rolloverMonth(S);
    const opening = next.snapshots.find(s => s.month === month && s.accountId === 'a1');
    expect(opening.amount).toBe(accountBalance(S.accounts[0], S, prev));
  });

  // The rollover seeds by presence, but the previous month keeps being edited
  // after the clock turns. Until the user confirms it, the pending opening must
  // follow those edits — the alternative is a frozen figure that silently
  // disagrees with the previous month's real closing (the Meezan drift).
  const openingOf = (S) => S.snapshots.find(s => s.month === month && s.accountId === 'a1');

  it('recomputes a pending opening when the previous month is edited before confirmation', () => {
    const rolled = rolloverMonth(prevStore());
    expect(openingOf(rolled).amount).toBe(94000);
    const late = { id: 'p3', date: inPrev('28'), type: 'income', amount: 250000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Salary' };
    const edited = { ...rolled, transactions: [late, ...rolled.transactions] };
    const again = rolloverMonth(edited);
    expect(again).not.toBe(edited);
    expect(openingOf(again).status).toBe('pending');
    expect(openingOf(again).amount).toBe(accountBalance(edited.accounts[0], edited, prev));
    expect(openingOf(again).amount).toBe(344000);
  });

  it('follows a transaction moved out of the previous month too', () => {
    const rolled = rolloverMonth(prevStore());
    const moved = { ...rolled, transactions: rolled.transactions.map(t => (t.id === 'p2' ? { ...t, date: month + '-01T09:00' } : t)) };
    expect(openingOf(rolloverMonth(moved)).amount).toBe(99000);
  });

  it('leaves a confirmed opening alone', () => {
    const rolled = rolloverMonth(prevStore());
    const confirmed = { ...rolled, snapshots: rolled.snapshots.map(s => (s.month === month ? { ...s, status: 'confirmed', confirmedAt: prev + '-31T10:00' } : s)) };
    const late = { id: 'p3', date: inPrev('28'), type: 'income', amount: 250000, status: 'cleared', accountId: 'a1', category: 'groc', merchant: 'Salary' };
    const edited = { ...confirmed, transactions: [late, ...confirmed.transactions] };
    expect(rolloverMonth(edited)).toBe(edited);
    expect(openingOf(edited).amount).toBe(94000);
  });

  it('leaves a brand-new account\u2019s pending alone (no earlier snapshot to carry from)', () => {
    // Typed opening for an account added this month; the previous-month rows
    // belong to it only by accident of the fixture and must not re-derive it.
    const S = store({ snapshots: [{ accountId: 'a1', month, amount: 5000, status: 'pending' }], transactions: prevStore().transactions });
    expect(rolloverMonth(S)).toBe(S);
    expect(openingOf(S).amount).toBe(5000);
  });

  it('is an identity no-op once nothing has changed since the last pass', () => {
    const rolled = rolloverMonth(prevStore());
    expect(rolloverMonth(rolled)).toBe(rolled);
  });
});
