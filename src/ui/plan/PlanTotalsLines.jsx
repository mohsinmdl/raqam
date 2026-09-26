// "Whole plan" rows — total budget (every month, future included), spent so far
// with a progress bar, remaining, then cash on hand and the part of the budget
// that cash doesn't cover yet. Shared by the desktop Inspector card and the
// phone Assign sheet so the two never drift. Figures come from planTotals.js.
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, padding: '3px 0' };
const muted = { color: 'var(--muted)' };

// `moneyPos` masks with the Ready to Assign eye (maskedPosition), like the RTA
// banner above this card: "Still to fund" / "Cash not yet budgeted" ARE ±RTA,
// so they must hide whenever the banner's figure is hidden.
export default function PlanTotalsLines({ t, money, moneyPos = money }) {
  const over = t.spent > t.budget;
  const pct = Math.round(t.pctSpent * 100);
  return (
    <>
      <div style={row}><span>Total budget</span><span className="tnum">{money(t.budget)}</span></div>
      {/* The percent rides in the label, not after the amount, so every figure
          stays flush right in one column. */}
      <div style={row}>
        <span>Spent so far{t.budget > 0 && <span className="tnum" style={{ ...muted, fontSize: 12 }}> · {pct}%</span>}</span>
        <span className="tnum">{money(t.spent)}</span>
      </div>
      <div role="img" aria-label={`${pct}% of the total budget spent`}
        style={{ height: 6, borderRadius: 999, background: 'var(--track)', overflow: 'hidden', margin: '4px 0 6px' }}>
        <div style={{ height: '100%', width: Math.min(100, Math.max(0, t.pctSpent * 100)) + '%', background: over ? 'var(--neg)' : 'var(--accent)', borderRadius: 999 }} />
      </div>
      <div style={row}>
        <span style={{ fontWeight: 700 }}>Remaining</span>
        <span className="tnum" style={{ fontWeight: 700, color: t.remaining < 0 ? 'var(--neg)' : 'var(--text)' }}>{money(t.remaining)}</span>
      </div>
      {t.covered > 0 && (
        <div style={{ ...row, ...muted, fontSize: 12 }}
          title="Overspending moved from its category to Ready to Assign, so Remaining is Total budget − Spent + this.">
          <span>Overspent (moved to Ready to Assign)</span><span className="tnum">{money(t.covered)}</span>
        </div>
      )}
      <div style={{ ...row, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 7 }}>
        <span>Cash in accounts</span><span className="tnum">{money(t.cash)}</span>
      </div>
      {t.toFund > 0 && (
        <div style={row} title="Assigned money you don't have yet — the Ready to Assign shortfall.">
          <span style={{ color: 'var(--neg)' }}>Still to fund</span>
          <span className="tnum" style={{ color: 'var(--neg)', fontWeight: 600 }}>{moneyPos(t.toFund)}</span>
        </div>
      )}
      {t.unassigned > 0 && (
        <div style={{ ...row, ...muted }}><span>Cash not yet budgeted</span><span className="tnum">{moneyPos(t.unassigned)}</span></div>
      )}
    </>
  );
}
