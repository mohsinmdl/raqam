import { describe, it, expect } from 'vitest';
import {
  matchesQuery, txHaystack, matchesTerm, matchesSearch,
  searchSuggestions, parseSearchAmount, txFlows, txNeedsCategory,
} from '../src/lib/txSearch.js';

const S = {
  categories: [{ id: 'rent', name: 'Rent' }, { id: 'food', name: 'Groceries' }],
  accounts: [
    { id: 'a1', nickname: 'HBL Islamic' },
    { id: 'a2', nickname: 'Meezan Savings' },
  ],
  cards: [{ id: 'c1', nickname: 'Faysal Visa', last4: '4021' }],
};

const tx = (over = {}) => ({
  merchant: 'Imtiaz Super Market', notes: '', category: 'food',
  accountId: 'a1', toAccountId: null, cardId: null, toCardId: null, ...over,
});

describe('matchesQuery — the fields it already covered', () => {
  it('matches the merchant', () => expect(matchesQuery(tx(), 'imtiaz', S)).toBe(true));
  it('matches notes', () => expect(matchesQuery(tx({ notes: 'monthly stock-up' }), 'stock', S)).toBe(true));
  it('matches the category name', () => expect(matchesQuery(tx(), 'grocer', S)).toBe(true));
  it('rejects a miss', () => expect(matchesQuery(tx(), 'petrol', S)).toBe(false));
});

describe('matchesQuery — account and card names (the fix)', () => {
  it('matches the account nickname the row is on', () => {
    // The whole bug: "HBL" is the account, not the merchant/notes/category.
    expect(matchesQuery(tx(), 'hbl', S)).toBe(true);
    expect(matchesQuery(tx(), 'islamic', S)).toBe(true);
  });

  it('matches the FAR side of a transfer', () => {
    const transfer = tx({ merchant: '', category: null, accountId: 'a1', toAccountId: 'a2' });
    expect(matchesQuery(transfer, 'meezan', S)).toBe(true); // destination
    expect(matchesQuery(transfer, 'hbl', S)).toBe(true);    // source
  });

  it('matches a card nickname and its last4', () => {
    const onCard = tx({ accountId: null, cardId: 'c1' });
    expect(matchesQuery(onCard, 'faysal', S)).toBe(true);
    expect(matchesQuery(onCard, '4021', S)).toBe(true);
  });

  it('matches the destination card of a card payment', () => {
    const pay = tx({ accountId: 'a1', toCardId: 'c1' });
    expect(matchesQuery(pay, 'faysal', S)).toBe(true);
  });

  it('does not match an account the row does not touch', () => {
    // tx() is on a1 (HBL) only; Meezan must not match it.
    expect(matchesQuery(tx(), 'meezan', S)).toBe(false);
  });
});

describe('matchesQuery — query hygiene', () => {
  it('is case-insensitive', () => expect(matchesQuery(tx(), 'HbL', S)).toBe(true));
  it('trims surrounding spaces', () => expect(matchesQuery(tx(), '  hbl  ', S)).toBe(true));
  it('an empty or blank query matches everything', () => {
    expect(matchesQuery(tx(), '', S)).toBe(true);
    expect(matchesQuery(tx(), '   ', S)).toBe(true);
  });
});

describe('txHaystack', () => {
  it('omits missing references rather than emitting blanks', () => {
    // No card, no transfer — the haystack should not carry empty fragments
    // that a stray space could match.
    const h = txHaystack(tx({ notes: '' }), S);
    expect(h).toBe('imtiaz super market groceries hbl islamic');
  });

  it('survives an unknown id without throwing', () => {
    expect(txHaystack(tx({ accountId: 'ghost', category: 'ghost' }), S)).toBe('imtiaz super market');
  });
});

// --- Structured search: the facet model -------------------------------------

