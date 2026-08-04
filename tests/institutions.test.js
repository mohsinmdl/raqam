// Editable own banks: kind/name edits, removal guards, and the sync contract
// that makes reclassification safe (a kind change must push an UPDATE, never a
// DELETE — see src/store/sync.js's `writable`).
import { describe, it, expect } from 'vitest';
import { instById, instRefs, INST_KINDS } from '../src/lib/calc.js';
import { updateInstitution, deleteInstitution, addAccount, addCard, updateAccount } from '../src/store/actions.js';
import { diffStores } from '../src/store/sync.js';

function store(over) {
  return {
    institutions: [
      { id: 'meezan', name: 'Meezan Bank', kind: 'Islamic' },            // catalogue: no `own`
      { id: 'u1', name: 'Askari Bank', kind: 'Custom', own: true },      // the user's own
      { id: 'u2', name: 'Cash', kind: 'Custom', own: true },             // own, unused
    ],
    accounts: [{ id: 'a1', instId: 'u1', status: 'active' }],
    cards: [{ id: 'c1', instId: 'u1', type: 'debit', status: 'active' }],
    cardProducts: [], categories: [], snapshots: [], transactions: [],
    budgets: [], recurring: [], audit: [],
    ...(over || {}),
  };
}

describe('instRefs', () => {
  it('counts the accounts and cards pointing at a bank', () => {
    expect(instRefs(store(), 'u1')).toEqual({ accounts: 1, cards: 1, total: 2 });
    expect(instRefs(store(), 'u2')).toEqual({ accounts: 0, cards: 0, total: 0 });
  });
});

describe('updateInstitution', () => {
  it('reclassifies an own bank and renames it', () => {
    const next = updateInstitution(store(), { id: 'u1', name: 'Askari Bank Ltd', kind: 'Conventional' });
    expect(instById(next, 'u1')).toMatchObject({ name: 'Askari Bank Ltd', kind: 'Conventional', own: true });
  });
  it('refuses catalogue rows', () => {
    const S = store();
    expect(updateInstitution(S, { id: 'meezan', name: 'Hacked', kind: 'Custom' })).toBe(S);
  });
  it('ignores an unknown kind and an empty name, and is a no-op when nothing changes', () => {
    const S = store();
    expect(instById(updateInstitution(S, { id: 'u1', name: 'Askari Bank', kind: 'Bogus' }), 'u1').kind).toBe('Custom');
    expect(instById(updateInstitution(S, { id: 'u1', name: '   ', kind: 'Islamic' }), 'u1').name).toBe('Askari Bank');
    expect(updateInstitution(S, { id: 'u1', name: 'Askari Bank', kind: 'Custom' })).toBe(S);
  });
  it('does not mutate the input store', () => {
    const S = store();
    updateInstitution(S, { id: 'u1', name: 'Renamed', kind: 'Islamic' });
    expect(instById(S, 'u1')).toMatchObject({ name: 'Askari Bank', kind: 'Custom' });
  });
  it('every offered kind is accepted', () => {
    INST_KINDS.forEach(k => {
      expect(instById(updateInstitution(store(), { id: 'u2', name: 'Cash', kind: k }), 'u2').kind).toBe(k);
    });
  });
});

describe('deleteInstitution', () => {
  it('removes an own bank nothing points at', () => {
    expect(instById(deleteInstitution(store(), { id: 'u2' }), 'u2')).toBeNull();
  });
  it('refuses while an account or card still uses it, and refuses catalogue rows', () => {
    const S = store();
    expect(deleteInstitution(S, { id: 'u1' })).toBe(S);            // 1 account + 1 card
    expect(deleteInstitution(S, { id: 'meezan' })).toBe(S);        // not own
    const cardOnly = store({ accounts: [] });
    expect(deleteInstitution(cardOnly, { id: 'u1' })).toBe(cardOnly);
  });
});

