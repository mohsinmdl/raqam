// Budget-impact rules for excluded (recoverable) categories — tests the shared
// calculation core directly, per the feature spec's acceptance scenarios.
import { describe, it, expect } from 'vitest';
import {
  accountBalance, budgetProjection, budgetRollover, budgetSpent, cardOutstanding,
  categorySpending, dailySpending, effectiveBudget, effectsOf, isExcludedCat,
  monthBudgetSpending, monthMetrics, rangeBalances, recoverableSpending, txBudgetImpact, unbudgetedSpend,
} from '../src/lib/calc.js';
import { upsertCategory, setTarget } from '../src/store/actions.js';

const AUG = '2026-08', SEP = '2026-09', JUL = '2026-07';
const GROSS = { includeExcluded: true };

// Minimal store: Rent (normal), Groceries (normal), Household advance (excluded),
// Legacy (no excludeFromBudget field at all — must behave as false).
function makeStore(transactions, overrides) {
  return {
    categories: [
      { id: 'rent', name: 'Rent', type: 'expense', status: 'active', excludeFromBudget: false },
      { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', excludeFromBudget: false },
      { id: 'adv', name: 'Household advance', type: 'expense', status: 'active', excludeFromBudget: true },
      { id: 'legacy', name: 'Legacy cat', type: 'expense', status: 'active' },
      { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
    ],
    budgets: [
      { id: 'b0', category: null, amount: 240000, rollover: false, label: 'Overall' },
      { id: 'b1', category: 'rent', amount: 40000, rollover: false },
      { id: 'b2', category: 'groc', amount: 20000, rollover: true },
    ],
    accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
    cards: [{ id: 'c1', nickname: 'Card', type: 'credit', status: 'active', openingOutstanding: { [AUG]: 0 } }],
    snapshots: [{ accountId: 'a1', month: AUG, amount: 100000, status: 'confirmed' }],
    recurring: [],
    audit: [],
    transactions,
    ...(overrides || {}),
  };
}
const tx = (over) => ({ id: '.', status: 'cleared', date: AUG + '-10T12:00', accountId: 'a1', ...over });

describe('txBudgetImpact', () => {
  const S = makeStore([]);
  it('normal expense counts, excluded expense counts zero', () => {
    expect(txBudgetImpact(S, tx({ type: 'expense', amount: 35000, category: 'rent' }))).toBe(35000);
    expect(txBudgetImpact(S, tx({ type: 'expense', amount: 45386, category: 'adv' }))).toBe(0);
  });
  it('normal refund offsets, excluded refund counts zero', () => {
    expect(txBudgetImpact(S, tx({ type: 'refund', amount: 2000, category: 'groc' }))).toBe(-2000);
    expect(txBudgetImpact(S, tx({ type: 'refund', amount: 20000, category: 'adv' }))).toBe(0);
  });
  it('a category without the field behaves as not excluded', () => {
    expect(isExcludedCat(S, 'legacy')).toBe(false);
    expect(txBudgetImpact(S, tx({ type: 'expense', amount: 500, category: 'legacy' }))).toBe(500);
  });
  it('pending is zero in both views', () => {
    const p = tx({ type: 'expense', amount: 999, category: 'adv', status: 'pending' });
    expect(txBudgetImpact(S, p)).toBe(0);
    expect(txBudgetImpact(S, p, GROSS)).toBe(0);
    expect(txBudgetImpact(S, tx({ type: 'expense', amount: 999, category: 'rent', status: 'pending' }))).toBe(0);
  });
  it('gross view includes excluded expenses and refunds', () => {
    expect(txBudgetImpact(S, tx({ type: 'expense', amount: 45386, category: 'adv' }), GROSS)).toBe(45386);
    expect(txBudgetImpact(S, tx({ type: 'refund', amount: 20000, category: 'adv' }), GROSS)).toBe(-20000);
  });
  it('normal categories are identical in both views', () => {
    const e = tx({ type: 'expense', amount: 35000, category: 'rent' });
    expect(txBudgetImpact(S, e)).toBe(txBudgetImpact(S, e, GROSS));
  });
  it('transfer fees count in both views; income/adjustments never do', () => {
    const tr = tx({ type: 'transfer', amount: 10000, toAccountId: 'a2', fee: 150 });
    expect(txBudgetImpact(S, tr)).toBe(150);
    expect(txBudgetImpact(S, tr, GROSS)).toBe(150);
    expect(txBudgetImpact(S, tx({ type: 'income', amount: 90000, category: 'salary' }))).toBe(0);
    expect(txBudgetImpact(S, tx({ type: 'adjustment', amount: 500 }))).toBe(0);
  });
});

describe('monthBudgetSpending / overall budget', () => {
  it('scenario 1+2: excluded expense and partial refund have zero budget impact', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv' }),
      tx({ id: 't2', type: 'refund', amount: 20000, category: 'adv' }),
      tx({ id: 't3', type: 'expense', amount: 35000, category: 'rent' }),
    ]);
    expect(monthBudgetSpending(S, AUG)).toBe(35000);
    expect(monthBudgetSpending(S, AUG, GROSS)).toBe(35000 + 45386 - 20000);
    expect(budgetSpent(S, S.budgets[0], AUG)).toBe(35000);
  });
  it('identity: equals monthMetrics().expenses when nothing is excluded', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }),
      tx({ id: 't2', type: 'refund', amount: 2000, category: 'groc' }),
      tx({ id: 't3', type: 'transfer', amount: 5000, toAccountId: 'a2', fee: 100 }),
      tx({ id: 't4', type: 'income', amount: 90000, category: 'salary' }),
      tx({ id: 't5', type: 'expense', amount: 300, category: 'rent', status: 'pending' }),
    ]);
    expect(monthBudgetSpending(S, AUG)).toBe(monthMetrics(S, AUG).expenses);
    expect(monthBudgetSpending(S, AUG)).toBe(8000 - 2000 + 100);
  });
  it('scenario 3: cross-month refund — personal view untouched both months, gross view month-scoped', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv', date: AUG + '-10T12:00' }),
      tx({ id: 't2', type: 'refund', amount: 20000, category: 'adv', date: SEP + '-05T12:00' }),
    ]);
    expect(monthBudgetSpending(S, AUG)).toBe(0);
    expect(monthBudgetSpending(S, SEP)).toBe(0);
    expect(monthBudgetSpending(S, AUG, GROSS)).toBe(45386);
    expect(monthBudgetSpending(S, SEP, GROSS)).toBe(-20000);
  });
});

