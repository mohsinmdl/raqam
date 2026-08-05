import { describe, it, expect } from 'vitest';
import {
  addTransaction, updateTransaction, upsertRule, deleteRule, toggleRulePause,
  skipOccurrence, rolloverMonth, ruleFromTx,
} from '../src/store/actions.js';
import { todayStr } from '../src/lib/dates.js';

const rule = over => ({
  id: 'r1', name: 'Rent', type: 'expense', amount: 35000, estimated: false,
  schedule: { every: 1, unit: 'month', days: [5], ends: { kind: 'never' } },
  nextDate: '2026-08-05', category: 'rent', accountId: 'a1',
  status: 'active', autoPost: false, occurrences: [], ...(over || {}),
});
const store = over => ({
  institutions: [], cardProducts: [],
  categories: [
    { id: 'rent', name: 'Rent', type: 'expense', status: 'active' },
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
  ],
  accounts: [{ id: 'a1', nickname: 'Main', type: 'Current', status: 'active' }],
  cards: [{ id: 'c1', nickname: 'Visa', type: 'credit', status: 'active' }],
  snapshots: [], transactions: [], budgets: [], recurring: [rule()], audit: [],
  ...(over || {}),
});
// A validated addTx form, as the drawer would submit it.
const txForm = over => ({
  date: '2026-08-05', time: '12:00', merchant: 'Landlord', notes: '',
  category: 'rent', payWith: 'acc:a1', account: 'a1', repeat: 'never', ...(over || {}),
});
const add = (s, f, type = 'expense', amt = 35000) => addTransaction(s, { form: f, type, amt, fee: 0 });

describe('recording an occurrence', () => {
  it('logs the occurrence against its due date and advances the rule', () => {
    const s = add(store(), txForm({ fromRecurring: 'r1', recurringDue: '2026-08-05' }));
    const r = s.recurring[0];
    expect(r.occurrences).toHaveLength(1);
    expect(r.occurrences[0]).toMatchObject({ due: '2026-08-05', outcome: 'recorded', amount: 35000 });
    expect(r.occurrences[0].txId).toBe(s.transactions[0].id);
    expect(r.nextDate).toBe('2026-09-05');
  });

  it('is idempotent per due date', () => {
    const once = add(store(), txForm({ fromRecurring: 'r1', recurringDue: '2026-08-05' }));
    const twice = add(once, txForm({ fromRecurring: 'r1', recurringDue: '2026-08-05' }));
    expect(twice.recurring[0].occurrences).toHaveLength(1);
    expect(twice.recurring[0].nextDate).toBe('2026-09-05'); // did not advance again
    expect(twice.transactions).toHaveLength(2);             // but the transaction was still recorded
  });

  it('falls back to the rule nextDate when the form carries no due date', () => {
    const s = add(store(), txForm({ fromRecurring: 'r1' }));
    expect(s.recurring[0].occurrences[0].due).toBe('2026-08-05');
    expect(s.recurring[0].nextDate).toBe('2026-09-05');
  });

  it('back-filling an older due date does not drag the schedule backwards', () => {
    const s = add(store(), txForm({ fromRecurring: 'r1', recurringDue: '2026-06-05' }));
    expect(s.recurring[0].occurrences[0].due).toBe('2026-06-05');
    expect(s.recurring[0].nextDate).toBe('2026-08-05'); // unchanged
  });

  it('ignores an unknown rule id', () => {
    const s = add(store(), txForm({ fromRecurring: 'nope' }));
    expect(s.recurring[0].occurrences).toHaveLength(0);
    expect(s.transactions).toHaveLength(1);
  });

  it('leaves no doneThisMonth flag behind', () => {
    const s = add(store(), txForm({ fromRecurring: 'r1' }));
    expect(s.recurring[0].doneThisMonth).toBeUndefined();
  });
});

