// The DATE cell: dd/mm/yyyy trigger opening a calendar popover with month
// stepper, Today/Yesterday chips, and (when the row can become a rule) the
// Repeat preset dropdown — the same PRESETS the drawer used, so applyRepeat
// in the store needs no change. Escape closes the popover only (bubbling is
// stopped so DrawerProvider's session-level Escape does not also fire).
import { forwardRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { calendarCells, shiftMonth } from '../../../lib/calendar.js';
import { todayStr, addDays } from '../../../lib/dates.js';
import { PRESETS } from '../../../lib/schedule.js';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = ymd => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? ymd.slice(8) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4) : 'date');
const chip = on => ({ height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), background: on ? 'var(--soft)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text)' });
const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const DateCell = forwardRef(function DateCell({ value, onChange, repeat, onRepeat, showRepeat, disabled, invalid, errorMsg, errorId }, ref) {
  const today = todayStr();
  const [month, setMonth] = useState(() => String(value || today).slice(0, 7));
  const cells = calendarCells(month, value, today);
  const id = errorId || 'txeditor-err-date';
  return (
    <Popover>
      <PopoverTrigger ref={ref} className="field tnum" disabled={disabled} aria-label="Date"
        aria-invalid={invalid || undefined} aria-describedby={invalid ? id : undefined}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%', height: 28, padding: '0 8px', fontSize: 13, cursor: 'pointer', ...(invalid ? ringStyle : null) }}>
        <span>{dmy(value)}</span>
        <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </PopoverTrigger>
      {invalid && <span id={id} role="alert" style={srOnly}>{errorMsg}</span>}
      <PopoverPanel width={272} arrow style={{ padding: 10 }}
        onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MN[+month.slice(5) - 1] + ' ' + month.slice(0, 4)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 2 }}>
          {cells.map(c => (
            <button key={c.iso} type="button" onClick={() => { onChange(c.iso); setMonth(c.iso.slice(0, 7)); }}
              aria-current={c.sel ? 'date' : undefined}
              style={{ height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                border: '1px solid ' + (c.today && !c.sel ? 'var(--accent)' : 'transparent'),
                background: c.sel ? 'var(--accent)' : 'transparent',
                color: c.sel ? 'var(--on-accent)' : c.out ? 'var(--border)' : 'var(--text)',
                fontWeight: c.sel || c.today ? 600 : 400 }}>{c.n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={() => { onChange(today); setMonth(today.slice(0, 7)); }} className="hv-soft" style={chip(value === today)}>Today</button>
          <button type="button" onClick={() => { onChange(addDays(today, -1)); }} className="hv-soft" style={chip(value === addDays(today, -1))}>Yesterday</button>
          {showRepeat && (
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>Repeat:</span>
              <select aria-label="Repeat" value={repeat || 'never'} onChange={e => onRepeat(e.target.value)}
                style={{ height: 24, minWidth: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, padding: '0 4px', cursor: 'pointer' }}>
                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </PopoverPanel>
    </Popover>
  );
});

export default DateCell;