describe('category budgets', () => {
  it('scenario 5: net grocery spending, clamped at zero when refunds exceed', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 8000, category: 'groc' }),
      tx({ id: 't2', type: 'refund', amount: 2000, category: 'groc' }),
    ]);
    expect(budgetSpent(S, S.budgets[2], AUG)).toBe(6000);
    const S2 = makeStore([tx({ id: 't1', type: 'refund', amount: 5000, category: 'groc' })]);
    expect(budgetSpent(S2, S2.budgets[2], AUG)).toBe(0);
  });
  it('rollover recomputes under the same view', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 15000, category: 'groc', date: JUL + '-10T12:00' }),
    ]);
    const groc = S.budgets[2]; // 20000, rollover on
    expect(budgetRollover(S, groc, AUG)).toBe(5000);
    expect(effectiveBudget(S, groc, AUG)).toBe(25000);
    expect(budgetRollover(S, groc, AUG, GROSS)).toBe(5000); // same — no excluded groc spend
    const S3 = makeStore([tx({ id: 't1', type: 'expense', amount: 300000, category: 'groc', date: JUL + '-10T12:00' })]);
    expect(budgetRollover(S3, S3.budgets[2], AUG)).toBe(0); // overspend never carries as debt
  });
  it('overall rollover in personal view ignores excluded spending last month', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 200000, category: 'adv', date: JUL + '-10T12:00' }),
    ], { budgets: [{ id: 'b0', category: null, amount: 240000, rollover: true }] });
    expect(budgetRollover(S, S.budgets[0], AUG)).toBe(240000); // July personal spend = 0
    expect(budgetRollover(S, S.budgets[0], AUG, GROSS)).toBe(40000);
  });
});

