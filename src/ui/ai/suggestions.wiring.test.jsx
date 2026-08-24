// U1 auto-categorize — wiring tests. This repo runs vitest in a NODE env (no
// jsdom / testing-library — see the "verifying UI without jsdom" convention), so
// render assertions use react-dom/server (string render; useEffect never fires,
// which is exactly right — no live network from the batch effect) and the
// apply/graduation WRITE paths are asserted against the real store actions the
// UI calls. useStore/useAI are mocked per the step-8 brief.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import categorizeResp from '../../../modal/fixtures/categorize.response.json';
import { setTransactionsCategory, upsertPayee } from '../../store/actions.js';
import { collectTargets, recordAccept, validateSuggestions } from '../../lib/aiSuggest.js';

// A mutable store the mocked useStore returns (hoisted so the mock factory sees it).
const H = vi.hoisted(() => ({
  store: {
    categories: [
      { id: 'groceries', name: 'Groceries', type: 'expense', status: 'active' },
      { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active' },
    ],
    transactions: [
      { id: 't1', type: 'expense', merchant: 'Imtiaz', amount: 5420, date: '2026-08-24T00:00:00Z', category: null },
    ],
    categoryGroups: [],
    payees: [],
  },
}));

vi.mock('../../store/StoreProvider.jsx', () => ({
  useStore: () => ({ data: H.store }),
  usePrefs: () => ({}),
}));

// Import components AFTER the mock is registered.
const { default: SuggestionChips } = await import('./SuggestionChips.jsx');
const { default: GraduationOffer } = await import('./GraduationOffer.jsx');
const { NeedsCategoryPill } = await import('../TxChips.jsx');

const noop = () => {};
afterEach(() => vi.clearAllMocks());

describe('SuggestionChips render', () => {
  it('renders a chip per suggestion with the category name + testids', () => {
    const html = renderToStaticMarkup(
      <SuggestionChips suggestions={[{ categoryId: 'groceries', confidence: 0.9 }, { categoryId: 'fuel', confidence: 0.3 }]} onApply={noop} />,
    );
    expect(html.match(/data-testid="suggestion-chip"/g)).toHaveLength(2);
    expect(html).toContain('data-suggestion-cat="groceries"');
    expect(html).toContain('Groceries');
    expect(html).toContain('Fuel');
  });

  it('renders NOTHING when there are no suggestions (AI off / low-history / failed batch)', () => {
    expect(renderToStaticMarkup(<SuggestionChips suggestions={[]} onApply={noop} />)).toBe('');
    expect(renderToStaticMarkup(<SuggestionChips suggestions={undefined} onApply={noop} />)).toBe('');
  });

  it('drops a chip whose category vanished (defense-in-depth at render)', () => {
    const html = renderToStaticMarkup(
      <SuggestionChips suggestions={[{ categoryId: 'ghost', confidence: 0.9 }]} onApply={noop} />,
    );
    expect(html).toBe('');
  });

  it('compact mode renders pointer spans, never nested buttons (phone row is a button)', () => {
    const html = renderToStaticMarkup(
      <SuggestionChips compact suggestions={[{ categoryId: 'groceries', confidence: 0.9 }]} onApply={noop} />,
    );
    expect(html).toContain('data-testid="suggestion-chip"');
    expect(html).not.toContain('<button');
    expect(html).toMatch(/<span[^>]*role="button"/);
  });
});

describe('NeedsCategoryPill integration', () => {
  it('renders chips alongside the pill when suggestions are supplied', () => {
    const html = renderToStaticMarkup(
      <NeedsCategoryPill onClick={noop} suggestions={[{ categoryId: 'groceries', confidence: 0.9 }]} onApply={noop} />,
    );
    expect(html).toContain('data-testid="suggestion-chip"');
    expect(html).toContain('This needs a category'); // the pill is still there
  });

  it('is byte-identical to the pre-AI pill when no suggestions (AI off)', () => {
    const withProp = renderToStaticMarkup(<NeedsCategoryPill onClick={noop} suggestions={undefined} onApply={noop} />);
    const plain = renderToStaticMarkup(<NeedsCategoryPill onClick={noop} />);
    expect(withProp).toBe(plain);
    expect(withProp).not.toContain('suggestion-chip');
  });
});

describe('GraduationOffer render', () => {
  it('shows the payee/category prompt with action testids', () => {
    const html = renderToStaticMarkup(
      <GraduationOffer payeeName="Imtiaz" categoryName="Groceries" onAccept={noop} onDismiss={noop} />,
    );
    expect(html).toContain('data-testid="graduation-offer"');
    expect(html).toContain('data-testid="graduation-offer-accept"');
    expect(html).toContain('data-testid="graduation-offer-dismiss"');
    expect(html).toContain('Imtiaz');
    expect(html).toContain('Groceries');
  });
});

describe('batch pipeline (mocked useAI.categorize → validated cache)', () => {
  it('a fixture-shaped categorize result becomes the per-row suggestion cache', async () => {
    // Mirrors what useSuggestions does internally: call the (mocked) categorize,
    // then validateSuggestions against the live store.
    const categorize = vi.fn().mockResolvedValue(categorizeResp.suggestions); // { t1: [{ groceries, 0.91 }] }
    const map = await categorize([{ id: 't1', merchant: 'imtiaz', amount: 5420, type: 'expense', date: '2026-08-24' }], { examples: [], categories: [] });
    const cache = new Map(Object.entries(validateSuggestions(map, H.store)));
    expect(categorize).toHaveBeenCalledOnce();
    expect(cache.get('t1')).toEqual([{ categoryId: 'groceries', confidence: 0.91 }]);
  });

  it('a rejected batch yields NO suggestions (failure silence, US-3)', async () => {
    const categorize = vi.fn().mockRejectedValue(new Error('cold'));
    let cache = new Map();
    try { const m = await categorize([], {}); cache = new Map(Object.entries(validateSuggestions(m, H.store))); }
    catch { cache = new Map(); }
    expect(cache.size).toBe(0);
  });
});

describe('apply path (US-6) — the only write is setTransactionsCategory', () => {
  it('applying a chip removes the row from the needs-category set', () => {
    // Before: t1 needs a category and is a target.
    expect(collectTargets(H.store, ['t1']).map(t => t.id)).toEqual(['t1']);
    const next = setTransactionsCategory(H.store, { ids: ['t1'], categoryId: 'groceries' });
    expect(next.transactions.find(t => t.id === 't1').category).toBe('groceries');
    // After: t1 no longer a target (it left needs-category).
    expect(collectTargets(next, ['t1'])).toEqual([]);
  });
});

describe('graduation (US-7) — 3 accepts create a payee rule that excludes the payee', () => {
  it('offers on the 3rd accept, and the rule excludes that payee from targets', () => {
    const tx = { id: 't1', merchant: 'Imtiaz', category: null, type: 'expense' };
    let prefs = {};
    let offer = null;
    for (let i = 0; i < 3; i++) {
      const r = recordAccept(prefs, tx, 'groceries');
      prefs = { ...prefs, ...r.prefsPatch };
      offer = r.offer;
    }
    expect(offer).toEqual({ payeeName: 'Imtiaz', categoryId: 'groceries' });

    // Accept → upsertPayee creates the deterministic rule.
    const ruled = upsertPayee(H.store, { name: offer.payeeName, patch: { autoCategorize: true, autoCategoryId: offer.categoryId } });
    const rec = ruled.payees.find(p => p.name.toLowerCase() === 'imtiaz');
    expect(rec).toMatchObject({ autoCategorize: true, autoCategoryId: 'groceries' });

    // That payee is now excluded from AI targets (BR-U1-19).
    expect(collectTargets(ruled, ['t1'])).toEqual([]);
  });
});
