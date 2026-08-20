// tests/payee-actions.test.js
import { describe, it, expect } from 'vitest';
import { upsertPayee, renamePayee, combinePayees, deletePayees, setPayeesHidden } from '../src/store/actions.js';

const base = () => ({
  transactions: [
    { id: 't1', type: 'expense', merchant: 'Subway', amount: 5 },
    { id: 't2', type: 'expense', merchant: 'SUBWAY', amount: 6 },
    { id: 't3', type: 'income', merchant: 'CodingCops', amount: 7 },
    { id: 't4', type: 'adjustment', merchant: 'Subway', amount: 1 },  // never rewritten
  ],
  payees: [
    { id: 'p1', name: 'Subway', renameRules: [{ op: 'contains', pattern: 'sub' }] },
    { id: 'p2', name: 'CodingCops', autoCategorize: true, autoCategoryId: 'c9' },
  ],
  audit: [],
});

describe('upsertPayee', () => {
  it('creates a record for an uncustomized payee', () => {
    const next = upsertPayee(base(), { name: 'New Shop', patch: { hidden: true } });
    const rec = next.payees.find(p => p.name === 'New Shop');
    expect(rec.hidden).toBe(true);
    expect(next.audit[0].entityType).toBe('payee');
  });
  it('updates in place, case-insensitively', () => {
    const next = upsertPayee(base(), { name: 'sUbWaY', patch: { autoCategorize: true, autoCategoryId: 'c1' } });
    expect(next.payees.find(p => p.id === 'p1').autoCategoryId).toBe('c1');
    expect(next.payees.length).toBe(2);
  });
  it('strips name and transferRef from patch, does not change record name', () => {
    const next = upsertPayee(base(), { name: 'Subway', patch: { name: 'Different', hidden: true } });
    expect(next.payees.find(p => p.id === 'p1').name).toBe('Subway');
    expect(next.payees.find(p => p.id === 'p1').hidden).toBe(true);
  });
  it('toggling autoCategorize on then off leaves no bare record', () => {
    let next = upsertPayee(base(), { name: 'New Shop', patch: { autoCategorize: true, autoCategoryId: 'c1' } });
    expect(next.payees.some(p => p.name === 'New Shop')).toBe(true);
    next = upsertPayee(next, { name: 'New Shop', patch: { autoCategorize: false, autoCategoryId: '' } });
    expect(next.payees.some(p => p.name === 'New Shop')).toBe(false);
  });
});

describe('renamePayee', () => {
  it('bulk-updates merchants (ci) and the record name, skipping adjustments', () => {
    const next = renamePayee(base(), { from: 'subway', to: 'Subway Gulberg' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('Subway Gulberg');
    expect(next.transactions.find(t => t.id === 't2').merchant).toBe('Subway Gulberg');
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway'); // adjustment untouched
    expect(next.payees.find(p => p.id === 'p1').name).toBe('Subway Gulberg');
    expect(next.audit[0].summary).toContain('Subway Gulberg');
  });
  it('no-ops on blank or same-key rename', () => {
    const d = base();
    expect(renamePayee(d, { from: 'Subway', to: '  ' })).toBe(d);
    expect(renamePayee(d, { from: 'Subway', to: 'SUBWAY' })).toBe(d);
  });
  it('renaming onto an existing customized payee merges into one surviving record', () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'Foo', amount: 5 },
        { id: 't2', type: 'expense', merchant: 'Bar', amount: 6 },
      ],
      payees: [
        { id: 'p1', name: 'Foo', renameRules: [{ op: 'contains', pattern: 'foo' }] },
        { id: 'p2', name: 'Bar', autoCategorize: true, autoCategoryId: 'c1' },
      ],
      audit: [],
    };
    const next = renamePayee(data, { from: 'Foo', to: 'Bar' });
    expect(next.payees.some(p => p.id === 'p1')).toBe(false);
    const survivors = next.payees.filter(p => p.name === 'Bar');
    expect(survivors.length).toBe(1);
    expect(survivors[0].id).toBe('p2');
    expect(survivors[0].autoCategorize).toBe(true);
    expect(survivors[0].autoCategoryId).toBe('c1');
    expect(survivors[0].renameRules).toEqual([{ op: 'contains', pattern: 'foo' }]);
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('Bar');
  });
});