// A store rich enough to exercise every facet. Anchor month is August 2026, so
// a bare day resolves within it, matching the register's viewed month.
const SS = {
  categories: [
    { id: 'rent', name: '🏠 Rent/Mortgage' },
    { id: 'dine', name: '🍽 Dining out' },
    { id: 'reco', name: 'Recoverable (advances)' },
  ],
  accounts: [
    { id: 'a1', nickname: 'BankIslami' },
    { id: 'a2', nickname: 'Allied Bank' },
    { id: 'a3', nickname: 'Old Meezan', status: 'closed' },
  ],
  cards: [{ id: 'c1', nickname: 'Faysal Visa', last4: '4021' }],
};
const ANCHOR = '2026-08-15';

const T = (over = {}) => ({
  type: 'expense', amount: 500, status: 'cleared', date: '2026-08-11T10:00:00Z',
  merchant: 'Imtiaz', notes: '', category: 'dine', accountId: 'a1',
  toAccountId: null, cardId: null, toCardId: null, ...over,
});

describe('parseSearchAmount', () => {
  it('reads plain and zero-padded numbers', () => {
    expect(parseSearchAmount('02')).toBe(2);
    expect(parseSearchAmount('11')).toBe(11);
    expect(parseSearchAmount('1,234.50')).toBe(1234.5);
  });
  it('returns null for non-numbers and blanks', () => {
    expect(parseSearchAmount('bank')).toBe(null);
    expect(parseSearchAmount('')).toBe(null);
    expect(parseSearchAmount('2px')).toBe(null);
  });
});

describe('txFlows — outflow/inflow sides mirror the register', () => {
  it('expense is outflow, income/refund inflow, transfer outflow', () => {
    expect(txFlows(T({ type: 'expense', amount: 500 }))).toEqual({ outflow: 500, inflow: null });
    expect(txFlows(T({ type: 'income', amount: 900 }))).toEqual({ outflow: null, inflow: 900 });
    expect(txFlows(T({ type: 'refund', amount: 40 }))).toEqual({ outflow: null, inflow: 40 });
    expect(txFlows(T({ type: 'transfer', amount: 200 }))).toEqual({ outflow: 200, inflow: null });
  });
  it('a signed adjustment picks its side by sign', () => {
    expect(txFlows(T({ type: 'adjustment', amount: -30 }))).toEqual({ outflow: 30, inflow: null });
    expect(txFlows(T({ type: 'adjustment', amount: 30 }))).toEqual({ outflow: null, inflow: 30 });
  });
});

