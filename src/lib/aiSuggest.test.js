import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import categorizeReq from '../../modal/fixtures/categorize.request.json';
import categorizeResp from '../../modal/fixtures/categorize.response.json';
import {
  EXAMPLE_WINDOW, MIN_HISTORY,
  buildContext, collectTargets, dismissRule, graduationKey,
  normMerchant, recordAccept, validateSuggestions,
} from './aiSuggest.js';

// ---- tiny store builders ---------------------------------------------------
const cat = (id, over = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: 'expense', status: 'active', ...over });
const tx = (id, over = {}) => ({ id, type: 'expense', merchant: 'Shop ' + id, amount: 1000, date: '2026-08-20T10:00:00Z', category: 'groceries', ...over });

function storeWith({ transactions = [], categories, categoryGroups = [], payees = [] } = {}) {
  return {
    transactions,
    categories: categories || [cat('groceries'), cat('fuel'), cat('salary', { type: 'income' })],
    categoryGroups,
    payees,
  };
}

// N categorized txs so the history guard passes by default.
const seed = (n = MIN_HISTORY, over = () => ({})) =>
  Array.from({ length: n }, (_, i) => tx('h' + i, { category: 'groceries', ...over(i) }));

describe('normMerchant', () => {
  it('lowercases, trims, collapses whitespace, strips a leading non-alnum run', () => {
    expect(normMerchant('  IMTIAZ   SUPER  MARKET ')).toBe('imtiaz super market');
    expect(normMerchant('⚡️ Utilities')).toBe('utilities');
    expect(normMerchant('***VISA*** Store')).toBe('visa*** store');
    expect(normMerchant('   ')).toBe('');
    expect(normMerchant(null)).toBe('');
  });
});

describe('buildContext — history guard (BR-U1-1)', () => {
  it('returns null below MIN_HISTORY categorized txs', () => {
    const S = storeWith({ transactions: seed(MIN_HISTORY - 1) });
    expect(buildContext(S)).toBeNull();
  });

  it('returns a context at exactly MIN_HISTORY', () => {
    const S = storeWith({ transactions: seed(MIN_HISTORY) });
    const ctx = buildContext(S);
    expect(ctx).not.toBeNull();
    expect(ctx.categories.map(c => c.id).sort()).toEqual(['fuel', 'groceries', 'salary']);
  });

  it('does not count txs whose category is missing or archived', () => {
    const cats = [cat('groceries'), cat('fuel'), cat('gone', { status: 'archived' })];
    const good = seed(MIN_HISTORY - 1, () => ({ category: 'groceries' }));
    const archived = Array.from({ length: 5 }, (_, i) => tx('a' + i, { category: 'gone' }));
    const orphan = Array.from({ length: 5 }, (_, i) => tx('o' + i, { category: 'deleted-id' }));
    const S = storeWith({ transactions: [...good, ...archived, ...orphan], categories: cats });
    // MIN_HISTORY-1 valid → still below the guard.
    expect(buildContext(S)).toBeNull();
  });
});

