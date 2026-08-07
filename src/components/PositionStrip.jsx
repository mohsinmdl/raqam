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

// `trailing` is an optional right-aligned slot — Transactions puts its search
// there; Dashboard passes nothing.
//
// `compact` swaps the full Dashboard strip for a one-line Cleared + Uncleared =
// Working row (Transactions only). It is deliberately much shorter: the month
// figures (opening, change) live on the Dashboard, and this screen just wants
// the balances that a ledger cares about.
export default function PositionStrip({ trailing, compact }) {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money, moneyS } = useMoney();
  const [explain, setExplain] = useState(false);

  const now = nowIso();
  const M = monthMetrics(S, month, now);

  if (compact) {
    const amtColor = n => (n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--muted)');
    // Small "C" chip: filled for cleared, outlined for uncleared — matching the
    // reference. A plain function, not a component, so it never remounts.
    const cBadge = filled => (
      <span aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: 999, fontSize: 9, fontWeight: 700, flex: 'none',
        background: filled ? 'var(--pos)' : 'transparent',
        color: filled ? 'var(--on-pos)' : 'var(--muted)',
        border: filled ? 'none' : '1.5px solid var(--muted)',
      }}>C</span>
    );
    const cell = (amount, label, badge) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span className="tnum" style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: amtColor(amount), whiteSpace: 'nowrap' }}>{money(amount)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{badge}{label}</span>
      </div>
    );
    const op = s => <span aria-hidden="true" style={{ fontSize: 17, color: 'var(--muted)', padding: '0 8px' }}>{s}</span>;
    return (
      <section aria-label="Current position" style={{ ...card, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {cell(M.totalBank, 'Cleared Balance', cBadge(true))}
        {op('+')}
        {cell(M.uncleared, 'Uncleared Balance', cBadge(false))}
        {op('=')}
        {cell(M.working, 'Working Balance', null)}
        {trailing && <div style={{ marginLeft: 'auto', flex: 'none' }}>{trailing}</div>}
      </section>
    );
  }

  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const confirmed = S.snapshots.some(s => s.month === month && s.status === 'confirmed');
  const snapStatusLabel = activeAccts.length === 0 ? 'no accounts yet' : confirmed ? 'confirmed snapshot' : 'snapshot pending review';
  const posAsOf = 'across ' + activeAccts.length + (activeAccts.length === 1 ? ' account' : ' accounts');
  const changeColor = M.change > 0 ? 'var(--pos)' : M.change < 0 ? 'var(--neg)' : 'var(--muted)';
  const pendingNote = M.pendingCount > 0
    ? M.pendingCount + ' uncleared transaction' + (M.pendingCount === 1 ? '' : 's') + ' (' + money(M.pendingTotal) + ') excluded until cleared'
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
          {trailing && <div style={{ marginLeft: 'auto', flex: 'none' }}>{trailing}</div>}
        </div>
      </section>
      <ExplainDialog open={explain} onClose={() => setExplain(false)} />
    </>
  );
}
