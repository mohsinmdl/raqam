// The DATE cell: a TYPED dd/mm/yyyy field with a calendar hanging off it. The
// field is the primary input — '17', '17/8', '17/8/26' and '17/08/2026' all
// commit on Enter or blur (parseTypedDate does the reading; anything it cannot
// read keeps the draft and marks the cell with the --neg ring Wave H
// established, rather than silently reverting). The calendar is the secondary
// path, opened by focusing the field or pressing the chevron, and still owns
// the month stepper, the Today/Yesterday chips and (when the row can become a
// rule) the Repeat preset dropdown — the same PRESETS the drawer used, so
// applyRepeat in the store needs no change. Escape closes the popover only
// (propagation is stopped so the editor session's own Escape does not fire).
import { forwardRef, useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { calendarCells, shiftMonth } from '../../../lib/calendar.js';
import { todayStr, addDays, parseTypedDate } from '../../../lib/dates.js';
import { PRESETS } from '../../../lib/schedule.js';
import { Chevron } from '../../icons.jsx';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// A day button's visible label is a bare number; a screen reader needs the
// whole date ("21 August 2026") or the grid reads as arbitrary integers.
const dayName = iso => `${+iso.slice(8)} ${MFULL[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const dmy = ymd => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? ymd.slice(8) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4) : '');
const chip = on => ({ height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), background: on ? 'var(--soft)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text)' });
const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };
const TYPE_MSG = "Couldn't read that date — try 17, 17/8 or 17/08/2026.";
// The Alt+Down handler needs to find the portalled panel to focus a day
// button when the calendar is ALREADY open; an id is the precise handle
// (only one editor row — add or edit — exists at a time, so it stays unique).
const CAL_ID = 'txeditor-datecal';

const DateCell = forwardRef(function DateCell({ value, onChange, repeat, onRepeat, showRepeat, disabled, invalid, errorMsg, errorId }, ref) {
  const today = todayStr();
  const [month, setMonth] = useState(() => String(value || today).slice(0, 7));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // null = idle, mirror the committed value
  const [typeErr, setTypeErr] = useState(false);
  // The calendar hangs off the whole field, not off the chevron that opens it.
  const fieldRef = useRef(null);
  // Set when the row's Tab walk is about to move focus itself — finalFocus
  // then returns false so the closing popover doesn't yank focus back here
  // mid-walk. Escape and click-away keep their normal restore.
  const tabbedAway = useRef(false);
  // Which opener fired. Opened from the FIELD, the popup must not take
  // focus — the caret has to stay put or the date being typed is interrupted
  // the instant the calendar appears. Opened from the CHEVRON (pointer) or
  // Alt+Down (keyboard), focus moves into the popup as Base UI normally
  // does — the route to the day grid and the Repeat select.
  const fromField = useRef(false);
  const cells = calendarCells(month, value, today);
  const id = errorId || 'txeditor-err-date';
  const showInvalid = typeErr || !!invalid;
  const shown = draft !== null ? draft : dmy(value);

  // Picking from the calendar fills the field: any half-typed draft is what the
  // user just abandoned by reaching for the grid.
  const setFromCalendar = iso => { onChange(iso); setMonth(iso.slice(0, 7)); setDraft(null); setTypeErr(false); };
  const commit = () => {
    if (draft === null) return;
    const iso = parseTypedDate(draft, today);
    if (!iso) { setTypeErr(true); return; } // keep the draft, mark the cell
    setFromCalendar(iso);
  };

  return (
    <Popover open={open} onOpenChange={o => { if (o) tabbedAway.current = false; setOpen(o); }}>
      <span ref={fieldRef} style={{ position: 'relative', display: 'block', width: '100%' }}>
        <input
          ref={ref} className="field tnum" inputMode="numeric" disabled={disabled}
          aria-label="Date" placeholder="dd/mm/yyyy"
          // The calendar is this field's popup, so the field must SAY so:
          // haspopup/expanded/controls make the relationship (and its state)
          // audible, and aria-keyshortcuts names the chord that enters it.
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? CAL_ID : undefined}
          aria-keyshortcuts="Alt+ArrowDown"
          aria-invalid={showInvalid || undefined} aria-describedby={showInvalid ? id : undefined}
          value={shown}
          onFocus={() => { fromField.current = true; setOpen(true); }}
          onChange={e => { setDraft(e.target.value); setTypeErr(false); }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft !== null) { e.preventDefault(); commit(); }
            // Escape belongs to the calendar while it is up; focus sits on this
            // field (outside the popup), so nothing else would stop it reaching
            // the editor session and cancelling the whole row.
            else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
            // Alt+Down (the ARIA combobox idiom) is the KEYBOARD path into the
            // calendar now that the row's Tab walk skips the chevron: it moves
            // focus into the day grid — and on to the Repeat select, whose only
            // inline home is this popup. Already-open (the field-focus flow
            // never takes focus), the day buttons are focused directly;
            // otherwise opening chevron-style lets initialFocus do it.
            else if (e.key === 'ArrowDown' && e.altKey && !disabled) {
              e.preventDefault();
              fromField.current = false;
              if (!open) { setOpen(true); return; }
              const panel = document.getElementById(CAL_ID);
              const day = panel && (panel.querySelector('[aria-current="date"]') || panel.querySelector('button'));
              if (day) day.focus();
            }
            // Tab-away (the editor row moves focus cell-to-cell): Base UI only
            // dismisses this popover on an outside PRESS or on focus leaving
            // the popup itself — keyboard focus jumping input→next cell is
            // neither, so the calendar lingered over the payee list. The blur
            // commit still runs; this just takes the calendar down with it.
            else if (e.key === 'Tab' && open) setOpen(false);
            // With the calendar up and no typing in progress, the arrows step
            // the DATE (←/→ a day, ↑/↓ a week — the grid's own axes), through
            // setFromCalendar so the field text, the selected-day highlight
            // and the visible month all move together. Only while draft is
            // null: once characters are being edited the arrows belong to the
            // caret again. (!altKey keeps Alt+Down's open-the-calendar chord,
            // handled above, out of this branch.)
            else if (open && draft === null && !e.altKey
              && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
              setFromCalendar(addDays(value || today, delta));
            }
          }}
          // Tight horizontal padding and minWidth 0: this input has to hold a
          // full dd/mm/yyyy — the placeholder and every committed value are the
          // same 10 characters — and at the old 8px/22px gutters inside a 96px
          // column the content box was narrower than the text, so the field
          // scrolled its own value out of sight (scrollWidth > clientWidth) and
          // showed "17/08/20" with the year clipped. The column is 120 now
          // (COLUMNS in Transactions.jsx) and the gutters are 4px, so the text
          // fits with room to spare and still stops well short of the calendar
          // chevron's 20px box at the right edge. minWidth 0 keeps the input
          // from asserting a min-content floor of its own inside the cell.
          style={{ width: '100%', minWidth: 0, height: 28, padding: '0 4px', fontSize: 13, ...(showInvalid ? ringStyle : null) }}
        />
        {/* tabIndex -1: the row's Tab walk goes strictly column-to-column, so
            this chevron left the tab order — Alt+Down on the field is the
            keyboard path into the calendar now. The chevron stays a pointer
            affordance (and the Escape-close restore target when the popup
            was opened from it). */}
        <PopoverTrigger
          aria-label="Open calendar" disabled={disabled} className="hv-soft" tabIndex={-1}
          onPointerDown={() => { fromField.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fromField.current = false; }}
          style={{ position: 'absolute', right: 1, top: 1, bottom: 1, width: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 3, background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
          <Chevron />
        </PopoverTrigger>
      </span>
      {showInvalid && <span id={id} role="alert" style={srOnly}>{typeErr ? TYPE_MSG : errorMsg}</span>}
      <PopoverPanel id={CAL_ID} width={272} arrow anchor={fieldRef} style={{ padding: 10 }}
        initialFocus={() => !fromField.current}
        // Three closes, three focus answers: tab-away → false (the row already
        // moved focus; a restore would yank it back mid-walk), field-opened →
        // false (focus never left the field), chevron/Alt+Down-opened Escape →
        // true (restore to the trigger as Base UI normally would).
        finalFocus={() => (tabbedAway.current ? false : !fromField.current)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); return; }
          if (e.key === 'Tab') { tabbedAway.current = true; setOpen(false); return; }
          // Arrow navigation inside the panel (plain buttons in a CSS grid
          // have no roving tabindex of their own): ←/→ step a day, ↑/↓ a
          // week; ↓ off the last row lands on the chips (Today → Yesterday →
          // Repeat, ←/→ between them, ↑ back to the grid). The Repeat select
          // itself keeps native arrow behavior (changing its value), so it is
          // entered from the left and left by Tab — and Alt+Arrow is skipped
          // everywhere (that chord belongs to open/close idioms).
          if (e.altKey || !e.key.startsWith('Arrow')) return;
          const panel = document.getElementById(CAL_ID);
          if (!panel || e.target.tagName === 'SELECT') return;
          const days = [...panel.querySelectorAll('[data-day-grid] button')];
          const chips = [...panel.querySelectorAll('[data-cal-chip]')];
          const di = days.indexOf(e.target);
          if (di !== -1) {
            e.preventDefault();
            const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
            const ni = di + step;
            if (e.key === 'ArrowDown' && ni >= days.length) { (chips[0] || days[days.length - 1]).focus(); return; }
            if (ni >= 0 && ni < days.length) days[ni].focus();
            return;
          }
          const ci = chips.indexOf(e.target);
          if (ci !== -1) {
            if (e.key === 'ArrowRight' && chips[ci + 1]) { e.preventDefault(); chips[ci + 1].focus(); }
            else if (e.key === 'ArrowLeft' && chips[ci - 1]) { e.preventDefault(); chips[ci - 1].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); (panel.querySelector('[data-day-grid] [aria-current="date"]') || days[0]).focus(); }
          }
        }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MN[+month.slice(5) - 1] + ' ' + month.slice(0, 4)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="hv-soft" style={{ ...chip(false), width: 24, padding: 0 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d}</span>)}
        </div>
        <div data-day-grid="" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 2 }}>
          {cells.map(c => (
            <button key={c.iso} type="button" className="rq-cal-day" onClick={() => setFromCalendar(c.iso)}
              aria-label={dayName(c.iso)}
              aria-current={c.sel ? 'date' : undefined}
              style={{ height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                border: '1px solid ' + (c.today && !c.sel ? 'var(--accent)' : 'transparent'),
                background: c.sel ? 'var(--accent)' : 'transparent',
                color: c.sel ? 'var(--on-accent)' : c.out ? 'var(--border)' : 'var(--text)',
                fontWeight: c.sel || c.today ? 600 : 400 }}>{c.n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <button type="button" data-cal-chip="" onClick={() => setFromCalendar(today)} className="hv-soft" style={chip(value === today)}>Today</button>
          <button type="button" data-cal-chip="" onClick={() => setFromCalendar(addDays(today, -1))} className="hv-soft" style={chip(value === addDays(today, -1))}>Yesterday</button>
          {showRepeat && (
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>Repeat:</span>
              <select aria-label="Repeat" data-cal-chip="" value={repeat || 'never'} onChange={e => onRepeat(e.target.value)}
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
