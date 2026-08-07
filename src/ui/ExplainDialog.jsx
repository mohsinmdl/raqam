import { useEffect } from 'react';
import FocusTrap from './FocusTrap.jsx';

// "How these numbers are calculated" — ported from the prototype (template 762-774,
// rows from script 1237-1247).
const ROWS = [
  { term: 'Total bank balance', def: 'Sum of every active account: confirmed opening balance + this month’s cleared activity. Archived accounts are excluded.' },
  { term: 'Start of month', def: 'Your monthly opening snapshot — the combined balance you confirmed at the start of the month. Immutable once confirmed; corrections are versioned.' },
  { term: 'Change since start', def: 'Total bank balance − start-of-month balance.' },
  { term: 'Income / Expenses', def: 'Cleared income transactions; cleared expenses include transfer fees, minus refunds. Transfers themselves are never counted as spending.' },
  { term: 'Net cash flow', def: 'Income − expenses for the month. Negative means you spent more than you earned.' },
  { term: 'Savings & savings rate', def: 'Savings = net cash flow when positive. Savings rate = net cash flow ÷ income (shown as — when there is no income).' },
  { term: 'Uncleared', def: 'Uncleared transactions are shown in lists but excluded from every total until cleared.' },
];

export default function ExplainDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 50 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="How these numbers are calculated" onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '24px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>How these numbers are calculated</div>
            <span style={{ flex: 1 }} />
            <button onClick={onClose} aria-label="Close" className="hv-elev" style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>All figures come from data you entered manually. Nothing is bank-verified.</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            {ROWS.map(x => (
              <div key={x.term} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{x.term}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{x.def}</div>
              </div>
            ))}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
