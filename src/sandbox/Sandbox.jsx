import { useState } from 'react';
import EditNamePopover from '../ui/plan/EditNamePopover.jsx';
import RadixEditNamePopover from './RadixEditNamePopover.jsx';

// Isolated Radix experiment harness (dev-only, served at /sandbox.html).
// Renders the hand-rolled EditNamePopover and its Radix reimplementation
// side-by-side so we can compare BEHAVIOR (positioning, flip, Escape,
// outside-click, focus return, ARIA) with the look held identical.

// A clickable ledger-style name, mirroring how the name reads in the Plan table.
const triggerStyle = {
  border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer',
  fontSize: 15, fontWeight: 600, padding: '4px 2px', font: 'inherit',
  textDecoration: 'underline', textDecorationStyle: 'dotted',
  textUnderlineOffset: 3, textDecorationColor: 'var(--border)',
};

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 20, flex: '1 1 0', minWidth: 240,
};
const cardLabel = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' };

export default function Sandbox() {
  const [dark, setDark] = useState(false);
  const [log, setLog] = useState([]);
  const push = m => setLog(l => [m, ...l].slice(0, 10));

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else document.documentElement.removeAttribute('data-theme');
    setDark(!dark);
  };

  // Stub store writes — log to the on-screen panel (never alert(): a modal
  // dialog would freeze browser automation).
  const handlers = which => ({
    onRename: v => push(`${which} · rename → "${v}"`),
    onHide: () => push(`${which} · hide`),
    onDelete: () => push(`${which} · delete`),
  });

  const pair = whereLabel => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={card}>
        <p style={cardLabel}>Hand-rolled (current)</p>
        <EditNamePopover name="Groceries" title="Rename category" triggerStyle={triggerStyle}
          {...handlers(`hand-rolled/${whereLabel}`)}>Groceries</EditNamePopover>
      </div>
      <div style={card}>
        <p style={cardLabel}>Radix (experiment)</p>
        <RadixEditNamePopover name="Groceries" title="Rename category" triggerStyle={triggerStyle}
          {...handlers(`radix/${whereLabel}`)}>Groceries</RadixEditNamePopover>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '32px 28px 120px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>UI Sandbox — Radix Popover</h1>
          <button onClick={toggleTheme} className="hv-soft"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {dark ? '☀ Light' : '☾ Dark'}
          </button>
        </header>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
          Isolated harness — no auth, no router, no store. The Radix card must match the hand-rolled
          one on open/close, <strong>Escape</strong>, outside-click dismiss, focus-return to the
          trigger, and collision flip, while staying flat with a single hairline + overlay shadow in
          both themes.
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 0 12px' }}>Default placement (drops below)</h2>
          {pair('top')}
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 0 12px' }}>Activity log</h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minHeight: 96 }}>
            {log.length === 0
              ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Interact with either popover — rename, Hide, or Delete — to log an action here.</span>
              : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {log.map((m, i) => <li key={i} className="tnum" style={{ fontSize: 13, color: i === 0 ? 'var(--text)' : 'var(--muted)' }}>{m}</li>)}
                </ul>}
          </div>
        </section>

        {/* Pinned near the viewport bottom so opening must flip UP — the key
            positioning behavior both implementations claim to handle. */}
        <section style={{ marginTop: '78vh' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 0 12px' }}>Collision flip (near viewport bottom → opens upward)</h2>
          {pair('bottom')}
        </section>
      </div>
    </div>
  );
}