describe('Repeat preset on a transaction', () => {
  it('creates a rule that continues the series', () => {
    const s = add(store({ recurring: [] }), txForm({ repeat: 'monthly' }));
    expect(s.recurring).toHaveLength(1);
    const r = s.recurring[0];
    expect(r).toMatchObject({ name: 'Landlord', type: 'expense', amount: 35000, category: 'rent', accountId: 'a1', status: 'active', autoPost: false, estimated: false });
    expect(r.schedule).toMatchObject({ every: 1, unit: 'month', days: [5] });
    expect(r.nextDate).toBe('2026-09-05'); // the transaction itself covers 5 Aug
    // The transaction is the first thing the series did, so it opens the history.
    expect(r.occurrences).toHaveLength(1);
    expect(r.occurrences[0]).toMatchObject({ due: '2026-08-05', outcome: 'recorded', amount: 35000, txId: s.transactions[0].id });
  });

  it('handles a preset that needs two firings a period', () => {
    const s = add(store({ recurring: [] }), txForm({ repeat: 'twice-monthly' }));
    expect(s.recurring[0].schedule.days).toEqual([5, 20]);
    expect(s.recurring[0].nextDate).toBe('2026-08-20');
  });

  it('creates nothing for Never', () => {
    expect(add(store({ recurring: [] }), txForm()).recurring).toHaveLength(0);
  });

  it('creates nothing when recording an existing rule', () => {
    const s = add(store(), txForm({ repeat: 'monthly', fromRecurring: 'r1' }));
    expect(s.recurring).toHaveLength(1);
  });

  it('names the rule after the category when there is no merchant', () => {
    const s = add(store({ recurring: [] }), txForm({ repeat: 'monthly', merchant: '' }));
    expect(s.recurring[0].name).toBe('Rent');
  });

  it('funds the rule from a card when the transaction was', () => {
    const s = add(store({ recurring: [] }), txForm({ repeat: 'monthly', payWith: 'card:c1', account: undefined }));
    expect(s.recurring[0].cardId).toBe('c1');
    expect(s.recurring[0].accountId).toBeUndefined();
  });

  it('writes its own audit row', () => {
    const s = add(store({ recurring: [] }), txForm({ repeat: 'monthly' }));
    expect(s.audit.filter(a => a.entityType === 'recurring' && a.action === 'create')).toHaveLength(1);
  });
});

describe('upsertRule', () => {
  const form = over => ({
    name: 'Gym', type: 'expense', every: '3', unit: 'month',
    dayRules: [{ kind: 'last' }], nextDate: '2026-09-30', category: 'rent',
    source: 'acc:a1', estimated: false, autoPost: false,
    endsKind: 'never', endsCount: '', endsDate: '', ...(over || {}),
  });

  it('creates a rule with an empty history', () => {
    const s = upsertRule(store({ recurring: [] }), { form: form(), amt: 5000 });
    expect(s.recurring).toHaveLength(1);
    expect(s.recurring[0]).toMatchObject({ name: 'Gym', amount: 5000, accountId: 'a1', status: 'active', occurrences: [] });
    expect(s.recurring[0].schedule).toMatchObject({ every: 3, unit: 'month', days: ['last'] });
    expect(s.audit[0]).toMatchObject({ entityType: 'recurring', action: 'create' });
  });

  it('stores an end condition', () => {
    const s = upsertRule(store({ recurring: [] }), { form: form({ endsKind: 'count', endsCount: '6' }), amt: 5000 });
    expect(s.recurring[0].schedule.ends).toEqual({ kind: 'count', count: 6 });
  });

  it('keeps history on edit and audits the field diff', () => {
    const base = store({ recurring: [rule({ occurrences: [{ due: '2026-07-05', outcome: 'recorded', amount: 1, txId: 't1', at: 'x' }] })] });
    const s = upsertRule(base, { form: form({ editId: 'r1', name: 'Rent raised' }), amt: 40000 });
    expect(s.recurring[0].occurrences).toHaveLength(1);
    expect(s.recurring[0].editCount).toBe(1);
    expect(s.audit[0].action).toBe('update');
    expect(Object.keys(s.audit[0].after)).toEqual(expect.arrayContaining(['name', 'amount', 'schedule']));
  });

  it('clears the old funding source when it changes', () => {
    const s = upsertRule(store(), { form: form({ editId: 'r1', source: 'card:c1' }), amt: 100 });
    expect(s.recurring[0].cardId).toBe('c1');
    expect(s.recurring[0].accountId).toBeUndefined();
  });

  it('ignores an unknown edit id', () => {
    const base = store();
    expect(upsertRule(base, { form: form({ editId: 'nope' }), amt: 1 })).toBe(base);
  });
});

