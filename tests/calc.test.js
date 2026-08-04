// Budget-impact rules for excluded (recoverable) categories — tests the shared
// calculation core directly, per the feature spec's acceptance scenarios.
import { describe, it, expect } from 'vitest';
import {
  accountBalance, budgetProjection, budgetRollover, budgetSpent, cardOutstanding,
  effectiveBudget, effectsOf, isExcludedCat, monthBudgetSpending, monthMetrics,
  recoverableSpending, txBudgetImpact, unbudgetedSpend,
} from '../src/lib/calc.js';
import { upsertCategory } from '../src/store/actions.js';

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
});
