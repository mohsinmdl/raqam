// "When" field — design iteration 003 (template 832-904). One row of two
// triggers opening a calendar and a time picker.
//
// The popovers are position:fixed rather than absolute because the drawer body
// is an overflowY:auto scroll container, which would clip and scroll an
// absolutely positioned panel.
//
// Both still write plain form.date ('YYYY-MM-DD') and form.time ('HH:MM'), so
// buildTx and validate.transaction are untouched.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { shortDate } from '../lib/calc.js';
import { todayStr } from '../lib/dates.js';
import { addDays, PRESETS } from '../lib/schedule.js';

const CAL_NARROW = 286, CAL_WIDE = 340, TIME_W = 250, TIME_H = 268;
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const QUICK = [{ v: '09:00', l: '9 am' }, { v: '12:00', l: 'Noon' }, { v: '15:00', l: '3 pm' }, { v: '19:00', l: '7 pm' }];
const p2 = n => String(n).padStart(2, '0');

const trigger = open => ({
  height: 40, padding: '0 12px', borderRadius: 'var(--field-radius)', cursor: 'pointer', textAlign: 'left',
  border: '1px solid ' + (open ? 'var(--accent)' : 'var(--border)'),
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5,
  display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
});
const panel = { position: 'fixed', zIndex: 41, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' };
const chip = on => ({
  height: 26, padding: '0 9px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
  border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'),
  background: on ? 'var(--soft)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text)',
});

export function timeLabel12(hhmm) {
  const [h, m] = String(hhmm || '12:00').split(':').map(Number);
  const am = h < 12 ? 'am' : 'pm';
  return (h % 12 || 12) + ':' + p2(m || 0) + ' ' + am;
}
function dateLabel(ymd, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return 'Pick a date';
  const prefix = ymd === today ? 'Today · ' : ymd === addDays(today, -1) ? 'Yesterday · ' : '';
  const y = ymd.slice(0, 4);
  return prefix + shortDate(ymd + 'T00:00') + (y === today.slice(0, 4) ? '' : ' ' + y);
}

export default function WhenField({ showRepeat, repeatLabel = 'Repeat' }) {
  const { drawer, setForm } = useDrawer();
  const f = drawer.form;
  const today = todayStr();
  const rowRef = useRef(null);
  const panelRef = useRef(null);
  const colsRef = useRef(null);
  const [open, setOpen] = useState(null); // 'date' | 'time' | null
  const [pos, setPos] = useState(null);
  const [month, setMonth] = useState(() => String(f.date || today).slice(0, 7));

  const close = () => { setOpen(null); setPos(null); };

  // Escape closes the popover, not the drawer — capture phase, same as RowMenu,
  // or the drawer's unsaved-changes guard fires instead.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    // The panel is pinned to a viewport position, so scrolling the page or the
    // drawer body invalidates it — but scrolling INSIDE it must not. This
    // listener is on document in capture phase, so it also sees the time
    // picker's own columns: aligning them below is a programmatic scroll, and
    // without this guard it closed the popover before it could be seen.
    const onScroll = e => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Only widened when it has to hold the Repeat control — a picker without it
  // (transfer, adjustment, editing, recording an occurrence) stays compact.
  const calW = showRepeat ? CAL_WIDE : CAL_NARROW;
  const cells = calendarCells(month, f.date);
  // Measured, not assumed: a six-row month is 36px taller, and getting this
  // wrong is what pushes the Today/Yesterday row off the bottom of the screen.
  const rows = Math.ceil(cells.length / 7);
  const calH = 276 + (rows === 6 ? 36 : 0);

  useLayoutEffect(() => {
    if (!open || !rowRef.current) return;
    const r = rowRef.current.getBoundingClientRect();
    const h = open === 'date' ? calH : TIME_H;
    const w = open === 'date' ? calW : TIME_W;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    let top;
    let maxHeight = h;
    if (below >= h) top = r.bottom + 8;
    else if (above >= h) top = r.top - h - 8;
    else {
      // Neither side fits: pin it to the viewport and let the grid scroll
      // inside, with the preset row kept sticky so it stays reachable.
      maxHeight = window.innerHeight - 16;
      top = Math.max(8, window.innerHeight - maxHeight - 8);
    }
    const left = open === 'time'
      ? Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
      : Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPos({ top, left, maxHeight });
  }, [open, month, calH, calW]);

  // Line the selected hour and minute up with the selected AM/PM, so all three
  // highlighted chips read across on one row. The AM/PM column is only two
  // items tall and never scrolls, so it is the anchor the others move to.
  //
  // Runs on open only. Re-aligning on every pick would yank the list out from
  // under the finger that just tapped it. Measured with rects rather than
  // offsetTop, which is relative to the nearest positioned ancestor (the panel)
  // and not to the column being scrolled.
  useLayoutEffect(() => {
    if (open !== 'time' || !colsRef.current) return;
    const [hourCol, minCol, merCol] = [...colsRef.current.querySelectorAll('[role="listbox"]')];
    if (!merCol) return;
    const merOn = merCol.querySelector('[data-on="true"]');
    const anchor = merOn ? merOn.getBoundingClientRect().top - merCol.getBoundingClientRect().top : 0;
    for (const col of [hourCol, minCol]) {
      const on = col && col.querySelector('[data-on="true"]');
      if (!on) continue;
      col.scrollTop += (on.getBoundingClientRect().top - col.getBoundingClientRect().top) - anchor;
    }
  }, [open, pos]);

  // Picking deliberately does NOT close: you may want to correct the date, jump
  // back with Today, or set the time straight after. The scrim, Escape and the
  // trigger all still close it.
  const pickDate = ymd => { setForm({ date: ymd }); setMonth(ymd.slice(0, 7)); };
  const [hh, mm] = String(f.time || '12:00').split(':').map(Number);
  const pm = hh >= 12;
  // The column offers minutes in fives, but the default time is the current
  // wall clock — 5:19 matched no chip, so nothing highlighted and the column
  // had nothing to align to. Highlight the five below instead: 5:19 shows :15.
  // It only marks the nearest option; the stored time stays 5:19 until you
  // actually pick one, because opening a picker must not edit the record.
  const mmSlot = Math.floor(mm / 5) * 5;
  const setTime = (h, m) => setForm({ time: p2(h) + ':' + p2(m) });

  return (
    <>
      <div ref={rowRef} style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setOpen(open === 'date' ? null : 'date')}
          aria-haspopup="dialog" aria-expanded={open === 'date'} style={{ ...trigger(open === 'date'), flex: 1 }}>
          <span aria-hidden="true" style={{ width: 13, height: 13, border: '1.5px solid var(--muted)', borderRadius: 3, flex: 'none' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateLabel(f.date, today)}</span>
        </button>
        <button type="button" onClick={() => setOpen(open === 'time' ? null : 'time')}
          aria-haspopup="dialog" aria-expanded={open === 'time'} className="tnum" style={{ ...trigger(open === 'time'), width: 118, flex: 'none' }}>
          <span aria-hidden="true" style={{ width: 13, height: 13, border: '1.5px solid var(--muted)', borderRadius: 999, flex: 'none' }} />
          <span>{timeLabel12(f.time)}</span>
        </button>
      </div>

      {open && pos && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />

          {open === 'date' && (
            <div ref={panelRef} role="dialog" aria-label="Choose a date" style={{ ...panel, top: pos.top, left: pos.left, width: calW, maxHeight: pos.maxHeight }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 10px 6px', flex: 'none' }}>
                <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="hv-soft" style={{ ...chip(false), width: 26, padding: 0 }}>‹</button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MN[+month.slice(5) - 1] + ' ' + month.slice(0, 4)}</span>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="hv-soft" style={{ ...chip(false), width: 26, padding: 0 }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px', flex: 'none' }}>
                {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d}</span>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, padding: '4px 10px 8px', overflowY: 'auto', minHeight: 0 }}>
                {cells.map(c => (
                  <button key={c.iso} type="button" onClick={() => pickDate(c.iso)} aria-label={shortDate(c.iso + 'T00:00')}
                    aria-current={c.sel ? 'date' : undefined}
                    style={{
                      height: 32, borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                      border: '1px solid ' + (c.today && !c.sel ? 'var(--accent)' : 'transparent'),
                      background: c.sel ? 'var(--accent)' : 'transparent',
                      color: c.sel ? 'var(--on-accent)' : c.out ? 'var(--border)' : 'var(--text)',
                      fontWeight: c.sel || c.today ? 600 : 400,
                    }}>{c.n}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', bottom: 0, flex: 'none', borderRadius: '0 0 12px 12px' }}>
                <button type="button" onClick={() => pickDate(today)} className="hv-soft" style={chip(f.date === today)}>Today</button>
                <button type="button" onClick={() => pickDate(addDays(today, -1))} className="hv-soft" style={chip(f.date === addDays(today, -1))}>Yesterday</button>
                {showRepeat && (
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>{repeatLabel}</span>
                    {/* Changing this deliberately leaves the popover open — a date
                        may still be waiting to be picked. */}
                    <select
                      aria-label="Repeat" value={f.repeat || 'never'}
                      onChange={e => setForm({ repeat: e.target.value })}
                      style={{ height: 26, minWidth: 0, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, padding: '0 4px', cursor: 'pointer' }}
                    >
                      {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
          )}

          {open === 'time' && (
            <div ref={panelRef} role="dialog" aria-label="Choose a time" style={{ ...panel, top: pos.top, left: pos.left, width: TIME_W, maxHeight: pos.maxHeight }}>
              <div style={{ display: 'flex', gap: 6, padding: '10px 10px 8px', flexWrap: 'wrap', flex: 'none' }}>
                {QUICK.map(q => (
                  <button key={q.v} type="button" onClick={() => setForm({ time: q.v })} className="hv-soft" style={chip(f.time === q.v)}>{q.l}</button>
                ))}
              </div>
              <div ref={colsRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 58px', gap: 6, padding: '0 10px 8px', minHeight: 0, flex: 1 }}>
                <Column label="Hour" items={Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: String(i + 1) }))}
                  isOn={v => (hh % 12 || 12) === v} onPick={v => setTime((v % 12) + (pm ? 12 : 0), mm)} />
                <Column label="Minute" items={Array.from({ length: 12 }, (_, i) => ({ v: i * 5, l: p2(i * 5) }))}
                  isOn={v => mmSlot === v} onPick={v => setTime(hh, v)} />
                <Column label="AM/PM" items={[{ v: 'am', l: 'AM' }, { v: 'pm', l: 'PM' }]}
                  isOn={v => (v === 'pm') === pm} onPick={v => setTime((hh % 12) + (v === 'pm' ? 12 : 0), mm)} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '0 10px 10px', flex: 'none' }}>Hour · minute · am/pm</div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Column({ label, items, isOn, onPick }) {
  // Scroll position is set by the parent, which alone can see all three
  // columns and align them to the AM/PM selection.
  return (
    <div role="listbox" aria-label={label} style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
      {items.map(it => {
        const on = isOn(it.v);
        return (
          <button key={String(it.v)} type="button" data-on={String(on)} role="option" aria-selected={on}
            onClick={() => onPick(it.v)} className="hv-soft" style={{ ...chip(on), height: 28, flex: 'none' }}>{it.l}</button>
        );
      })}
    </div>
  );
}

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return Math.floor(i / 12) + '-' + p2((i % 12) + 1);
}

// Whole weeks from the Sunday on or before the 1st. The trailing week is
// dropped when it holds nothing but next month, which is what keeps most
// months to five rows.
function calendarCells(ym, selected) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const today = todayStr();
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    out.push({ iso, n: d.getDate(), out: iso.slice(0, 7) !== ym, sel: iso === selected, today: iso === today });
  }
  return out.slice(35).every(c => c.out) ? out.slice(0, 35) : out;
}