describe('unbudgetedSpend / recoverableSpending', () => {
  const S = makeStore([
    tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv' }),
    tx({ id: 't2', type: 'refund', amount: 20000, category: 'adv' }),
    tx({ id: 't3', type: 'expense', amount: 700, category: 'legacy' }),
  ]);
  it('scenario 1: excluded categories never appear under spending-without-a-budget', () => {
    const ids = unbudgetedSpend(S, AUG).map(u => u.id);
    expect(ids).not.toContain('adv');
    expect(ids).toContain('legacy'); // unbudgeted normal cat still listed
  });
  it('paid / returned / outstanding per category, net for the hero note', () => {
    const r = recoverableSpending(S, AUG);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: 'adv', paid: 45386, returned: 20000, outstanding: 25386 });
    expect(r.net).toBe(25386);
  });
  it('outstanding and net never display below zero', () => {
    const S2 = makeStore([tx({ id: 't1', type: 'refund', amount: 9000, category: 'adv' })]);
    const r = recoverableSpending(S2, AUG);
    expect(r.rows[0].outstanding).toBe(0);
    expect(r.net).toBe(0);
  });
  it('quiet months list nothing; pending excluded tx does not create a row', () => {
    const S2 = makeStore([tx({ id: 't1', type: 'expense', amount: 500, category: 'adv', status: 'pending' })]);
    expect(recoverableSpending(S2, AUG).rows).toHaveLength(0);
  });
});

describe('dashboard charts hide recoverable spending (addendum d)', () => {
  const S = makeStore([
    tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv', date: AUG + '-04T12:00' }),
    tx({ id: 't2', type: 'refund', amount: 20000, category: 'adv', date: AUG + '-04T13:00' }),
    tx({ id: 't3', type: 'expense', amount: 8000, category: 'groc', date: AUG + '-04T14:00' }),
    tx({ id: 't4', type: 'expense', amount: 35000, category: 'rent', date: AUG + '-10T12:00' }),
    tx({ id: 't5', type: 'expense', amount: 700, category: 'legacy', date: AUG + '-12T12:00' }),
  ]);
  it('categorySpending skips excluded categories by default, includes with opts (netting refunds)', () => {
    expect(categorySpending(S, AUG).map(x => x.id)).toEqual(['rent', 'groc', 'legacy']);
    const gross = categorySpending(S, AUG, { includeExcluded: true });
    expect(gross.find(x => x.id === 'adv').amt).toBe(25386);
  });
  it('dailySpending skips excluded tx by default, includes with opts', () => {
    const day4 = view => dailySpending(S, AUG, view)[3].amt;
    expect(day4()).toBe(8000);
    expect(day4({ includeExcluded: true })).toBe(8000 + 45386 - 20000);
    expect(dailySpending(S, AUG)[9].amt).toBe(35000); // normal cat unchanged either way
  });
  it('a refund exceeding a day\'s spend clamps the bar to 0 but net keeps it for the total', () => {
    // A recoverable loan out on day 5, repaid on day 7 (a net-negative day). The
    // bar can\'t go negative, but the month total must still net the refund —
    // otherwise the total over-states spending by the whole repayment.
    const S2 = makeStore([
      tx({ id: 'a', type: 'expense', amount: 1000000, category: 'adv', date: AUG + '-05T12:00' }),
      tx({ id: 'b', type: 'refund', amount: 1035000, category: 'adv', date: AUG + '-07T12:00' }),
    ]);
    const days = dailySpending(S2, AUG, { includeExcluded: true });
    const d5 = days.find(d => d.day === 5), d7 = days.find(d => d.day === 7);
    expect(d5.amt).toBe(1000000);  // spike bar (display)
    expect(d7.amt).toBe(0);        // refund day: bar floored to 0
    expect(d7.net).toBe(-1035000); // ...but net preserves the refund
    const totalNet = days.reduce((s, d) => s + d.net, 0);
    const totalBars = days.reduce((s, d) => s + d.amt, 0);
    expect(totalNet).toBe(-35000);    // true net = 1,000,000 − 1,035,000
    expect(totalBars).toBe(1000000);  // summing clamped bars drops the refund (the old bug)
  });
  it('unbudgetedSpend still lists only unbudgeted normal categories (regression)', () => {
    expect(unbudgetedSpend(S, AUG).map(u => u.id)).toEqual(['legacy']);
  });
});

