// Activity drill-down popover — the transactions behind an ACTIVITY figure,
// anchored to the cell that opened it (YNAB style). Built on the shared Base UI
// Popover primitive, so it opens downward, FLIPS up when the anchor is near the
// viewport bottom, carries a caret, and gets Escape / outside-click / focus-
// return / ARIA for free. The list scrolls under a sticky header. Works for a
// single category ([cat.id]) or a group total (its category ids).
//
// Rows drill into the register with that transaction pre-selected — navigating
// there unmounts the Budget screen, which closes the popover.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverTrigger, PopoverPanel, PopoverClose } from '../primitives/Popover.jsx';
import { categoryActivityRowsFor } from '../../lib/envelope.js';
import { activityDrillTarget } from '../../lib/activityDrill.js';
import { monthLabel, dayLabel } from '../../lib/calc.js';
import { nowIso } from '../../lib/dates.js';

// Sticky header so the column labels stay put while the rows scroll; the
// --surface background hides rows sliding underneath. Vertical dividers between
// header cells (right border on every cell but the last).
const th = { position: 'sticky', top: 0, background: 'var(--surface)', textAlign: 'left', fontSize: 12, fontWeight: 600, letterSpacing: '.4px', color: 'var(--muted)', padding: '8px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' };
const thDiv = { ...th, borderRight: '1px solid var(--border)' };
const td = { padding: '8px', borderBottom: '1px solid var(--border)', fontSize: 13, verticalAlign: 'top' };

export default function ActivityPopover({ title, catIds, month, S, money, triggerClassName, triggerStyle, triggerLabel, children }) {
  const navigate = useNavigate();
  const drill = t => { if (!t?.id) return; navigate(activityDrillTarget(t)); };
  // This component renders on EVERY category and group row, so compute the rows
  // only while THIS popover is open — otherwise every row would re-scan all
  // transactions on each store edit (the old modal computed exactly one, lazily).
  // catIds is a fresh array each render, so key the memo on the joined string.
  const [open, setOpen] = useState(false);
  const key = catIds.join(',');
  const { rows } = useMemo(
    () => (open ? categoryActivityRowsFor(S, catIds, month, nowIso()) : { rows: [] }),
    [open, S, key, month], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={triggerClassName}
        style={triggerStyle}
        aria-label={triggerLabel}
        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
      >{children}</PopoverTrigger>
      <PopoverPanel
        arrow
        side="bottom"
        align="end"
        sideOffset={8}
        collisionAvoidance={{ side: 'flip', align: 'shift' }}
        width={620}
        aria-label="Activity"
        style={{ padding: '18px 20px', maxWidth: '94vw' }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Activity</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{title} · {monthLabel(month)}</div>
        </div>

        <div style={{ marginTop: 12, maxHeight: 'min(360px, 60vh)', overflowY: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No transactions in {title} for {monthLabel(month)}.
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
          <PopoverClose className="hv-accent" style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</PopoverClose>
        </div>
      </PopoverPanel>
    </Popover>
  );
}