describe('buildContext — examples', () => {
  it('caps the example window at EXAMPLE_WINDOW most-recent', () => {
    const many = Array.from({ length: EXAMPLE_WINDOW + 50 }, (_, i) =>
      tx('m' + i, { category: 'groceries', date: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z` }));
    const S = storeWith({ transactions: many });
    const ctx = buildContext(S);
    expect(ctx.examples.length).toBe(EXAMPLE_WINDOW);
  });

  it('drops empty-merchant examples and stamps the category type', () => {
    const rows = [
      ...seed(MIN_HISTORY, () => ({ merchant: 'Metro', category: 'groceries' })),
      tx('blank', { merchant: '   ', category: 'groceries' }),
      tx('inc', { merchant: 'ACME Payroll', category: 'salary', type: 'income', amount: 50000 }),
    ];
    const S = storeWith({ transactions: rows });
    const ctx = buildContext(S);
    expect(ctx.examples.every(e => e.merchant.length > 0)).toBe(true);
    const inc = ctx.examples.find(e => e.categoryId === 'salary');
    expect(inc.type).toBe('income');
  });

  it('resolves group name from categoryGroups', () => {
    const cats = [cat('groceries', { groupId: 'g1' }), cat('fuel')];
    const S = storeWith({ transactions: seed(MIN_HISTORY), categories: cats, categoryGroups: [{ id: 'g1', name: 'Needs' }] });
    const ctx = buildContext(S);
    expect(ctx.categories.find(c => c.id === 'groceries').group).toBe('Needs');
    expect(ctx.categories.find(c => c.id === 'fuel').group).toBeNull();
  });
});

describe('collectTargets (L2)', () => {
  const base = () => seed(MIN_HISTORY); // history so a real run would have context

  it('keeps only visible needs-category rows, shaped and normalized', () => {
    const targets = [
      tx('t1', { merchant: 'IMTIAZ', category: null, amount: 5420, date: '2026-08-24T09:00:00Z' }),
      tx('t2', { merchant: 'Shell', category: null }),
    ];
    const S = storeWith({ transactions: [...base(), ...targets] });
    const got = collectTargets(S, ['t1', 't2', 'not-visible']);
    expect(got.map(t => t.id).sort()).toEqual(['t1', 't2']);
    const t1 = got.find(t => t.id === 't1');
    expect(t1).toEqual({ id: 't1', merchant: 'imtiaz', amount: 5420, type: 'expense', date: '2026-08-24' });
  });

  it('filters by type (refund → expense domain, income → income)', () => {
    const targets = [
      tx('r1', { merchant: 'Refunded', category: null, type: 'refund' }),
      tx('i1', { merchant: 'Bonus', category: null, type: 'income' }),
    ];
    const S = storeWith({ transactions: [...base(), ...targets] });
    const got = collectTargets(S, ['r1', 'i1']);
    expect(got.find(t => t.id === 'r1').type).toBe('expense');
    expect(got.find(t => t.id === 'i1').type).toBe('income');
  });

  it('excludes empty-merchant and already-categorized rows', () => {
    const targets = [
      tx('blank', { merchant: '  ', category: null }),
      tx('done', { merchant: 'Has Cat', category: 'groceries' }),
    ];
    const S = storeWith({ transactions: [...base(), ...targets] });
    expect(collectTargets(S, ['blank', 'done'])).toEqual([]);
  });

  it("excludes a payee that already has an active autoCategorize rule (BR-U1-19)", () => {
    const targets = [tx('ruled', { merchant: 'Careem', category: null })];
    const S = storeWith({
      transactions: [...base(), ...targets],
      payees: [{ id: 'p1', name: 'Careem', autoCategorize: true, autoCategoryId: 'fuel' }],
    });
    expect(collectTargets(S, ['ruled'])).toEqual([]);
  });
});

describe('validateSuggestions (L5 / US-8)', () => {
  const S = storeWith({
    transactions: [
      tx('t1', { type: 'expense', category: null }),
      tx('t2', { type: 'income', category: null }),
    ],
    categories: [cat('groceries'), cat('fuel'), cat('salary', { type: 'income' }), cat('old', { status: 'archived' })],
  });

  it('drops foreign / archived / type-mismatched ids and caps at 2, sorted desc', () => {
    const map = {
      t1: [
        { categoryId: 'groceries', confidence: 0.5 },
        { categoryId: 'fuel', confidence: 0.9 },
        { categoryId: 'salary', confidence: 0.99 }, // wrong type for an expense tx
        { categoryId: 'old', confidence: 0.99 },    // archived
        { categoryId: 'ghost', confidence: 0.99 },  // not present
      ],
    };
    const out = validateSuggestions(map, S);
    expect(out.t1.map(s => s.categoryId)).toEqual(['fuel', 'groceries']); // sorted, ≤2
  });

  it('drops suggestions for txs not present in the store', () => {
    expect(validateSuggestions({ nope: [{ categoryId: 'groceries', confidence: 1 }] }, S)).toEqual({});
  });

  it('keeps an income suggestion only for an income tx', () => {
    const out = validateSuggestions({ t2: [{ categoryId: 'salary', confidence: 0.8 }, { categoryId: 'groceries', confidence: 0.9 }] }, S);
    expect(out.t2.map(s => s.categoryId)).toEqual(['salary']);
  });

  // fast-check property: the output is always a subset of active-plan category
  // ids of the matching type — never a foreign or wrong-type id.
  it('property: output ⊆ active matching-type category ids', () => {
    const anyId = fc.constantFrom('groceries', 'fuel', 'salary', 'old', 'ghost', 'x123');
    const sugg = fc.record({ categoryId: anyId, confidence: fc.double({ min: 0, max: 1, noNaN: true }) });
    fc.assert(fc.property(
      fc.dictionary(fc.constantFrom('t1', 't2', 'unknown'), fc.array(sugg, { maxLength: 6 })),
      map => {
        const out = validateSuggestions(map, S);
        for (const [txId, list] of Object.entries(out)) {
          const t = S.transactions.find(x => x.id === txId);
          expect(t).toBeTruthy();
          const want = t.type === 'income' ? 'income' : 'expense';
          expect(list.length).toBeLessThanOrEqual(2);
          for (const s of list) {
            const c = S.categories.find(x => x.id === s.categoryId);
            expect(c && c.status !== 'archived' && c.type === want).toBe(true);
          }
        }
      },
    ));
  });
});

describe('recordAccept / graduation (L7)', () => {
  const t = tx('x', { merchant: 'Imtiaz Super Market' });
  const key = graduationKey('Imtiaz Super Market', 'groceries');

  it('increments the accept counter for the payee|category pair', () => {
    const r1 = recordAccept({}, t, 'groceries');
    expect(r1.prefsPatch.aiAcceptCounts[key]).toBe(1);
    expect(r1.offer).toBeNull();
    const r2 = recordAccept({ aiAcceptCounts: r1.prefsPatch.aiAcceptCounts }, t, 'groceries');
    expect(r2.prefsPatch.aiAcceptCounts[key]).toBe(2);
    expect(r2.offer).toBeNull();
  });

  it('surfaces a one-time offer on the 3rd accept (BR-U1-14)', () => {
    const r3 = recordAccept({ aiAcceptCounts: { [key]: 2 } }, t, 'groceries');
    expect(r3.prefsPatch.aiAcceptCounts[key]).toBe(3);
    expect(r3.offer).toEqual({ payeeName: 'Imtiaz Super Market', categoryId: 'groceries' });
    // A 4th accept does not re-offer.
    const r4 = recordAccept({ aiAcceptCounts: { [key]: 3 } }, t, 'groceries');
    expect(r4.offer).toBeNull();
  });

  it('does not offer when the pair was previously dismissed (BR-U1-16)', () => {
    const prefs = { aiAcceptCounts: { [key]: 2 }, aiRuleDismissed: { [key]: true } };
    const r = recordAccept(prefs, t, 'groceries');
    expect(r.offer).toBeNull();
  });

  it('never counts an empty-merchant tx toward graduation (BR-U1-18)', () => {
    const r = recordAccept({}, tx('blank', { merchant: '   ' }), 'groceries');
    expect(r.prefsPatch).toEqual({});
    expect(r.offer).toBeNull();
  });

  it('dismissRule sets the per-pair flag', () => {
    expect(dismissRule({}, key)).toEqual({ aiRuleDismissed: { [key]: true } });
    expect(dismissRule({ aiRuleDismissed: { other: true } }, key).aiRuleDismissed).toEqual({ other: true, [key]: true });
  });
});

// ---- wire-shape lockstep with the shared fixtures --------------------------
describe('fixture lockstep (contract)', () => {
  it('buildContext output matches the fixture request context shape', () => {
    // A store engineered so buildContext reproduces the fixture's context.
    const cats = [
      cat('groceries', { name: 'Groceries', groupId: 'needs' }),
      cat('fuel', { name: 'Fuel', groupId: 'needs' }),
    ];
    const rows = [
      tx('e1', { merchant: 'IMTIAZ SUPER MARKET', amount: 3200, category: 'groceries' }),
      tx('e2', { merchant: 'SHELL', amount: 6000, category: 'fuel' }),
      ...seed(MIN_HISTORY - 2, i => ({ merchant: 'Filler ' + i, category: 'groceries' })),
    ];
    const S = storeWith({ transactions: rows, categories: cats, categoryGroups: [{ id: 'needs', name: 'Needs' }] });
    const ctx = buildContext(S);
    const fx = categorizeReq.context;
    // Example objects carry exactly the fixture keys.
    expect(Object.keys(ctx.examples[0]).sort()).toEqual(Object.keys(fx.examples[0]).sort());
    expect(Object.keys(ctx.categories[0]).sort()).toEqual(Object.keys(fx.categories[0]).sort());
    const g = ctx.examples.find(e => e.merchant === 'imtiaz super market');
    expect(g).toMatchObject({ amount: 3200, type: 'expense', categoryId: 'groceries' });
    expect(ctx.categories.find(c => c.id === 'groceries')).toEqual({ id: 'groceries', name: 'Groceries', group: 'Needs', type: 'expense' });
  });

  it('collectTargets output matches the fixture TargetTx shape', () => {
    const S = storeWith({ transactions: [...seed(MIN_HISTORY), tx('t1', { merchant: 'IMTIAZ', amount: 5420, category: null, date: '2026-08-24T00:00:00Z' })] });
    const [target] = collectTargets(S, ['t1']);
    expect(Object.keys(target).sort()).toEqual(Object.keys(categorizeReq.transactions[0]).sort());
  });

  it('validateSuggestions consumes the fixture response shape', () => {
    const S = storeWith({ transactions: [tx('t1', { category: null })], categories: [cat('groceries', { name: 'Groceries' })] });
    const out = validateSuggestions(categorizeResp.suggestions, S);
    expect(out.t1).toEqual([{ categoryId: 'groceries', confidence: 0.91 }]);
  });
});
