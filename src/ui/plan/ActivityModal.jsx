// Activity drill-down modal — lists the transactions behind one category's
// ACTIVITY figure for a month, via the shared categoryActivityRows selector
// (src/lib/envelope.js) so the list can never disagree with the ACTIVITY
// cell that opened it. Modal shell copied from ShortcutHelpModal.jsx.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FocusTrap from '../FocusTrap.jsx';
import { categoryActivityRows } from '../../lib/envelope.js';
import { activityDrillTarget } from '../../lib/activityDrill.js';
import { monthLabel, dayLabel } from '../../lib/calc.js';
import { nowIso } from '../../lib/dates.js';

// Bordered grid header: top+bottom rule on the row, vertical dividers between
// columns (right border on every cell but the last), open outer left/right edges.
const th = { textAlign: 'left', fontSize: 12, fontWeight: 600, letterSpacing: '.4px', color: 'var(--muted)', padding: '8px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' };
const thDiv = { ...th, borderRight: '1px solid var(--border)' };
const td = { padding: '8px', borderBottom: '1px solid var(--border)', fontSize: 13, verticalAlign: 'top' };

export default function ActivityModal({ open, cat, month, S, money, onClose }) {
  const navigate = useNavigate();
  // Row click drills into the register on that transaction (checked + scrolled
  // into view), then closes the modal — the register route change unmounts it
  // anyway, but closing keeps the state tidy. Guard on id so a malformed row
  // can never navigate to ?sel=undefined.
  const drill = t => { if (!t?.id) return; navigate(activityDrillTarget(t)); onClose(); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Same predicate the fold uses (via categoryActivityRows), so these rows
  // match exactly the transactions behind the ACTIVITY cell that opened this modal.
  const { rows } = useMemo(
    () => (open && cat ? categoryActivityRows(S, cat.id, month, nowIso()) : { rows: [] }),
    [open, cat, S, month],
  );

  if (!open || !cat) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 60 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="Activity" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Activity</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{cat.name} · {monthLabel(month)}</div>
            </div>
            <button onClick={onClose} aria-label="Close" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ marginTop: 14 }}>
            {rows.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No transactions in this category for {monthLabel(month)}.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thDiv}>Account</th>
                    <th style={thDiv}>Date</th>
                    <th style={thDiv}>Payee</th>
                    <th style={thDiv}>Memo</th>
                    <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const t = row.t;
                    const account = (S.accounts || []).find(a => a.id === t.accountId);
                    return (
                      <tr key={t.id}
                        onClick={() => drill(t)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drill(t); } }}
                        tabIndex={0}
                        aria-label={'Open ' + (t.merchant || 'transaction') + ' in ' + (account?.nickname || 'the') + ' register'}
                        className="hv-soft"
                        style={{ cursor: 'pointer' }}>
                        <td style={td}>{account?.nickname || '—'}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }} className="tnum">{dayLabel(t.date)}</td>
                        <td style={td}>{t.merchant || '—'}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{t.notes || ''}</td>
                        <td style={{ ...td, textAlign: 'right', color: row.impact < 0 ? 'var(--neg)' : row.impact > 0 ? 'var(--pos)' : undefined }} className="tnum">{money(row.impact)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={onClose} className="hv-accent" style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