describe('matchesTerm — each facet filters the right rows', () => {
  it('account matches either side of a transfer', () => {
    const term = { kind: 'account', id: 'a2' };
    expect(matchesTerm(T({ type: 'transfer', accountId: 'a1', toAccountId: 'a2' }), term, SS)).toBe(true);
    expect(matchesTerm(T({ accountId: 'a1' }), term, SS)).toBe(false);
  });
  it('category matches by exact id, not name text', () => {
    expect(matchesTerm(T({ category: 'rent' }), { kind: 'category', id: 'rent' }, SS)).toBe(true);
    expect(matchesTerm(T({ category: 'dine' }), { kind: 'category', id: 'rent' }, SS)).toBe(false);
  });
  it('status cleared vs uncleared', () => {
    expect(matchesTerm(T({ status: 'pending' }), { kind: 'status', value: 'uncleared' }, SS)).toBe(true);
    expect(matchesTerm(T({ status: 'cleared' }), { kind: 'status', value: 'uncleared' }, SS)).toBe(false);
    expect(matchesTerm(T({ status: 'cleared' }), { kind: 'status', value: 'cleared' }, SS)).toBe(true);
  });
  it('needsCategory flags an uncategorised expense only', () => {
    expect(matchesTerm(T({ category: null, type: 'expense' }), { kind: 'needsCategory' }, SS)).toBe(true);
    expect(matchesTerm(T({ category: 'dine' }), { kind: 'needsCategory' }, SS)).toBe(false);
    expect(matchesTerm(T({ category: null, type: 'transfer' }), { kind: 'needsCategory' }, SS)).toBe(false);
  });
  it('date on / before / after compares the day', () => {
    const on = { kind: 'date', op: 'on', iso: '2026-08-11' };
    expect(matchesTerm(T({ date: '2026-08-11T23:00:00Z' }), on, SS)).toBe(true);
    expect(matchesTerm(T({ date: '2026-08-12T01:00:00Z' }), on, SS)).toBe(false);
    expect(matchesTerm(T({ date: '2026-08-05' }), { kind: 'date', op: 'onBefore', iso: '2026-08-11' }, SS)).toBe(true);
    expect(matchesTerm(T({ date: '2026-08-20' }), { kind: 'date', op: 'onAfter', iso: '2026-08-11' }, SS)).toBe(true);
  });
  it('amount compares the correct side, and never matches the empty side', () => {
    const t = T({ type: 'expense', amount: 500 });
    expect(matchesTerm(t, { kind: 'amount', side: 'outflow', op: 'eq', value: 500 }, SS)).toBe(true);
    expect(matchesTerm(t, { kind: 'amount', side: 'outflow', op: 'gte', value: 400 }, SS)).toBe(true);
    expect(matchesTerm(t, { kind: 'amount', side: 'outflow', op: 'lte', value: 400 }, SS)).toBe(false);
    // An outflow row has no inflow side, so an inflow filter must miss it.
    expect(matchesTerm(t, { kind: 'amount', side: 'inflow', op: 'gte', value: 0 }, SS)).toBe(false);
  });
  it('field-scoped text checks only its field', () => {
    const t = T({ merchant: 'Rent Office', notes: 'bank ref 9', category: 'dine' });
    expect(matchesTerm(t, { kind: 'field', field: 'payee', q: 'rent' }, SS)).toBe(true);
    expect(matchesTerm(t, { kind: 'field', field: 'payee', q: 'bank' }, SS)).toBe(false);
    expect(matchesTerm(t, { kind: 'field', field: 'memo', q: 'bank' }, SS)).toBe(true);
    expect(matchesTerm(t, { kind: 'field', field: 'category', q: 'dining' }, SS)).toBe(true);
  });
  it('a null term matches everything', () => {
    expect(matchesTerm(T(), null, SS)).toBe(true);
  });
});

describe('matchesSearch — term wins, else free text', () => {
  it('uses the term when present', () => {
    expect(matchesSearch(T({ status: 'pending' }), { q: 'anything', term: { kind: 'status', value: 'uncleared' } }, SS)).toBe(true);
  });
  it('falls back to free text when no term', () => {
    expect(matchesSearch(T({ merchant: 'Imtiaz' }), { q: 'imtiaz', term: null }, SS)).toBe(true);
    expect(matchesSearch(T(), { q: '', term: null }, SS)).toBe(true);
  });
});

