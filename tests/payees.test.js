import { describe, it, expect } from 'vitest';
import { payeeKey, payeeRecordFor, payeeIndex, transferHidden, autoCategoryFor, applyRenameRules, matchesPayeeTx, autoCategoryPatchArgs } from '../src/lib/payees.js';

const S = {
  transactions: [
    { type: 'expense', merchant: 'Subway' }, { type: 'expense', merchant: 'subway' },
    { type: 'income', merchant: 'CodingCops' }, { type: 'expense', merchant: '' },
    { type: 'adjustment', merchant: 'Balance adjustment' },
  ],
  payees: [
    { id: 'p1', name: 'SUBWAY', autoCategorize: true, autoCategoryId: 'c9', renameRules: [{ op: 'contains', pattern: 'sub' }] },
    { id: 'p2', name: 'Landlord', hidden: true },                    // record with no transactions
    { id: 'p3', name: '', transferRef: 'acc:a1', hidden: true },     // hidden transfer payee
    { id: 'p4', name: 'Mepco', renameRules: [{ op: 'is', pattern: 'MEPCO LTD' }] },
  ],
};

describe('payeeIndex', () => {
  it('unions merchants and records; record casing wins; counts case-insensitively', () => {
    const idx = payeeIndex(S);
    const subway = idx.find(p => payeeKey(p.name) === 'subway');
    expect(subway.name).toBe('SUBWAY');       // record casing wins
    expect(subway.txCount).toBe(2);
    expect(subway.record.id).toBe('p1');
    const landlord = idx.find(p => p.name === 'Landlord');
    expect(landlord.txCount).toBe(0);         // record-only payee still listed
    expect(idx.some(p => p.name === 'Balance adjustment')).toBe(false); // adjustments never payees
    expect(idx.some(p => p.name === '')).toBe(false);
    expect(idx.map(p => p.name)).toEqual([...idx.map(p => p.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('transfer records never appear in the index', () => {
    expect(payeeIndex(S).some(p => p.record && p.record.transferRef)).toBe(false);
  });
});

describe('lookups', () => {
  it('payeeRecordFor is case-insensitive and skips transfer records', () => {
    expect(payeeRecordFor(S, 'subway').id).toBe('p1');
    expect(payeeRecordFor(S, 'nope')).toBe(null);
  });
  it('transferHidden reads transferRef records', () => {
    expect(transferHidden(S, 'acc:a1')).toBe(true);
    expect(transferHidden(S, 'acc:a2')).toBe(false);
  });
  it('autoCategoryFor returns the id only when autoCategorize is on', () => {
    expect(autoCategoryFor(S, 'Subway')).toBe('c9');
    expect(autoCategoryFor(S, 'Mepco')).toBe(null);
    expect(autoCategoryFor(S, 'unknown')).toBe(null);
  });
});

describe('applyRenameRules', () => {
  it('is-rules beat contains-rules regardless of record order', () => {
    expect(applyRenameRules('MEPCO LTD', S.payees)).toBe('Mepco');   // p4 'is' wins over p1 'contains'... no overlap here
    expect(applyRenameRules('my subway order', S.payees)).toBe('SUBWAY'); // contains, ci
    expect(applyRenameRules('unmatched', S.payees)).toBe('unmatched');
  });
  it('an is-rule on a later record beats an earlier contains-rule', () => {
    const payees = [
      { id: 'a', name: 'First', renameRules: [{ op: 'contains', pattern: 'shop' }] },
      { id: 'b', name: 'Second', renameRules: [{ op: 'is', pattern: 'THE SHOP' }] },
    ];
    expect(applyRenameRules('THE SHOP', payees)).toBe('Second');
    expect(applyRenameRules('the shop nearby', payees)).toBe('First');
  });
});

describe('matchesPayeeTx', () => {
  it('matches merchant case-insensitively and never adjustments', () => {
    expect(matchesPayeeTx({ type: 'expense', merchant: 'SUBWAY' }, 'subway')).toBe(true);
    expect(matchesPayeeTx({ type: 'adjustment', merchant: 'subway' }, 'subway')).toBe(false);
    expect(matchesPayeeTx({ type: 'cardAdjustment', merchant: 'subway' }, 'subway')).toBe(false);
  });
});

describe('autoCategoryPatchArgs', () => {
  const S2 = { transactions: [], payees: [
    { id: 'p1', name: 'Mepco', autoCategorize: true, autoCategoryId: 'c9' },
    { id: 'p2', name: 'Boss', autoCategorize: true, autoCategoryId: 'rta' },
  ] };
  it('prefills only when the category is empty', () => {
    expect(autoCategoryPatchArgs(S2, 'Mepco', '')).toBe('c9');
    expect(autoCategoryPatchArgs(S2, 'Mepco', 'c1')).toBe(null);  // user pick wins
  });
  it('rta means leave uncategorized — no patch', () => {
    expect(autoCategoryPatchArgs(S2, 'Boss', '')).toBe(null);
  });
  it('unknown payee → no patch', () => {
    expect(autoCategoryPatchArgs(S2, 'nobody', '')).toBe(null);
  });
});
