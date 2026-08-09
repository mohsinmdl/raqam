// tests/inspector.test.js
import { describe, it, expect } from 'vitest';
import { envelopeFor } from '../src/lib/envelope.js';
import {
  trailingMonths, assignedIn, selectionSummary, underfundedFor,
  autoAssignPlan, autoAssignAmount,
} from '../src/lib/inspector.js';

const NOW = '2026-08-09T12:00:00.000Z';
const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', groupId: 'g1' },
  ],
  assignments: [
    { id: 'a1', category: 'groc', month: '2026-08', amount: 5000 },
    { id: 'a2', category: 'groc', month: '2026-07', amount: 4000 },
    { id: 'a3', category: 'groc', month: '2026-06', amount: 2000 },
    { id: 'a4', category: 'fuel', month: '2026-08', amount: 1000 },
  ],
  transactions: [
    { id: 't1', type: 'expense', category: 'groc', amount: 1500, date: '2026-08-05', status: 'confirmed', accountId: 'acc' },
    { id: 't2', type: 'expense', category: 'fuel', amount: 2500, date: '2026-08-04', status: 'confirmed', accountId: 'acc' },
    { id: 't3', type: 'expense', category: 'groc', amount: 900, date: '2026-07-10', status: 'confirmed', accountId: 'acc' },
  ],
  accounts: [{ id: 'acc', nickname: 'Cash', type: 'Current', status: 'active', instId: 'i1' }],
  snapshots: [{ id: 's1', accountId: 'acc', month: '2026-06', balance: 100000, status: 'confirmed' }],
  budgets: [], cards: [], recurring: [], audit: [],
  ...(over || {}),
});
const ctxFor = S => {
  const cache = new Map();
  const envAt = m => { if (!cache.has(m)) cache.set(m, envelopeFor(S, m, NOW)); return cache.get(m); };
  return { S, month: '2026-08', env: envAt('2026-08'), envAt };
};

describe('trailingMonths', () => {
  it('lists the n previous months, newest first, across a year boundary', () => {
    expect(trailingMonths('2026-08', 3)).toEqual(['2026-07', '2026-06', '2026-05']);
    expect(trailingMonths('2026-01', 2)).toEqual(['2025-12', '2025-11']);
  });
});

describe('assignedIn', () => {
  it('reads the assignment for cat+month, 0 when absent', () => {
    const S = store();
    expect(assignedIn(S, 'groc', '2026-07')).toBe(4000);
    expect(assignedIn(S, 'fuel', '2026-07')).toBe(0);
  });
});

describe('selectionSummary / underfundedFor', () => {
  it('sums envelope rows over the given cats', () => {
    const { env } = ctxFor(store());
    const sum = selectionSummary(env, ['groc', 'fuel']);
    const g = env.rows.get('groc'), f = env.rows.get('fuel');
    expect(sum.assigned).toBe(g.assigned + f.assigned);
    expect(sum.available).toBe(g.available + f.available);
    expect(sum.activity).toBe(g.activity + f.activity);
    expect(sum.carryIn).toBe(g.carryIn + f.carryIn);
  });
  it('underfunded counts only negative availables', () => {
    const { env } = ctxFor(store());
    // fuel: assigned 1000, spent 2500 → available −1500
    expect(env.rows.get('fuel').available).toBe(-1500);
    expect(underfundedFor(env, ['groc', 'fuel'])).toBe(1500);
    expect(underfundedFor(env, ['groc'])).toBe(0);
  });
  it('underfunded prefers target need over overspending for a targeted cat', () => {
    const S = store({ categories: [
      { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'rent', name: 'Rent', type: 'expense', status: 'active', groupId: 'g1', targetAmount: 20000, targetMode: 'refill', excludeFromBudget: false },
    ], assignments: [
      { id: 'a1', category: 'groc', month: '2026-08', amount: 5000 },
      { id: 'a4', category: 'fuel', month: '2026-08', amount: 1000 },
      { id: 'a5', category: 'rent', month: '2026-08', amount: 12000 },
    ] });
    const ctx = ctxFor(S);
    // rent: assigned 12000, no activity → available 12000; target 20000 refill → need 8000
    expect(ctx.env.rows.get('rent').available).toBe(12000);
    expect(underfundedFor(ctx.env, ['rent'], S)).toBe(8000);
    expect(autoAssignPlan('underfunded', ['rent'], ctx))
      .toEqual([{ from: 'rta', to: 'rent', month: '2026-08', amount: 8000 }]);
    expect(autoAssignAmount('underfunded', ['rent'], ctx)).toBe(8000);
  });
});

