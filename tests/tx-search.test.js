import { describe, it, expect } from 'vitest';
import { matchesQuery, txHaystack } from '../src/lib/txSearch.js';

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