describe('cash layer is untouched by the flag', () => {
  const advExp = tx({ id: 't1', type: 'expense', amount: 45386, category: 'adv' });
  const advRef = tx({ id: 't2', type: 'refund', amount: 20000, category: 'adv' });
  it('scenario 1+2: bank balance moves with excluded expenses and refunds', () => {
    const S = makeStore([advExp, advRef]);
    expect(accountBalance(S.accounts[0], S, AUG)).toBe(100000 - 45386 + 20000);
  });
  it('card outstanding moves with excluded card expenses', () => {
    const S = makeStore([tx({ id: 't1', type: 'expense', amount: 5000, category: 'adv', accountId: undefined, cardId: 'c1' })]);
    expect(cardOutstanding(S.cards[0], S, AUG)).toBe(5000);
  });
  it('effectsOf ignores the exclusion flag entirely', () => {
    expect(effectsOf(advExp)).toEqual([{ kind: 'account', id: 'a1', delta: -45386 }]);
  });
  it('view switching mutates nothing (store deep-frozen)', () => {
    const S = makeStore([advExp, advRef]);
    const freeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(o); };
    freeze(S);
    expect(() => {
      monthBudgetSpending(S, AUG); monthBudgetSpending(S, AUG, GROSS);
      recoverableSpending(S, AUG); unbudgetedSpend(S, AUG);
    }).not.toThrow();
  });
});

describe('projection gating unchanged', () => {
  it('null before day 3 or off-month; straight-line otherwise', () => {
    expect(budgetProjection(AUG, 1000, AUG + '-02T09:00')).toBeNull();
    expect(budgetProjection(JUL, 1000, AUG + '-15T09:00')).toBeNull();
    expect(budgetProjection(AUG, 1000, AUG + '-10T09:00')).toMatchObject({ projected: 3100 });
  });
});

describe('upsertCategory exclusion edits', () => {
  it('turning exclusion on removes the attached budget and audits both changes', () => {
    const S = makeStore([]);
    const next = upsertCategory(S, { form: { editId: 'groc', name: 'Groceries', type: 'expense', icon: 'square', color: '#0F766E', description: '', sortOrder: '99', excludeFromBudget: true } });
    expect(next.categories.find(c => c.id === 'groc').excludeFromBudget).toBe(true);
    expect(next.budgets.find(b => b.category === 'groc')).toBeUndefined();
    expect(next.budgets).toHaveLength(2); // b0 + b1 untouched
    const kinds = next.audit.map(a => a.entityType + ':' + a.action);
    expect(kinds).toContain('budget:delete');
    expect(kinds).toContain('category:update');
    expect(S.budgets).toHaveLength(3); // input store untouched
  });
  it('income categories never store the flag as true', () => {
    const S = makeStore([]);
    const next = upsertCategory(S, { form: { editId: 'salary', name: 'Salary', type: 'income', icon: 'square', color: '#0F766E', description: '', sortOrder: '99', excludeFromBudget: true } });
    expect(next.categories.find(c => c.id === 'salary').excludeFromBudget).toBe(false);
  });
  it('turning exclusion off leaves budgets alone (re-budgeting is manual)', () => {
    const S = makeStore([], { categories: [{ id: 'adv', name: 'Household advance', type: 'expense', status: 'active', excludeFromBudget: true }] });
    const next = upsertCategory(S, { form: { editId: 'adv', name: 'Household advance', type: 'expense', icon: 'square', color: '#0F766E', description: '', sortOrder: '99', excludeFromBudget: false } });
    expect(next.categories.find(c => c.id === 'adv').excludeFromBudget).toBe(false);
    expect(next.budgets).toHaveLength(3);
  });
  it('turning exclusion on via the drawer also clears an existing target (shared helper)', () => {
    const withT = setTarget(makeStore([]), { id: 'groc', amount: 5000, mode: 'refill' });
    const next = upsertCategory(withT, { form: { editId: 'groc', name: 'Groceries', type: 'expense', icon: 'square', color: '#0F766E', description: '', sortOrder: '99', excludeFromBudget: true } });
    const groc = next.categories.find(c => c.id === 'groc');
    expect(groc.targetAmount).toBeUndefined();
    expect(groc.targetMode).toBeUndefined();
    expect(groc.targetDueDay).toBeUndefined();
  });
});

