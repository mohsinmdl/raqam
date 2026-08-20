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
// The three headline columns share one column shell: a centred stat stack with
// a hairline lead-in. `lead` is wider so the balance commands the row.
const colBase = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, paddingLeft: 24, borderLeft: '1px solid var(--border)' };
const statLabel = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 };
const statSub = { fontSize: 11, color: 'var(--muted)', marginTop: 1 };
const statVal = { fontSize: 15, fontWeight: 600, marginTop: 2 };

// `trailing` is an optional right-aligned slot — Transactions puts its search
// there; Dashboard passes nothing.
//
// `compact` swaps the full Dashboard strip for a one-line Cleared + Uncleared =
// Working row (Transactions only). It is deliberately much shorter: the month
// figures (opening, change) live on the Dashboard, and this screen just wants
// the balances that a ledger cares about.
export default function PositionStrip({ trailing, compact, wide, accountId }) {
  const { data: S, prefs, setPrefs } = useStore();
  // Every figure this strip shows is a balance (bank total, net worth, card
  // liability, opening, change, cleared/uncleared/working) — none of it is
  // month-flow (income/expenses), so the whole metrics read clamps to
  // balanceMonth rather than the viewed month.
  const { balanceMonth } = useMonth();
  // Both the full Dashboard card and the compact Transactions strip use the
  // position-scoped moneyPos/moneySPos — driven by `maskedPosition` (the eye
  // icon), shared across both surfaces. Everything else app-wide stays on
  // `masked` (the profile "Hide amounts" toggle).
  const { moneyPos, moneySPos } = useMoney();
  const [explain, setExplain] = useState(false);

  // One eye toggle, rendered in both modes (Dashboard card + Transactions
  // strip). Every instance flips the same `maskedPosition`, so the two eyes
  // stay in lockstep — masking only these "bigger number" position figures.
  const eyeToggle = (
    // "balances", not "amounts": the register toolbar has its own eye a few
    // pixels away that hides the ROW amounts (prefs.masked), and both were
    // called "Hide amounts" — two controls, one name, different effects. This
    // one masks the position figures only, which are balances.
    // No aria-pressed either: the label already names the action, so
    // aria-pressed=false read as "Hide balances, not pressed" while the
    // balances were showing — the inverse of the state it was asserting.
    <button onClick={() => setPrefs({ maskedPosition: !prefs.maskedPosition })} className="hv-soft"
      aria-label={prefs.maskedPosition ? 'Show balances' : 'Hide balances'}
      title={prefs.maskedPosition ? 'Show balances' : 'Hide balances'}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flex: 'none' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {prefs.maskedPosition
          ? <><path d="M17.94 17.94A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a19.8 19.8 0 0 1 4.87-5.62M9.9 4.75A9.9 9.9 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a19.9 19.9 0 0 1-2.24 3.31M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" /></>
          : <><path d="M2 12s3.5-7.5 10-7.5S22 12 22 12s-3.5 7.5-10 7.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  );

  const now = nowIso();
  const M = monthMetrics(S, balanceMonth, now, accountId);

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
        <span className="tnum" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.005em', color: amtColor(amount), whiteSpace: 'nowrap' }}>{moneyPos(amount)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{badge}{label}</span>
      </div>
    );
    const op = s => <span aria-hidden="true" style={{ fontSize: 17, color: 'var(--muted)', padding: '0 8px' }}>{s}</span>;
    // The strip wraps on a phone (390px), and an operator is meaningless
    // stranded at the end of a line: "Cleared + Uncleared" then a bare "="
    // hanging under it. Each operator therefore travels WITH the operand it
    // introduces, in a nowrap group, so the row can only ever break BETWEEN
    // terms — the equation stays readable however many lines it takes.
    const term = (opSym, body) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', flex: 'none', minWidth: 0 }}>
        {op(opSym)}{body}
      </span>
    );
    // Wide mode drops the card frame for a flush strip whose only edge is the
    // single bottom divider between it and the table below.
    const compactCard = wide
      ? { background: 'var(--surface)', borderBottom: '1px solid var(--border)' }
      : card;
    return (
      <section aria-label="Current position" style={{ ...compactCard, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {cell(M.totalBank, 'Cleared Balance', cBadge(true))}
        {term('+', cell(M.uncleared, 'Uncleared Balance', cBadge(false)))}
        {term('=', cell(M.working, 'Working Balance', null))}
        {/* Eye sits just right of the totals it protects; the search slot below
            still pushes to the far right via marginLeft:auto. */}
        <div style={{ marginLeft: 8, display: 'inline-flex', flex: 'none' }}>{eyeToggle}</div>
        {trailing && <div style={{ marginLeft: 'auto', flex: 'none' }}>{trailing}</div>}
      </section>
    );
  }

  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const confirmed = S.snapshots.some(s => s.month === balanceMonth && s.status === 'confirmed');
  const snapStatusLabel = activeAccts.length === 0 ? 'no accounts yet' : confirmed ? 'confirmed snapshot' : 'snapshot pending review';
  const posAsOf = 'across ' + activeAccts.length + (activeAccts.length === 1 ? ' account' : ' accounts');
  const changeColor = M.change > 0 ? 'var(--pos)' : M.change < 0 ? 'var(--neg)' : 'var(--muted)';
  const pendingNote = M.pendingCount > 0
    ? M.pendingCount + ' uncleared transaction' + (M.pendingCount === 1 ? '' : 's') + ' (' + moneyPos(M.pendingTotal) + ') excluded until cleared'
    : null;

  return (
    <>
      {/* The headline "Current position": the balance leads, then a net-worth
          column, then the month's opening/change — three hairline-separated
          columns spanning the full card width. */}
      <section aria-label="Current position" style={{ ...card, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 24 }}>
          <div className="pos-lead" style={{ flex: 1.4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>Total bank balance</span>
              {/* Amount masking lives beside the number it protects; a matching
                  eye also sits on the Transactions strip, both driving the same
                  `maskedPosition` (and reachable on phones, no sidebar needed). */}
              {eyeToggle}
            </div>
            <div className="tnum" style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.02 }}>{moneyPos(M.totalBank)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{posAsOf}</div>
          </div>
          <div className="pos-cols" style={colBase}>
            <div>
              <div style={statLabel}>Net worth</div>
              <div className="tnum" style={statVal}>{moneyPos(M.netWorth)}</div>
              <div style={statSub}>bank minus card debt</div>
            </div>
            <div>
              <div style={statLabel}>Card liability</div>
              <div className="tnum" style={{ ...statVal, color: M.cardLiability > 0 ? 'var(--neg)' : 'var(--muted)' }}>{moneyPos(M.cardLiability)}</div>
              <div style={statSub}>{M.cardLiability > 0 ? 'outstanding on cards' : 'no card debt'}</div>
            </div>
          </div>
          <div className="pos-cols" style={colBase}>
            <div>
              <div style={statLabel}>Start of month</div>
              <div className="tnum" style={statVal}>{moneyPos(M.opening)}</div>
              <div style={statSub}>{snapStatusLabel}</div>
            </div>
            <div>
              <div style={statLabel}>Change since start</div>
              <div className="tnum" style={{ ...statVal, color: changeColor }}>{moneySPos(M.change)}</div>
              <div style={statSub}>vs opening</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setExplain(true)} className="hv-accent-fg" style={linkBtn}>How these are calculated</button>
          {pendingNote && <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 500 }}>{pendingNote}</span>}
          {trailing && <div style={{ marginLeft: 'auto', flex: 'none' }}>{trailing}</div>}
        </div>
      </section>
      <ExplainDialog open={explain} onClose={() => setExplain(false)} />
    </>
  );
}
