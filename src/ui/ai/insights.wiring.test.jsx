// U4 insights-digest — wiring (Step 8). Node env, no jsdom: the async flow
// (runDigest) is driven directly with a fake `digest` (standing in for useAI),
// and the presentational states are asserted via react-dom/server on the pure
// InsightsView. The stateful container is checked only for its enabled gate.
//
// Covers: idle → generate → renders the FIXTURE headline + observations; a
// rejected digest → the card shows Retry and never throws; regenerate replaces
// the prior output; and nothing renders when AI is disabled.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import digestReq from '../../../modal/fixtures/digest.request.json';
import digestResp from '../../../modal/fixtures/digest.response.json';
import { runDigest } from './insightsFlow.js';

// A store whose CUR month has spending, so buildDigestPayload produces a real
// payload inside runDigest. Anchored to the real current month like reports.test.
import { currentMonth, addMonths } from '../../lib/dates.js';
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);
const S = {
  categories: [{ id: 'groc', name: 'Groceries', color: '#0F766E', type: 'expense', status: 'active' }],
  categoryGroups: [], budgets: [], recurring: [], audit: [], cards: [],
  accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
  snapshots: [{ accountId: 'a1', month: CUR, amount: 100000, status: 'confirmed' }],
  transactions: [
    { id: 'c1', status: 'cleared', type: 'expense', amount: 88000, category: 'groc', merchant: 'Alfatah', accountId: 'a1', date: CUR + '-10T12:00' },
    { id: 'p1', status: 'cleared', type: 'expense', amount: 61000, category: 'groc', merchant: 'Imtiaz', accountId: 'a1', date: PREV + '-10T12:00' },
  ],
};

const { InsightsView } = await import('./InsightsCard.jsx');

afterEach(() => vi.clearAllMocks());

describe('runDigest — client-computed payload → model narrative', () => {
  it('idle → generate: sends aggregates and returns the fixture narrative', async () => {
    const digest = vi.fn().mockResolvedValue(digestResp);
    const { payload, result } = await runDigest({ S, month: CUR, digest });

    expect(digest).toHaveBeenCalledOnce();
    // Only aggregates cross the wire — never a raw transactions array (FR-4.3).
    const sent = digest.mock.calls[0][0];
    expect(sent).not.toHaveProperty('transactions');
    expect(JSON.stringify(sent)).not.toMatch(/"transactions"/);
    expect(sent.month).toBe(CUR);
    expect(sent.stats.total).toBe(88000);

    expect(result).toEqual(digestResp);
    expect(payload.stats.total).toBe(88000);
  });

  it('a rejected digest propagates (the card catches it) — payload was still client-built', async () => {
    const digest = vi.fn().mockRejectedValue(new Error('cold'));
    await expect(runDigest({ S, month: CUR, digest })).rejects.toThrow();
    // The client still assembled + sent an aggregates-only body before failing.
    expect(JSON.stringify(digest.mock.calls[0][0])).not.toMatch(/"transactions"/);
  });

  it('regenerate replaces prior output (second call wins)', async () => {
    const first = { headline: 'First read', observations: ['a'] };
    const second = { headline: 'Second read', observations: ['b'] };
    const digest = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const r1 = await runDigest({ S, month: CUR, digest });
    const r2 = await runDigest({ S, month: CUR, digest });
    expect(r1.result).toEqual(first);
    expect(r2.result).toEqual(second); // replaces
    expect(digest).toHaveBeenCalledTimes(2);
  });
});

describe('InsightsView — presentational states', () => {
  it('idle (enough data) shows the Generate button, no narrative', () => {
    const html = renderToStaticMarkup(<InsightsView status="idle" enough onGenerate={() => {}} />);
    expect(html).toContain('data-testid="generate-insights"');
    expect(html).not.toContain('data-testid="insights-headline"');
  });

  it('idle (not enough data) shows the empty state, no Generate button', () => {
    const html = renderToStaticMarkup(<InsightsView status="idle" enough={false} onGenerate={() => {}} />);
    expect(html).toContain('data-testid="insights-empty"');
    expect(html).not.toContain('data-testid="generate-insights"');
  });

  it('done renders the fixture headline + observations; figures come from the client payload, not the model text', () => {
    const html = renderToStaticMarkup(
      <InsightsView status="done" result={digestResp} payload={digestReq} enough onGenerate={() => {}} />,
    );
    expect(html).toContain('data-testid="insights-headline"');
    expect(html).toContain(digestResp.headline);
    expect(html.match(/data-testid="insights-observation"/g)).toHaveLength(digestResp.observations.length);
    digestResp.observations.forEach(o => expect(html).toContain(o));
    // Figures are rendered from payload.stats.total (245000 → "Rs 245,000"),
    // never lifted from the model's prose.
    expect(html).toContain('data-testid="insights-figures"');
    expect(html).toContain('Rs 245,000');
    expect(html).toContain('regenerate-insights');
  });

  it('error shows a quiet Retry, not a crash', () => {
    const html = renderToStaticMarkup(<InsightsView status="error" onGenerate={() => {}} />);
    expect(html).toContain('data-testid="insights-retry"');
    expect(html).toContain('Retry');
    expect(html).not.toContain('data-testid="insights-headline"');
  });
});

describe('InsightsCard container — enabled gate', () => {
  it('renders nothing when AI is disabled', async () => {
    vi.resetModules();
    vi.doMock('./useAI.js', () => ({ useAI: () => ({ enabled: false, warming: false, digest: vi.fn() }) }));
    vi.doMock('../../store/StoreProvider.jsx', () => ({ useStore: () => ({ data: S }) }));
    const { default: InsightsCard } = await import('./InsightsCard.jsx');
    expect(renderToStaticMarkup(<InsightsCard />)).toBe('');
    vi.doUnmock('./useAI.js');
    vi.doUnmock('../../store/StoreProvider.jsx');
  });

  it('renders the card (idle) when AI is enabled', async () => {
    vi.resetModules();
    vi.doMock('./useAI.js', () => ({ useAI: () => ({ enabled: true, warming: false, digest: vi.fn() }) }));
    vi.doMock('../../store/StoreProvider.jsx', () => ({ useStore: () => ({ data: S }) }));
    const { default: InsightsCard } = await import('./InsightsCard.jsx');
    const html = renderToStaticMarkup(<InsightsCard />);
    expect(html).toContain('data-testid="insights-card"');
    expect(html).toContain('data-testid="generate-insights"'); // CUR month has spending → enough
    vi.doUnmock('./useAI.js');
    vi.doUnmock('../../store/StoreProvider.jsx');
  });
});