describe('monthMetrics — cleared / uncleared / working', () => {
  it('cleared excludes pending; working = cleared + signed uncleared', () => {
    const S = makeStore([
      tx({ id: 'c1', type: 'expense', amount: 5000, category: 'rent' }),                       // cleared
      tx({ id: 'p1', type: 'expense', amount: 3000, category: 'rent', status: 'pending' }),     // −3000
      tx({ id: 'p2', type: 'income', amount: 1000, category: 'salary', status: 'pending' }),    // +1000
    ]);
    const M = monthMetrics(S, AUG);
    expect(M.totalBank).toBe(95000);   // 100000 opening − 5000 cleared
    expect(M.uncleared).toBe(-2000);   // −3000 + 1000
    expect(M.working).toBe(93000);     // 95000 + (−2000)
  });

  it('uncleared is 0 with nothing pending, so working equals cleared', () => {
    const S = makeStore([tx({ id: 'c1', type: 'expense', amount: 5000, category: 'rent' })]);
    const M = monthMetrics(S, AUG);
    expect(M.uncleared).toBe(0);
    expect(M.working).toBe(M.totalBank);
  });

  it('a pending adjustment carries its own sign into uncleared', () => {
    const S = makeStore([tx({ id: 'p', type: 'adjustment', amount: -2500, status: 'pending' })]);
    expect(monthMetrics(S, AUG).uncleared).toBe(-2500);
  });

  it('splits recoverable advances out of spending; spending + recoverable === expenses (cash), net stays true', () => {
    const S = makeStore([
      tx({ id: 'e1', type: 'expense', amount: 8000, category: 'rent' }),                 // real spending
      tx({ id: 'r1', type: 'refund', amount: 1000, category: 'rent' }),                  // real refund
      tx({ id: 'a1', type: 'expense', amount: 50000, category: 'adv' }),                 // advance out (excluded)
      tx({ id: 'a2', type: 'refund', amount: 20000, category: 'adv' }),                  // advance repaid (excluded)
      tx({ id: 'i1', type: 'income', amount: 100000, category: 'salary' }),
    ]);
    const M = monthMetrics(S, AUG);
    expect(M.recoverable).toBe(30000);          // 50000 advanced − 20000 repaid
    expect(M.spending).toBe(7000);              // 8000 − 1000 real, advances excluded
    expect(M.expenses).toBe(37000);             // cash: 7000 spending + 30000 recoverable
    expect(M.spending + M.recoverable).toBe(M.expenses);
    expect(M.net).toBe(100000 - 37000);         // true cash net, unchanged
    expect(M.income - M.spending - M.recoverable).toBe(M.net); // reconciles on the dashboard
  });

  it('recoverable is 0 when no excluded categories move, so spending === expenses', () => {
    const S = makeStore([tx({ id: 'e1', type: 'expense', amount: 5000, category: 'rent' })]);
    const M = monthMetrics(S, AUG);
    expect(M.recoverable).toBe(0);
    expect(M.spending).toBe(M.expenses);
  });

  it('scopes balance figures to one account when accountId is passed', () => {
    const S = makeStore(
      [
        tx({ id: 'x1', type: 'expense', amount: 5000, accountId: 'a1', category: 'rent' }),                    // a1 cleared −5000
        tx({ id: 'x2', type: 'expense', amount: 2000, accountId: 'a2', category: 'rent' }),                    // a2 cleared −2000
        tx({ id: 'x3', type: 'income', amount: 1000, accountId: 'a2', status: 'pending', category: 'salary' }), // a2 pending +1000
      ],
      {
        accounts: [
          { id: 'a1', nickname: 'Main', status: 'active' },
          { id: 'a2', nickname: 'Side', status: 'active' },
        ],
        snapshots: [
          { accountId: 'a1', month: AUG, amount: 100000, status: 'confirmed' },
          { accountId: 'a2', month: AUG, amount: 50000, status: 'confirmed' },
        ],
      },
    );
    // Whole portfolio: 95000 (a1) + 48000 (a2).
    expect(monthMetrics(S, AUG).totalBank).toBe(143000);
    // Scoped to a2 only.
    const M2 = monthMetrics(S, AUG, undefined, 'a2');
    expect(M2.totalBank).toBe(48000);
    expect(M2.uncleared).toBe(1000);
    expect(M2.working).toBe(49000);
    // Scoped to a1 only — a2's pending income must not leak in.
    const M1 = monthMetrics(S, AUG, undefined, 'a1');
    expect(M1.totalBank).toBe(95000);
    expect(M1.uncleared).toBe(0);
  });
});

