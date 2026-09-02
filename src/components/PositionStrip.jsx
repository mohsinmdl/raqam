// The "Current position" strip — the Dashboard's headline numbers, extracted
// so the Transactions screen can show the same section. One source of markup
// means the two screens can never drift apart.
//
// The full Dashboard card is MONTH-scoped (the app-wide balance month):
// opening snapshots exist per month, so "Start of month" and "Change since
// start" have no meaning for an arbitrary range. The compact register strip
// may instead be handed a whole-month `range` (Transactions gates it through
// balanceRange.js) and then walks that window continuously from its first
// month's opening (calc.js rangeBalances) — the same walk the BALANCE column
// prints — so the strip and the column agree by construction. Without a range
// the compact strip behaves exactly as the Dashboard card: balance month.
import { useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { monthMetrics, rangeBalances } from '../lib/calc.js';
import { rangeLabel } from '../lib/dateRange.js';
import ExplainDialog from '../ui/ExplainDialog.jsx';
import MaskPositionEye from '../ui/MaskPositionEye.jsx';

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
//
// `range` (optional, compact + accountId only): a { from, to } pair of
// 'YYYY-MM' months whose first month has an opening snapshot. When given, the
// three figures are walked over that window instead of the balance month.
export default function PositionStrip({ trailing, compact, wide, accountId, range }) {
  const { data: S } = useStore();
  // Every figure this strip shows is a balance (bank total, net worth, card
  // liability, opening, change, cleared/uncleared/working) — none of it is
  // month-flow (income/expenses), so the read clamps to balanceMonth rather
  // than the viewed month — unless the compact strip was handed a vetted
  // `range`, in which case it walks that window (see the file header).
  const { balanceMonth } = useMonth();
  // Both the full Dashboard card and the compact Transactions strip use the
  // position-scoped moneyPos/moneySPos — driven by `maskedPosition` (the eye
  // icon), shared across both surfaces. Everything else app-wide stays on
  // `masked` (the profile "Hide amounts" toggle).
  const { moneyPos, moneySPos } = useMoney();
  const [explain, setExplain] = useState(false);

  // One eye toggle, rendered in both modes (Dashboard card + Transactions
  // strip) and shared with the Plan RTA banner. Every instance flips the same
  // `maskedPosition`, so all the eyes stay in lockstep — masking only these
  // "bigger number" position figures, never the row amounts (`masked`).
  // "balances", not "amounts": the register toolbar has its own eye a few
  // pixels away that hides the ROW amounts (prefs.masked), and both were called
  // "Hide amounts" — two controls, one name, different effects.
  const eyeToggle = <MaskPositionEye label="balances" />;

  const now = nowIso();
  // Range-scoped only for the compact per-account strip that was handed a
  // vetted window; every other caller (Dashboard, All Accounts, no range)
  // reads the balance month exactly as before.
  const ranged = !!(compact && accountId && range);
  const M = ranged
    ? rangeBalances(S, range.from, range.to, now, accountId)
    : monthMetrics(S, balanceMonth, now, accountId);
  // The window the three compact figures cover, named on the strip: a Last-3-
  // months register walks 'Jul – Sep 2026', but the same register on Today or
  // All Dates (no honest seed, balanceRange.js) falls back to the balance
  // month and reads 'Sep 2026'. Without the caption those two states share
  // identical chrome and the user cannot tell which figure they are looking at.
  const windowLabel = ranged ? rangeLabel(range.from, range.to) : rangeLabel(balanceMonth, balanceMonth);

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
        {accountId && (
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', flex: 'none' }}>{windowLabel}</span>
        )}
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