describe('creating a bank alongside an account or card', () => {
  // A name distinct from the fixture's existing 'Askari Bank'.
  const accForm = over => ({ inst: '__custom', customInst: '  JS Bank ', customInstKind: 'Conventional', nickname: 'Salary', type: 'Current', asof: '2026-08-05', ...over });

  it('addAccount mints the bank with the chosen category', () => {
    const next = addAccount(store(), { form: accForm(), bal: 1000 });
    const made = next.institutions.find(i => i.name === 'JS Bank');
    expect(made).toMatchObject({ kind: 'Conventional', own: true });
    expect(next.accounts.at(-1).instId).toBe(made.id);
  });
  it('addCard mints the bank with the chosen category and points the card at it', () => {
    const next = addCard(store(), {
      form: { inst: '__custom', customInst: '  Nayapay ', customInstKind: 'Digital', nickname: 'Wallet', linked: 'acc:a1' },
      prod: null, ctype: 'debit', limit: NaN,
    });
    const made = next.institutions.find(i => i.name === 'Nayapay');
    expect(made).toMatchObject({ kind: 'Digital', own: true });
    expect(next.cards.at(-1).instId).toBe(made.id);
  });
  it('an absent or bogus category falls back to Other', () => {
    const bogus = addAccount(store(), { form: accForm({ customInstKind: 'Nonsense' }), bal: 0 });
    expect(instById(bogus, bogus.accounts.at(-1).instId).kind).toBe('Custom');
    const missing = addAccount(store(), { form: accForm({ customInstKind: undefined }), bal: 0 });
    expect(instById(missing, missing.accounts.at(-1).instId).kind).toBe('Custom');
  });
  it('every offered category is accepted at creation', () => {
    INST_KINDS.forEach(k => {
      const next = addAccount(store(), { form: accForm({ customInstKind: k }), bal: 0 });
      expect(instById(next, next.accounts.at(-1).instId).kind).toBe(k);
    });
  });
});

describe('accounts no longer carry their own Conventional/Islamic flag', () => {
  it('addAccount does not write islamic', () => {
    const next = addAccount(store(), { form: { inst: 'meezan', nickname: 'Savings', type: 'Savings', asof: '2026-08-05' }, bal: 500 });
    expect(next.accounts.at(-1)).not.toHaveProperty('islamic');
  });
  it('updateAccount strips a legacy islamic value off the record', () => {
    const S = store({ accounts: [{ id: 'a1', instId: 'u1', nickname: 'Old', type: 'Current', status: 'active', islamic: true }] });
    const next = updateAccount(S, { form: { editId: 'a1', inst: 'u1', nickname: 'Old', type: 'Current', status: 'active' } });
    expect(next.accounts[0]).not.toHaveProperty('islamic');
  });
});

describe('sync contract: reclassifying must not delete the bank', () => {
  it('a kind change diffs as an update, never a delete', () => {
    const prev = store();
    const next = updateInstitution(prev, { id: 'u1', name: 'Askari Bank', kind: 'Conventional' });
    const inst = diffStores(prev, next).find(d => d.collection.name === 'institutions');
    expect(inst.deletes).toEqual([]);
    expect(inst.added).toEqual([]);
    expect(inst.changed).toEqual([{ id: 'u1', name: 'Askari Bank', kind: 'Conventional' }]);
  });
  it('catalogue rows never push, and `own` never reaches the server payload', () => {
    const prev = store();
    const next = { ...prev, institutions: [...prev.institutions, { id: 'u3', name: 'JS Bank', kind: 'Conventional', own: true }] };
    const inst = diffStores(prev, next).find(d => d.collection.name === 'institutions');
    expect(inst.added).toEqual([{ id: 'u3', name: 'JS Bank', kind: 'Conventional' }]);
    expect(Object.keys(inst.added[0])).not.toContain('own');
    // Dropping every catalogue row locally must not schedule server deletes.
    const noCat = { ...prev, institutions: prev.institutions.filter(i => i.own) };
    expect(diffStores(prev, noCat).find(d => d.collection.name === 'institutions')).toBeUndefined();
  });
  it('removing an own bank diffs as a delete', () => {
    const prev = store();
    const inst = diffStores(prev, deleteInstitution(prev, { id: 'u2' })).find(d => d.collection.name === 'institutions');
    expect(inst.deletes).toEqual(['u2']);
  });
});