describe('skipOccurrence', () => {
  it('advances without writing a transaction', () => {
    const s = skipOccurrence(store(), { id: 'r1', due: '2026-08-05' });
    expect(s.transactions).toHaveLength(0);
    expect(s.recurring[0].occurrences[0]).toMatchObject({ due: '2026-08-05', outcome: 'skipped', amount: null, txId: null });
    expect(s.recurring[0].nextDate).toBe('2026-09-05');
    expect(s.audit[0]).toMatchObject({ entityType: 'recurring', action: 'skip' });
  });

  it('is idempotent per due date', () => {
    const once = skipOccurrence(store(), { id: 'r1', due: '2026-08-05' });
    expect(skipOccurrence(once, { id: 'r1', due: '2026-08-05' })).toBe(once);
  });

  it('ignores an unknown rule', () => {
    const base = store();
    expect(skipOccurrence(base, { id: 'nope', due: '2026-08-05' })).toBe(base);
  });
});

describe('pause and delete', () => {
  it('flips pause and back', () => {
    const paused = toggleRulePause(store(), { id: 'r1' });
    expect(paused.recurring[0].status).toBe('paused');
    expect(toggleRulePause(paused, { id: 'r1' }).recurring[0].status).toBe('active');
    expect(paused.audit[0].summary).toBe('Rule paused');
  });

  it('deleting a rule leaves its transactions alone', () => {
    const withTx = add(store(), txForm({ fromRecurring: 'r1' }));
    const s = deleteRule(withTx, { id: 'r1' });
    expect(s.recurring).toHaveLength(0);
    expect(s.transactions).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'recurring', action: 'delete' });
  });

  it('ignores an unknown rule', () => {
    const base = store();
    expect(deleteRule(base, { id: 'nope' })).toBe(base);
    expect(toggleRulePause(base, { id: 'nope' })).toBe(base);
  });
});

describe('rolloverMonth', () => {
  it('leaves a past-due rule overdue rather than advancing it', () => {
    const s = rolloverMonth(store({ accounts: [], recurring: [rule({ nextDate: '2020-01-05' })] }));
    expect(s.recurring[0].nextDate).toBe('2020-01-05');
  });

  it('re-materialises a rule that lost its next date', () => {
    const s = rolloverMonth(store({ accounts: [], recurring: [rule({ nextDate: null })] }));
    expect(s.recurring[0].nextDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.recurring[0].nextDate >= todayStr()).toBe(true);
  });

  it('does nothing at all when there is nothing to do', () => {
    const base = store({ accounts: [] });
    expect(rolloverMonth(base)).toBe(base);
  });
});

describe('immutability', () => {
  it('never mutates the input store', () => {
    const base = Object.freeze(store());
    Object.freeze(base.recurring);
    Object.freeze(base.recurring[0]);
    expect(() => skipOccurrence(base, { id: 'r1', due: '2026-08-05' })).not.toThrow();
    expect(() => toggleRulePause(base, { id: 'r1' })).not.toThrow();
    expect(() => deleteRule(base, { id: 'r1' })).not.toThrow();
    expect(base.recurring[0].occurrences).toHaveLength(0);
  });
});


