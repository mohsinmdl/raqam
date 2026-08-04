// Editable own banks: kind/name edits, removal guards, and the sync contract
// that makes reclassification safe (a kind change must push an UPDATE, never a
// DELETE — see src/store/sync.js's `writable`).
import { describe, it, expect } from 'vitest';
import { instById, instRefs, INST_KINDS } from '../src/lib/calc.js';
import { updateInstitution, deleteInstitution, addCard } from '../src/store/actions.js';
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

describe('addCard creates a custom bank', () => {
  it('mints the institution and points the card at it', () => {
    const next = addCard(store(), {
      form: { inst: '__custom', customInst: '  Nayapay ', nickname: 'Wallet', linked: 'acc:a1' },
      prod: null, ctype: 'debit', limit: NaN,
    });
    const made = next.institutions.find(i => i.name === 'Nayapay');
    expect(made).toMatchObject({ kind: 'Custom', own: true });
    expect(next.cards.at(-1).instId).toBe(made.id);
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