describe('autoAssignPlan', () => {
  it('assignedLastMonth: delta up through rta→cat, delta down through cat→rta', () => {
    const ctx = ctxFor(store());
    // groc assigned Aug 5000, Jul 4000 → target 4000, delta −1000
    expect(autoAssignPlan('assignedLastMonth', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 1000 }]);
    expect(autoAssignAmount('assignedLastMonth', ['groc'], ctx)).toBe(4000);
    // fuel Jul assigned 0, Aug 1000 → delta −1000
    expect(autoAssignPlan('assignedLastMonth', ['fuel'], ctx))
      .toEqual([{ from: 'fuel', to: 'rta', month: '2026-08', amount: 1000 }]);
  });
  it('spentLastMonth: target is last month outflow, floored at 0', () => {
    const ctx = ctxFor(store());
    // groc spent 900 in Jul; assigned Aug 5000 → delta −4100
    expect(autoAssignPlan('spentLastMonth', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 4100 }]);
    expect(autoAssignAmount('spentLastMonth', ['groc'], ctx)).toBe(900);
  });
  it('avgAssigned: mean of prior 3 months, empty months count as 0', () => {
    const ctx = ctxFor(store());
    // groc: Jul 4000 + Jun 2000 + May 0 → avg 2000; current 5000 → delta −3000
    expect(autoAssignAmount('avgAssigned', ['groc'], ctx)).toBe(2000);
    expect(autoAssignPlan('avgAssigned', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 3000 }]);
  });
  it('avgSpent: mean of prior 3 months of outflow', () => {
    const ctx = ctxFor(store());
    // groc outflow: Jul 900, Jun 0, May 0 → avg 300; current assigned 5000 → delta −4700
    expect(autoAssignAmount('avgSpent', ['groc'], ctx)).toBe(300);
    expect(autoAssignPlan('avgSpent', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 4700 }]);
  });
  it('resetAvailable: positive available moves to rta, negative covers from rta', () => {
    const ctx = ctxFor(store());
    // groc carries over: Jun avail 2000 → Jul 2000+4000−900=5100 → Aug
    // carryIn 5100 + assigned 5000 − spent 1500 = available 8600 → cat→rta 8600
    expect(autoAssignPlan('resetAvailable', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 8600 }]);
    // fuel available −1500 → rta→cat 1500
    expect(autoAssignPlan('resetAvailable', ['fuel'], ctx))
      .toEqual([{ from: 'rta', to: 'fuel', month: '2026-08', amount: 1500 }]);
  });
  it('resetAssigned zeroes assigned in the right direction and skips at 0', () => {
    const ctx = ctxFor(store());
    expect(autoAssignPlan('resetAssigned', ['groc'], ctx))
      .toEqual([{ from: 'groc', to: 'rta', month: '2026-08', amount: 5000 }]);
    const S2 = store({ assignments: [] });
    expect(autoAssignPlan('resetAssigned', ['groc'], ctxFor(S2))).toEqual([]);
  });
  it('underfunded covers each overspent cat from rta', () => {
    const ctx = ctxFor(store());
    expect(autoAssignPlan('underfunded', ['groc', 'fuel'], ctx))
      .toEqual([{ from: 'rta', to: 'fuel', month: '2026-08', amount: 1500 }]);
    expect(autoAssignAmount('underfunded', ['groc', 'fuel'], ctx)).toBe(1500);
  });
  it('already-at-target produces an empty plan', () => {
    const S = store({ assignments: [
      { id: 'a1', category: 'groc', month: '2026-08', amount: 4000 },
      { id: 'a2', category: 'groc', month: '2026-07', amount: 4000 },
    ] });
    expect(autoAssignPlan('assignedLastMonth', ['groc'], ctxFor(S))).toEqual([]);
  });
});