describe('making an existing transaction repeating', () => {
  const existing = over => ({
    id: 't1', date: '2026-08-05T12:00', type: 'expense', amount: 35000, status: 'cleared',
    accountId: 'a1', category: 'rent', merchant: 'Landlord', notes: '', ...(over || {}),
  });
  // The edit form as TxForm submits it, with a preset chosen in the date picker.
  const editForm = over => txForm({ editId: 't1', ...(over || {}) });
  const edit = (st, f, type = 'expense', amt = 35000) =>
    updateTransaction(st, { form: f, type, amt, fee: 0 });

  it('creates a rule from the picker preset when editing', () => {
    const st = store({ recurring: [], transactions: [existing()] });
    const s = edit(st, editForm({ repeat: 'monthly' }));
    expect(s.recurring).toHaveLength(1);
    const r = s.recurring[0];
    expect(r).toMatchObject({ name: 'Landlord', type: 'expense', amount: 35000, accountId: 'a1' });
    expect(r.schedule).toMatchObject({ every: 1, unit: 'month', days: [5] });
    expect(r.nextDate).toBe('2026-09-05');
  });

  it('seeds the source transaction as the first recorded occurrence', () => {
    const s = edit(store({ recurring: [], transactions: [existing()] }), editForm({ repeat: 'monthly' }));
    expect(s.recurring[0].occurrences).toEqual([
      expect.objectContaining({ due: '2026-08-05', outcome: 'recorded', amount: 35000, txId: 't1' }),
    ]);
  });

  it('leaves the transaction alone when Repeat is Never', () => {
    const s = edit(store({ recurring: [], transactions: [existing()] }), editForm());
    expect(s.recurring).toHaveLength(0);
    expect(s.transactions).toHaveLength(1);
  });

  it('will not turn one transaction into two rules', () => {
    const once = edit(store({ recurring: [], transactions: [existing()] }), editForm({ repeat: 'monthly' }));
    const twice = edit(once, editForm({ repeat: 'weekly' }));
    expect(twice.recurring).toHaveLength(1);
    expect(twice.recurring[0].schedule.unit).toBe('month'); // the first rule stands
  });

  it('ruleFromTx finds the rule a transaction already belongs to', () => {
    const s = edit(store({ recurring: [], transactions: [existing()] }), editForm({ repeat: 'monthly' }));
    expect(ruleFromTx(s, 't1')).toBe(s.recurring[0]);
    expect(ruleFromTx(s, 'nope')).toBe(null);
    expect(ruleFromTx(s, undefined)).toBe(null);
  });

  it('does not mutate the store it was given', () => {
    const base = store({ recurring: [], transactions: [existing()] });
    Object.freeze(base);
    Object.freeze(base.recurring);
    const s = edit(base, editForm({ repeat: 'monthly' }));
    expect(base.recurring).toHaveLength(0);
    expect(s.recurring).toHaveLength(1);
  });

  it('upsertRule seeds the occurrence when opened from a transaction', () => {
    const base = store({ recurring: [], transactions: [existing()] });
    const f = {
      name: 'Rent', type: 'expense', every: '1', unit: 'month',
      dayRules: [{ kind: 'dom', day: '5' }], nextDate: '2026-09-05', category: 'rent',
      source: 'acc:a1', estimated: false, autoPost: false,
      endsKind: 'never', endsCount: '', endsDate: '', sourceTxId: 't1',
    };
    const s = upsertRule(base, { form: f, amt: 35000 });
    expect(s.recurring[0].occurrences).toEqual([
      expect.objectContaining({ due: '2026-08-05', outcome: 'recorded', amount: 35000, txId: 't1' }),
    ]);
    // ...and not when it wasn't
    const plain = upsertRule(base, { form: { ...f, sourceTxId: null }, amt: 35000 });
    expect(plain.recurring[0].occurrences).toEqual([]);
  });
});