describe('rangeBalances — balance figures over a whole-month window', () => {
  // A card payment is a transfer with toCardId and no toAccountId: it leaves
  // the account (cleared → totalBank; pending, plus fee → uncleared) and must
  // never net to zero the way an internal account-to-account transfer does.
  // The uncleared reducer's transfer branch is the only place that decides
  // this, and nothing else in the suite exercised it.
  it('card payments leave the account and never net like an internal transfer', () => {
    const S = makeStore(
      [
        tx({ id: 'cp1', type: 'transfer', amount: 2000, accountId: 'a1', toCardId: 'k1', status: 'cleared', date: AUG + '-05T12:00' }),
        tx({ id: 'cp2', type: 'transfer', amount: 700, fee: 30, accountId: 'a1', toCardId: 'k1', status: 'pending', date: AUG + '-06T12:00' }),
      ],
      {
        accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
        cards: [{ id: 'k1', type: 'credit', status: 'active', openingOutstanding: { [AUG]: 5000 } }],
        snapshots: [{ accountId: 'a1', month: AUG, amount: 100000, status: 'confirmed' }],
      },
    );
    const R = rangeBalances(S, AUG, AUG, AUG + '-15T12:00', 'a1');
    expect(R.totalBank).toBe(98000);
    expect(R.uncleared).toBe(-730);
    expect(R.working).toBe(97270);
    const M = monthMetrics(S, AUG, AUG + '-15T12:00', 'a1');
    expect([M.totalBank, M.uncleared, M.working]).toEqual([R.totalBank, R.uncleared, R.working]);
  });

  const NOW = SEP + '-15T12:00';
  // Two accounts, three months of snapshots. August's a1 snapshot is 90000, NOT
  // the 95000 a July walk would reach — the drift the two-month test relies on.
  const twoMonth = () => makeStore(
    [
      tx({ id: 'j1', type: 'expense', amount: 5000, accountId: 'a1', category: 'rent', date: JUL + '-03T12:00' }),
      tx({ id: 'j2', type: 'income', amount: 20000, accountId: 'a1', category: 'salary', date: JUL + '-20T12:00' }),
      tx({ id: 'j3', type: 'expense', amount: 700, accountId: 'a1', category: 'groc', status: 'pending', date: JUL + '-25T12:00' }),
      tx({ id: 'a1x', type: 'expense', amount: 4000, accountId: 'a1', category: 'rent', date: AUG + '-04T12:00' }),
      tx({ id: 'a2x', type: 'income', amount: 1000, accountId: 'a2', category: 'salary', date: AUG + '-06T12:00' }),
      tx({ id: 'a3x', type: 'transfer', amount: 2500, fee: 50, accountId: 'a1', toAccountId: 'a2', status: 'pending', date: AUG + '-08T12:00' }),
      tx({ id: 'a4x', type: 'adjustment', amount: -150, accountId: 'a1', category: 'rent', status: 'pending', date: AUG + '-09T12:00' }),
      // September: outside a Jul–Aug window, must not leak in.
      tx({ id: 's1', type: 'expense', amount: 99999, accountId: 'a1', category: 'rent', date: SEP + '-02T12:00' }),
    ],
    {
      accounts: [
        { id: 'a1', nickname: 'Main', status: 'active' },
        { id: 'a2', nickname: 'Side', status: 'active' },
      ],
      snapshots: [
        { accountId: 'a1', month: JUL, amount: 80000, status: 'confirmed' },
        { accountId: 'a2', month: JUL, amount: 10000, status: 'confirmed' },
        { accountId: 'a1', month: AUG, amount: 90000, status: 'confirmed' },
        { accountId: 'a2', month: AUG, amount: 10000, status: 'confirmed' },
      ],
    },
  );

  it('single month equals monthMetrics field-by-field (portfolio and scoped)', () => {
    const S = twoMonth();
    for (const acc of [undefined, 'a1', 'a2']) {
      const M = monthMetrics(S, AUG, NOW, acc);
      const R = rangeBalances(S, AUG, AUG, NOW, acc);
      expect(R).toEqual({ opening: M.opening, totalBank: M.totalBank, uncleared: M.uncleared, working: M.working });
    }
  });

  it('single month, scoped: cleared / uncleared / working (uncleared mirrors accountDelta rules)', () => {
    const R = rangeBalances(twoMonth(), AUG, AUG, NOW, 'a1');
    expect(R.opening).toBe(90000);
    expect(R.totalBank).toBe(86000);            // 90000 − 4000; pending rows step 0
    expect(R.uncleared).toBe(-2550 - 150);      // transfer out + fee, signed adjustment
    expect(R.working).toBe(R.totalBank + R.uncleared);
  });

  it('two months: opening(first month) + every delta across both; the intermediate snapshot is ignored', () => {
    const R = rangeBalances(twoMonth(), JUL, AUG, NOW, 'a1');
    expect(R.opening).toBe(80000);              // July's snapshot, not August's 90000
    // 80000 − 5000 + 20000 (July; pending steps 0) − 4000 (August) — the Sep row is out.
    expect(R.totalBank).toBe(91000);
    // July's pending expense joins August's pending transfer + adjustment.
    expect(R.uncleared).toBe(-700 - 2550 - 150);
    expect(R.working).toBe(91000 - 3400);
    // The seam: the walked July→August figure (91000) is what a continuous
    // ledger prints, while August's own snapshot restates it as 90000.
    expect(R.totalBank).not.toBe(rangeBalances(twoMonth(), AUG, AUG, NOW, 'a1').opening + (-4000));
  });

  it('two months, portfolio-wide: both accounts, pending transfer nets to just the fee', () => {
    const R = rangeBalances(twoMonth(), JUL, AUG, NOW);
    expect(R.opening).toBe(90000);              // 80000 + 10000 (July)
    expect(R.totalBank).toBe(90000 - 5000 + 20000 - 4000 + 1000);
    expect(R.uncleared).toBe(-700 - 50 - 150);  // internal transfer cancels, fee remains
  });

  it('a first month with no snapshot seeds from 0 (callers gate on balanceRange)', () => {
    const R = rangeBalances(twoMonth(), '2026-06', JUL, NOW, 'a1');
    expect(R.opening).toBe(0);
    expect(R.totalBank).toBe(-5000 + 20000);
  });
});