describe('searchSuggestions — the interpretations offered', () => {
  const kinds = (q) => searchSuggestions(q, SS, ANCHOR).map(s => s.term.kind);
  const find = (q, pred) => searchSuggestions(q, SS, ANCHOR).find(pred);

  it('is empty for a blank query', () => {
    expect(searchSuggestions('', SS, ANCHOR)).toEqual([]);
    expect(searchSuggestions('   ', SS, ANCHOR)).toEqual([]);
  });

  it('"bank" offers matching accounts then the field facets', () => {
    const s = searchSuggestions('bank', SS, ANCHOR);
    const accts = s.filter(x => x.term.kind === 'account').map(x => x.main);
    expect(accts).toEqual(['BankIslami', 'Allied Bank']);
    // then the any-field default and the three scoped fields.
    expect(kinds('bank').filter(k => k === 'field').length).toBe(4);
  });

  it('skips closed accounts', () => {
    expect(searchSuggestions('meezan', SS, ANCHOR).some(x => x.term.id === 'a3')).toBe(false);
  });

  it('"rent" offers the Rent category (emoji kept in the name)', () => {
    const c = find('rent', x => x.term.kind === 'category');
    expect(c.main).toBe('🏠 Rent/Mortgage');
    expect(c.term.id).toBe('rent');
  });

  it('"reco" offers the Recoverable category and both status facets', () => {
    const s = searchSuggestions('reco', SS, ANCHOR);
    expect(s.some(x => x.term.kind === 'category' && x.term.id === 'reco')).toBe(true);
    // "reco" is not a prefix of cleared/uncleared, so no status here…
    expect(s.some(x => x.term.kind === 'status')).toBe(false);
  });

  it('"cleared" and "unc" surface the status facets', () => {
    expect(searchSuggestions('cleared', SS, ANCHOR).some(x => x.term.kind === 'status' && x.term.value === 'cleared')).toBe(true);
    expect(searchSuggestions('unc', SS, ANCHOR).some(x => x.term.kind === 'status' && x.term.value === 'uncleared')).toBe(true);
  });

  it('"need" surfaces the Needs Category flag', () => {
    expect(searchSuggestions('need', SS, ANCHOR).some(x => x.term.kind === 'needsCategory')).toBe(true);
  });

  it('a bare day "11" offers date and amount facets', () => {
    const s = searchSuggestions('11', SS, ANCHOR);
    const dates = s.filter(x => x.term.kind === 'date');
    expect(dates.map(x => x.term.op)).toEqual(['on', 'onBefore', 'onAfter']);
    expect(dates[0].term.iso).toBe('2026-08-11');
    const amts = s.filter(x => x.term.kind === 'amount');
    // outflow ×3 + inflow ×3
    expect(amts.length).toBe(6);
    expect(amts[0].term.value).toBe(11);
  });

  it('"inflo" surfaces inflow amount facets at 0.00', () => {
    const s = searchSuggestions('inflo', SS, ANCHOR);
    const amts = s.filter(x => x.term.kind === 'amount');
    expect(amts.every(x => x.term.side === 'inflow')).toBe(true);
    expect(amts.every(x => x.term.value === 0)).toBe(true);
  });

  it('every suggestion carries a term and a stable key', () => {
    const s = searchSuggestions('11', SS, ANCHOR);
    expect(s.every(x => x.key && x.term)).toBe(true);
    expect(new Set(s.map(x => x.key)).size).toBe(s.length);
  });

  it('always ends with the four field facets, any-field first', () => {
    const fields = searchSuggestions('xyz', SS, ANCHOR).filter(x => x.term.kind === 'field');
    expect(fields.map(x => x.term.field)).toEqual(['any', 'payee', 'category', 'memo']);
  });

  it('offers a card by nickname and by last4, as an account-kind term', () => {
    const byName = searchSuggestions('faysal', SS, ANCHOR).find(x => x.term.id === 'c1');
    expect(byName.term.kind).toBe('account');
    expect(byName.main).toBe('Faysal Visa ••4021');
    expect(searchSuggestions('4021', SS, ANCHOR).some(x => x.term.id === 'c1')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(searchSuggestions('  BANK  ', SS, ANCHOR).filter(x => x.term.kind === 'account').map(x => x.main))
      .toEqual(['BankIslami', 'Allied Bank']);
  });

  it('offers NO date facets when no anchor is given (but still amount facets)', () => {
    const s = searchSuggestions('11', SS);
    expect(s.some(x => x.term.kind === 'date')).toBe(false);
    expect(s.filter(x => x.term.kind === 'amount').length).toBe(6);
  });

  it('caps the entity groups (accounts + categories share one budget) without burying fixed facets', () => {
    const many = {
      accounts: Array.from({ length: 6 }, (_, i) => ({ id: 'a' + i, nickname: 'Xbank ' + i })),
      cards: [],
      categories: Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, name: 'Xbank cat ' + i })),
    };
    const s = searchSuggestions('xbank', many, ANCHOR, 4);
    const entities = s.filter(x => x.term.kind === 'account' || x.term.kind === 'category');
    expect(entities.length).toBe(4); // shared cap across both kinds, not 4 each
    // the always-present field facets survive the cap
    expect(s.filter(x => x.term.kind === 'field').length).toBe(4);
  });
});