describe('combinePayees', () => {
  it('rewrites merchants, merges rules into the survivor, drops absorbed records', () => {
    const next = combinePayees(base(), { names: ['Subway', 'CodingCops'], into: 'Everything' });
    expect(next.transactions.filter(t => t.merchant === 'Everything').map(t => t.id).sort()).toEqual(['t1', 't2', 't3']);
    expect(next.payees.some(p => p.id === 'p1' || p.id === 'p2')).toBe(false);
    const survivor = next.payees.find(p => p.name === 'Everything');
    expect(survivor.renameRules).toEqual([{ op: 'contains', pattern: 'sub' }]);
  });
  it('self-combine (exact casing) is a no-op — returns same data reference', () => {
    const d = base();
    const next = combinePayees(d, { names: ['Subway'], into: 'Subway' });
    expect(next).toBe(d);
  });
  it('self-combine (mixed casing) rewrites only the non-exact merchants', () => {
    const d = base();
    const next = combinePayees(d, { names: ['Subway', 'SUBWAY'], into: 'Subway' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('Subway');
    expect(next.transactions.find(t => t.id === 't1').editCount).toBeUndefined();
    expect(next.transactions.find(t => t.id === 't2').merchant).toBe('Subway');
    expect(next.transactions.find(t => t.id === 't2').editCount).toBe(1);
    expect(next.audit[0].summary).toContain('1 transaction');
  });
  it('merges deduped rules from survivor and absorbed records', () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'Starbucks', amount: 5 },
        { id: 't2', type: 'expense', merchant: 'Coffee', amount: 6 },
      ],
      payees: [
        { id: 'p1', name: 'Starbucks', renameRules: [{ op: 'contains', pattern: 'star' }] },
        { id: 'p2', name: 'Coffee', renameRules: [{ op: 'contains', pattern: 'coffee' }, { op: 'is', pattern: 'brew' }] },
      ],
      audit: [],
    };
    const next = combinePayees(data, { names: ['Coffee'], into: 'Starbucks' });
    const survivor = next.payees.find(p => p.name === 'Starbucks');
    expect(survivor.renameRules).toEqual([
      { op: 'contains', pattern: 'star' },
      { op: 'contains', pattern: 'coffee' },
      { op: 'is', pattern: 'brew' },
    ]);
  });
});

describe('deletePayees', () => {
  it('reassigns to the replacement and removes records', () => {
    const next = deletePayees(base(), { names: ['Subway'], replacement: 'CodingCops' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('CodingCops');
    expect(next.payees.some(p => p.id === 'p1')).toBe(false);
  });
  it('[No Payee] blanks the merchant', () => {
    const next = deletePayees(base(), { names: ['Subway'], replacement: '' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('');
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway');
  });
});

describe('setPayeesHidden', () => {
  it('hides names and transfer refs; un-hiding a bare record removes it', () => {
    let next = setPayeesHidden(base(), { names: ['Subway'], transferRefs: ['acc:a1'], hidden: true });
    expect(next.payees.find(p => p.id === 'p1').hidden).toBe(true);
    expect(next.payees.find(p => p.transferRef === 'acc:a1').hidden).toBe(true);
    next = setPayeesHidden(next, { transferRefs: ['acc:a1'], hidden: false });
    expect(next.payees.some(p => p.transferRef === 'acc:a1')).toBe(false); // bare record dropped
  });
  it('audit summary uses accurate changed count, not input array length', () => {
    let next = setPayeesHidden(base(), { names: ['Subway', 'CodingCops'], hidden: true });
    expect(next.audit[0].summary).toContain('2 payee');
    next = setPayeesHidden(next, { names: ['Subway', 'CodingCops'], hidden: false });
    expect(next.audit[0].summary).toContain('2 payee');
    // Now hide Subway again, then try to hide it and CodingCops (only 1 changes)
    next = setPayeesHidden(next, { names: ['Subway'], hidden: true });
    expect(next.audit[0].summary).toContain('1 payee');
    next = setPayeesHidden(next, { names: ['Subway', 'CodingCops'], hidden: true });
    expect(next.audit[0].summary).toContain('1 payee'); // only CodingCops changed
  });
});
