// The date/time picker the drag-to-reorder flow opens when a moment can't be
// honestly interpolated — the neighbours span more than the auto window, a drop
// lands at an edge, or there is no room between two adjacent rows (see
// lib/txReorder.planDrop). It is deliberately its own small popover rather than
// the drawer's WhenField: WhenField is welded to useDrawer and anchors to a
// trigger row, whereas this one pins to the drop point and confirms a single
// timestamp. Keeps the heavily-used add flow untouched.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calendarCells, shiftMonth } from '../../lib/calendar.js';
import { todayStr } from '../../lib/dates.js';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const W = 300, H = 388;

const panel = { position: 'fixed', zIndex: 61, width: W, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', padding: 10 };
const chip = on => ({ height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), background: on ? 'var(--soft)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text)' });

// seed — an ISO string ('YYYY-MM-DDTHH:mm[:ss]') to pre-fill from.
// onConfirm(iso) receives a 'YYYY-MM-DDTHH:mm:ss' string whose seconds are
// always ':00' — the <input type="time"> is minute-granular.
// dateOnly — hide the time field and confirm a bare 'YYYY-MM-DD' day. Used by
// the bulk "Move to Date" flow, which lands the selection on TOP of the chosen
// day (planDateMove) — the time is derived from what is already there, so
// asking for one would be misleading.
export default function TxWhenPicker({ seed, x, y, dateOnly, onCancel, onConfirm }) {
  const today = todayStr();
  const [date, setDate] = useState(() => (seed || today).slice(0, 10));
  const [time, setTime] = useState(() => (seed || '').slice(11, 16) || '12:00');
  const [month, setMonth] = useState(() => date.slice(0, 7));
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // Pin near the drop point, clamped into the viewport.
  useLayoutEffect(() => {
    const left = Math.max(8, Math.min((x || 40) - W / 2, window.innerWidth - W - 8));
    const top = Math.max(8, Math.min((y || 40) + 12, window.innerHeight - H - 8));
    setPos({ top, left });
  }, [x, y]);

  // Escape cancels (capture phase, before any parent handler).
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const cells = calendarCells(month, date, today);
  // Normalize to HH:mm before appending ':00' — a seconds-capable time input can
  // hand back 'HH:mm:ss', which would otherwise assemble an invalid '…:ss:00'
  // that fails the DB CHECK.
  const confirm = () => onConfirm(dateOnly ? date : date + 'T' + (time || '12:00').slice(0, 5) + ':00');

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
      <div ref={ref} role="dialog" aria-label={dateOnly ? 'Choose date' : 'Choose date and time'} style={{ ...panel, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6 }}>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="hv-soft rq-btn-outline" style={{ ...chip(false), width: 28, padding: 0 }}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MN[+month.slice(5) - 1] + ' ' + month.slice(0, 4)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="hv-soft rq-btn-outline" style={{ ...chip(false), width: 28, padding: 0 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, padding: '4px 0 8px' }}>
          {cells.map(c => {
            // dateOnly (bulk "Move to Date") disables future days: a future day
            // would clamp every row back to `now`, so the chosen day would not be
            // the day rows land on — the toast and audit would then name a day
            // nothing actually moved to. The single-row time picker still allows
            // any day (it confirms one exact, clamped instant).
            const future = dateOnly && c.iso > today;
            return (
              <button key={c.iso} type="button" disabled={future} onClick={() => { setDate(c.iso); setMonth(c.iso.slice(0, 7)); }}
                aria-current={c.sel ? 'date' : undefined}
                style={{ height: 32, borderRadius: 7, cursor: future ? 'default' : 'pointer', fontSize: 12.5, border: '1px solid ' + (c.today && !c.sel ? 'var(--accent)' : 'transparent'), background: c.sel ? 'var(--accent)' : 'transparent', color: c.sel ? 'var(--on-accent)' : (c.out || future) ? 'var(--border)' : 'var(--text)', fontWeight: c.sel || c.today ? 600 : 400, opacity: future ? 0.4 : 1 }}>{c.n}</button>
            );
          })}
        </div>
        {!dateOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Time"
              style={{ flex: 1, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, padding: '0 8px' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 10 }}>
          <button type="button" onClick={onCancel} className="hv-soft rq-btn-outline" style={chip(false)}>Cancel</button>
          <button type="button" onClick={confirm} className="rq-btn-solid" style={{ ...chip(false), background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' }}>{dateOnly ? 'Move to date' : 'Move here'}</button>
        </div>
      </div>
    </>
  );
}