// --- Review hardening: the fixes from PR #218 code review --------------------

describe('txNeedsCategory — mirrors txRowOf (resolves the category)', () => {
  it('is true for an uncategorised categorizable row', () => {
    expect(txNeedsCategory(T({ category: null, type: 'expense' }), SS)).toBe(true);
    expect(txNeedsCategory(T({ category: null, type: 'income' }), SS)).toBe(true);
    expect(txNeedsCategory(T({ category: null, type: 'refund' }), SS)).toBe(true);
  });
  it('is true for a row pointing at a DELETED category id (the divergence bug)', () => {
    // txRowOf shows the "needs category" pill here (!resolvedCat); the facet
    // must agree, which !t.category alone would not.
    expect(txNeedsCategory(T({ category: 'ghost-deleted', type: 'expense' }), SS)).toBe(true);
    expect(matchesTerm(T({ category: 'ghost-deleted', type: 'expense' }), { kind: 'needsCategory' }, SS)).toBe(true);
  });
  it('is false for a categorised row and for non-categorizable types', () => {
    expect(txNeedsCategory(T({ category: 'dine' }), SS)).toBe(false);
    expect(txNeedsCategory(T({ category: null, type: 'transfer' }), SS)).toBe(false);
  });
});

describe('txFlows — account-scoped transfer perspective and unknown types', () => {
  it('all-accounts view puts a transfer on the outflow side', () => {
    expect(txFlows(T({ type: 'transfer', amount: 200, accountId: 'a1', toAccountId: 'a2' })))
      .toEqual({ outflow: 200, inflow: null });
  });
  it('scoped to the DESTINATION account, the transfer is that account inflow', () => {
    const tr = T({ type: 'transfer', amount: 200, accountId: 'a1', toAccountId: 'a2' });
    expect(txFlows(tr, 'a2')).toEqual({ outflow: null, inflow: 200 }); // money arrived at a2
    expect(txFlows(tr, 'a1')).toEqual({ outflow: 200, inflow: null }); // money left a1
  });
  it('handles cardAdjustment like adjustment, and excludes an unknown type', () => {
    expect(txFlows(T({ type: 'cardAdjustment', amount: -12 }))).toEqual({ outflow: 12, inflow: null });
    expect(txFlows(T({ type: 'mystery', amount: 5 }))).toEqual({ outflow: null, inflow: null });
  });
  it('an incoming-transfer amount filter matches in the destination register', () => {
    const tr = T({ type: 'transfer', amount: 200, accountId: 'a1', toAccountId: 'a2' });
    expect(matchesTerm(tr, { kind: 'amount', side: 'inflow', op: 'eq', value: 200 }, SS, 'a2')).toBe(true);
    expect(matchesTerm(tr, { kind: 'amount', side: 'inflow', op: 'eq', value: 200 }, SS)).toBe(false); // all-accounts
  });
});

describe('matchesTerm — fails closed and guards malformed terms', () => {
  it('an unknown term kind matches NOTHING (never everything)', () => {
    expect(matchesTerm(T(), { kind: 'bogus-facet' }, SS)).toBe(false);
  });
  it('every kind searchSuggestions can emit is a handled (non-default) kind', () => {
    // Exhaustiveness guard: a query touching every family, plus cards/status.
    const handled = new Set(['field', 'account', 'category', 'status', 'needsCategory', 'date', 'amount']);
    const kinds = new Set();
    for (const q of ['bank', 'rent', 'faysal', 'cleared', 'unc', 'need', '11', 'inflo']) {
      for (const s of searchSuggestions(q, SS, ANCHOR)) kinds.add(s.term.kind);
    }
    for (const k of kinds) expect(handled.has(k)).toBe(true);
    // and every handled kind actually appeared (so the guard isn't vacuous)
    expect(kinds.size).toBe(handled.size);
  });
  it('a date term against a dateless row matches nothing', () => {
    expect(matchesTerm(T({ date: '' }), { kind: 'date', op: 'on', iso: '2026-08-11' }, SS)).toBe(false);
  });
});
