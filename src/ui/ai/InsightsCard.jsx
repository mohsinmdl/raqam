// U4 insights-digest — the "Generate insights" card on the Reflect Overview tab.
// The CLIENT computes every figure (buildDigestPayload, from the same report
// selectors the tab shows) and sends only aggregates to /digest; the LLM returns
// a narrative. FR-4.3: any FIGURE the card displays is rendered from the client
// `payload`, NEVER from the model's text — the observations are shown verbatim as
// prose, but the stat row underneath is the app's own authoritative numbers.
//
// Ephemeral by design (US-17): the result lives in local component state only —
// regenerate replaces it, and an unmount/reload clears it. Nothing is stored or
// synced. Gated entirely on useAI().enabled (renders nothing when AI is off), and
// any failure degrades to a quiet retry so the rest of Overview is untouched.
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { currentMonth } from '../../lib/dates.js';
import { hasEnoughData } from '../../lib/digestData.js';
import { useAI } from './useAI.js';
import { runDigest } from './insightsFlow.js';

const card = {
  border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
};
const headRow = { display: 'flex', alignItems: 'center', gap: 10 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0, flex: 1 };
const sub = { fontSize: 12, color: 'var(--muted)' };
const primaryBtn = {
  height: 30, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 600, font: 'inherit',
  border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)',
};
const quietBtn = {
  height: 28, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 600, font: 'inherit',
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)',
};

// Integer PKR, unmasked — these are the card's own figures, taken from `payload`.
const pkr = n => 'Rs ' + Number(n || 0).toLocaleString('en-US');

// Presentational core. Pure over (status, result, payload, enough, warming,
// onGenerate) so it renders identically under react-dom/server in tests — no
// hooks, no store. `result` is the model narrative; `payload` is the client's
// authoritative numbers (the ONLY source for any figure shown).
export function InsightsView({ status, result, payload, enough, warming, onGenerate }) {
  return (
    <section aria-label="AI insights" data-testid="insights-card" style={card}>
      <div style={headRow}>
        <h2 style={h2}>Insights</h2>
        {status === 'done' && (
          <button type="button" data-testid="regenerate-insights" className="hv-soft rq-btn-outline" style={quietBtn} onClick={onGenerate}>
            Regenerate
          </button>
        )}
      </div>

      {status === 'idle' && !enough && (
        <div data-testid="insights-empty" style={sub}>
          Not enough data yet — add a few transactions this month and check back.
        </div>
      )}

      {status === 'idle' && enough && (
        <>
          <div style={sub}>A quick read on this month, written from your own numbers.</div>
          <div>
            <button type="button" data-testid="generate-insights" className="hv-accent" style={primaryBtn} onClick={onGenerate}>
              Generate insights
            </button>
          </div>
        </>
      )}

      {status === 'loading' && (
        <div data-testid="insights-loading" style={sub} role="status">
          {warming ? 'Warming up the model…' : 'Thinking…'}
        </div>
      )}

      {status === 'done' && result && (
        <>
          <p data-testid="insights-headline" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {result.headline}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(result.observations || []).map((o, i) => (
              <li key={i} data-testid="insights-observation" style={{ fontSize: 13, color: 'var(--text)' }}>{o}</li>
            ))}
          </ul>
          {payload && payload.stats && (
            // FR-4.3: figures come from the client payload, never the model text.
            <div data-testid="insights-figures" style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
              <span>Spent this month: <strong>{pkr(payload.stats.total)}</strong></span>
              {payload.byCategory && payload.byCategory[0] && (
                <span>Top: {payload.byCategory[0].name} <strong>{pkr(payload.byCategory[0].amt)}</strong></span>
              )}
            </div>
          )}
        </>
      )}

      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={sub}>Couldn’t generate insights right now.</span>
          <button type="button" data-testid="insights-retry" className="hv-soft rq-btn-outline" style={quietBtn} onClick={onGenerate}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}

// Stateful container: gates on enabled, owns the ephemeral result, and wires the
// button to the client-computed digest. All hooks run before the enabled gate.
export default function InsightsCard() {
  const { enabled, warming, digest } = useAI();
  const { data: S } = useStore();
  const [state, setState] = useState({ status: 'idle' });

  if (!enabled) return null;

  const month = currentMonth();
  const enough = hasEnoughData(S, month);

  const generate = async () => {
    setState({ status: 'loading' });
    try {
      const { payload, result } = await runDigest({ S, month, digest });
      setState({ status: 'done', payload, result });
    } catch {
      // US-18: failure never degrades the tab — a quiet retry, nothing thrown.
      setState({ status: 'error' });
    }
  };

  return (
    <InsightsView
      status={state.status}
      result={state.result}
      payload={state.payload}
      enough={enough}
      warming={warming}
      onGenerate={generate}
    />
  );
}
