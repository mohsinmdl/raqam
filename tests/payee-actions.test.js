// tests/payee-actions.test.js
import { describe, it, expect } from 'vitest';
import { upsertPayee, renamePayee, combinePayees, deletePayees, setPayeesHidden } from '../src/store/actions.js';

const base = () => ({
  transactions: [
    { id: 't1', type: 'expense', merchant: 'Subway', amount: 5 },
    { id: 't2', type: 'expense', merchant: 'SUBWAY', amount: 6 },
    { id: 't3', type: 'income', merchant: 'CodingCops', amount: 7 },
    { id: 't4', type: 'adjustment', merchant: 'Subway', amount: 1 },  // never rewritten
    { id: 't5', type: 'transfer', merchant: 'Subway', amount: 2 },    // machine-written, never rewritten
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
  // A8: the modal re-sends the whole patch on every commit, so a second
  // identical commit must be a true no-op — same reference, no audit growth.
  it('the same patch twice is a no-op the second time', () => {
    const first = upsertPayee(base(), { name: 'Subway', patch: { autoCategorize: true, autoCategoryId: 'c1' } });
    const second = upsertPayee(first, { name: 'Subway', patch: { autoCategorize: true, autoCategoryId: 'c1' } });
    expect(second).toBe(first);
    expect(second.audit).toHaveLength(1);
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
  // A5: the only true no-ops are a blank `to` and a byte-identical one. A
  // same-key rename with different casing is a NORMALIZATION and must write —
  // see the casing test below.
  it('no-ops on a blank or byte-identical rename', () => {
    const d = base();
    expect(renamePayee(d, { from: 'Subway', to: '  ' })).toBe(d);
    expect(renamePayee(d, { from: 'Subway', to: 'Subway' })).toBe(d);
    expect(renamePayee(d, { from: '  Subway  ', to: 'Subway' })).toBe(d);
  });
  it('a same-key rename normalizes casing across merchants and the record', () => {
    const next = renamePayee(base(), { from: 'Subway', to: 'SUBWAY' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('SUBWAY');
    expect(next.transactions.find(t => t.id === 't2').merchant).toBe('SUBWAY'); // already exact — untouched
    expect(next.transactions.find(t => t.id === 't2').editCount).toBeUndefined();
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway'); // adjustment
    expect(next.transactions.find(t => t.id === 't5').merchant).toBe('Subway'); // transfer
    expect(next.payees.find(p => p.id === 'p1').name).toBe('SUBWAY');
    expect(next.audit.length).toBe(1);                                          // ONE audit row
    expect(next.audit[0].summary).toContain('1 transaction');
  });
  it('a casing rename with no record rewrites the merchants alone — no record is born', () => {
    const d = { transactions: [{ id: 't1', type: 'expense', merchant: 'amazon', amount: 5 }], payees: [], audit: [] };
    const next = renamePayee(d, { from: 'amazon', to: 'Amazon' });
    expect(next.transactions[0].merchant).toBe('Amazon');
    expect(next.payees).toEqual([]);
  });
  it('never rewrites a transfer\'s machine-written merchant', () => {
    const next = renamePayee(base(), { from: 'Subway', to: 'Subway Gulberg' });
    expect(next.transactions.find(t => t.id === 't5').merchant).toBe('Subway');
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
  // A4: an absorbed record is about to vanish — its auto-categorize rule and
  // hidden flag move to the survivor unless the survivor already sets them.
  it('carries absorbed autoCategorize/autoCategoryId/hidden onto a bare survivor', () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'Store A', amount: 5 },
        { id: 't2', type: 'expense', merchant: 'Store B', amount: 6 },
      ],
      payees: [{ id: 'p2', name: 'Store B', autoCategorize: true, autoCategoryId: 'c1', hidden: true }],
      audit: [],
    };
    const next = combinePayees(data, { names: ['Store A', 'Store B'], into: 'Store A' });
    const survivor = next.payees.find(p => p.name === 'Store A');
    expect(survivor.autoCategorize).toBe(true);
    expect(survivor.autoCategoryId).toBe('c1');
    expect(survivor.hidden).toBe(true);
    expect(next.payees.some(p => p.id === 'p2')).toBe(false);
  });
  it("the survivor's own settings win over an absorbed record's", () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'Store A', amount: 5 },
        { id: 't2', type: 'expense', merchant: 'Store B', amount: 6 },
      ],
      payees: [
        { id: 'p1', name: 'Store A', autoCategorize: false, autoCategoryId: 'keep', hidden: false },
        { id: 'p2', name: 'Store B', autoCategorize: true, autoCategoryId: 'drop', hidden: true },
      ],
      audit: [],
    };
    const survivor = combinePayees(data, { names: ['Store A', 'Store B'], into: 'Store A' }).payees.find(p => p.name === 'Store A');
    expect(survivor.autoCategorize).toBe(false);
    expect(survivor.autoCategoryId).toBe('keep');
    expect(survivor.hidden).toBe(false);
  });
  // A8: the shape the modal actually sends — every selected name, `into` being
  // the first of them.
  it('the default UI path (into === names[0]) absorbs the rest and keeps the name', () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'Alpha', amount: 5 },
        { id: 't2', type: 'expense', merchant: 'Beta', amount: 6 },
        { id: 't3', type: 'expense', merchant: 'Gamma', amount: 7 },
      ],
      payees: [
        { id: 'p1', name: 'Alpha', renameRules: [{ op: 'contains', pattern: 'al' }] },
        { id: 'p2', name: 'Beta', hidden: true },
        { id: 'p3', name: 'Gamma', renameRules: [{ op: 'is', pattern: 'gamma' }] },
      ],
      audit: [],
    };
    const next = combinePayees(data, { names: ['Alpha', 'Beta', 'Gamma'], into: 'Alpha' });
    expect(next.transactions.every(t => t.merchant === 'Alpha')).toBe(true);
    expect(next.payees).toHaveLength(1);
    const survivor = next.payees[0];
    expect(survivor.id).toBe('p1');
    expect(survivor.name).toBe('Alpha');
    expect(survivor.hidden).toBe(true);
    expect(survivor.renameRules).toEqual([{ op: 'contains', pattern: 'al' }, { op: 'is', pattern: 'gamma' }]);
    expect(next.audit[0].summary).toContain('2 transaction'); // t1 already read 'Alpha'
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
  // A1: "delete A, B and C, move everything to C" is a legal pick — C has to
  // survive both the rewrite and the record sweep.
  it('a replacement inside the deleted set survives with its record intact', () => {
    const data = {
      transactions: [
        { id: 't1', type: 'expense', merchant: 'A', amount: 1 },
        { id: 't2', type: 'expense', merchant: 'B', amount: 2 },
        { id: 't3', type: 'expense', merchant: 'C', amount: 3 },
      ],
      payees: [
        { id: 'pa', name: 'A', hidden: true },
        { id: 'pc', name: 'C', autoCategorize: true, autoCategoryId: 'c1' },
      ],
      audit: [],
    };
    const next = deletePayees(data, { names: ['A', 'B', 'C'], replacement: 'C' });
    expect(next.transactions.map(t => t.merchant)).toEqual(['C', 'C', 'C']);
    expect(next.transactions.find(t => t.id === 't3').editCount).toBeUndefined(); // untouched
    expect(next.payees).toEqual([{ id: 'pc', name: 'C', autoCategorize: true, autoCategoryId: 'c1' }]);
    expect(next.audit[0].summary).toContain('2 payees');
  });
  it('[No Payee] blanks the merchant', () => {
    const next = deletePayees(base(), { names: ['Subway'], replacement: '' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('');
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway');
    expect(next.transactions.find(t => t.id === 't5').merchant).toBe('Subway');
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