describe('mean3 rounding (Math.round, not Math.trunc/floor)', () => {
  it('rounds a non-exact 3-month average', () => {
    const S = store({ assignments: [
      { id: 'a1', category: 'groc', month: '2026-07', amount: 3000 },
      { id: 'a2', category: 'groc', month: '2026-06', amount: 2500 },
      { id: 'a3', category: 'groc', month: '2026-05', amount: 1500 },
    ] });
    // (3000 + 2500 + 1500) / 3 = 2333.333... -> 2333
    expect(autoAssignAmount('avgAssigned', ['groc'], ctxFor(S))).toBe(2333);
  });
  it('rounds a .5 average up — locks round-half-up specifically', () => {
    const S = store({ transactions: [
      { id: 't1', type: 'expense', category: 'groc', amount: 1.5, date: '2026-07-05', status: 'confirmed', accountId: 'acc' },
    ] });
    // spent: Jul 1.5, Jun 0, May 0 -> (1.5 + 0 + 0) / 3 = 0.5 -> rounds to 1.
    // A regression to Math.trunc/Math.floor would wrongly give 0.
    expect(autoAssignAmount('avgSpent', ['groc'], ctxFor(S))).toBe(1);
  });
});

describe('AUTO_ASSIGN_KINDS validation', () => {
  it('an unknown kind throws even with an empty selection', () => {
    const ctx = ctxFor(store());
    expect(() => autoAssignAmount('bogus', ['groc'], ctx)).toThrow(/unknown auto-assign kind/);
    expect(() => autoAssignAmount('bogus', [], ctx)).toThrow(/unknown auto-assign kind/);
    expect(() => autoAssignPlan('bogus', ['groc'], ctx)).toThrow(/unknown auto-assign kind/);
    expect(() => autoAssignPlan('bogus', [], ctx)).toThrow(/unknown auto-assign kind/);
  });
});

describe('ctx guard', () => {
  it('throws when ctx is missing a required field (envAt)', () => {
    const ctx = ctxFor(store());
    expect(() => autoAssignPlan('resetAssigned', ['groc'], { S: ctx.S, month: ctx.month, env: ctx.env }))
      .toThrow(/ctx/);
  });
});

describe('empty catIds', () => {
  it('summary and underfunded are zero; plan is empty', () => {
    const ctx = ctxFor(store());
    expect(selectionSummary(ctx.env, [])).toEqual({ carryIn: 0, assigned: 0, activity: 0, available: 0 });
    expect(underfundedFor(ctx.env, [])).toBe(0);
    expect(autoAssignPlan('underfunded', [], ctx)).toEqual([]);
  });
});

describe('category absent from env.rows', () => {
  it('falls back to a zero row instead of throwing', () => {
    const ctx = ctxFor(store());
    expect(ctx.env.rows.has('ghost')).toBe(false);
    expect(() => underfundedFor(ctx.env, ['ghost'])).not.toThrow();
    expect(underfundedFor(ctx.env, ['ghost'])).toBe(0);
    expect(selectionSummary(ctx.env, ['ghost'])).toEqual({ carryIn: 0, assigned: 0, activity: 0, available: 0 });
    expect(autoAssignAmount('resetAvailable', ['ghost'], ctx)).toBe(0);
    expect(autoAssignPlan('resetAvailable', ['ghost'], ctx)).toEqual([]);
  });
});

describe('resetAvailable at exactly zero', () => {
  it('emits no move when available is already 0', () => {
    const S = store({ categories: [
      { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active', groupId: 'g1' },
      { id: 'idle', name: 'Idle', type: 'expense', status: 'active', groupId: 'g1' },
    ] });
    const ctx = ctxFor(S);
    expect(ctx.env.rows.get('idle').available).toBe(0);
    expect(autoAssignPlan('resetAvailable', ['idle'], ctx)).toEqual([]);
  });
});

describe('avgAssigned with a negative prior-month assigned amount', () => {
  it('includes the negative row in the average (sources may go negative — see tests/move-assigned.test.js)', () => {
    const S = store({ assignments: [
      { id: 'a1', category: 'groc', month: '2026-07', amount: -1000 },
      { id: 'a2', category: 'groc', month: '2026-06', amount: 4000 },
      { id: 'a3', category: 'groc', month: '2026-05', amount: 2000 },
    ] });
    // (-1000 + 4000 + 2000) / 3 = 1666.666... -> 1667
    expect(autoAssignAmount('avgAssigned', ['groc'], ctxFor(S))).toBe(1667);
  });
});
