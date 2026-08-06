// The "Current position" strip — the Dashboard's headline numbers, extracted
// so the Transactions screen can show the same section. One source of markup
// means the two screens can never drift apart.
//
// Deliberately MONTH-scoped (the header's global month stepper), not scoped to
// the Transactions range: opening snapshots exist per month, so "Start of
// month" and "Change since start" have no meaning for an arbitrary range. The
// numbers here always match the Dashboard exactly.
import { useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { monthMetrics } from '../lib/calc.js';
import ExplainDialog from '../ui/ExplainDialog.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const linkBtn = { border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 };

export default function PositionStrip() {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money, moneyS } = useMoney();
  const [explain, setExplain] = useState(false);

  const now = nowIso();
  const M = monthMetrics(S, month, now);
  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const confirmed = S.snapshots.some(s => s.month === month && s.status === 'confirmed');
  const snapStatusLabel = activeAccts.length === 0 ? 'no accounts yet' : confirmed ? 'confirmed snapshot' : 'snapshot pending review';
  const posAsOf = 'across ' + activeAccts.length + (activeAccts.length === 1 ? ' account' : ' accounts');
  const changeColor = M.change > 0 ? 'var(--pos)' : M.change < 0 ? 'var(--neg)' : 'var(--muted)';
  const pendingNote = M.pendingCount > 0
    ? M.pendingCount + ' pending transaction' + (M.pendingCount === 1 ? '' : 's') + ' (' + money(M.pendingTotal) + ') excluded until cleared'
    : null;

  return (
    <>
      <section aria-label="Current position" style={{ ...card, padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>Total bank balance</div>
            <div className="tnum" style={{ fontSize: 31, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4 }}>{money(M.totalBank)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{posAsOf}</div>
          </div>
          {[
            ['Start of month', money(M.opening), snapStatusLabel, null],
            ['Change since start', moneyS(M.change), 'vs opening', changeColor],
          ].map(([label, val, sub, color]) => (
            <div key={label} style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
              <div className="tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: color || 'var(--text)' }}>{val}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setExplain(true)} className="hv-accent-fg" style={linkBtn}>How these are calculated</button>
          {pendingNote && <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 500 }}>{pendingNote}</span>}
        </div>
      </section>
      <ExplainDialog open={explain} onClose={() => setExplain(false)} />
    </>
  );
}
