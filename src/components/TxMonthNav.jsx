// The Transactions date control, sitting in the header slot the month stepper
// uses on every other screen.
//
// It lives here rather than in Header because the range belongs to
// Transactions: Header stays free of any knowledge of it and just decides
// whether to render this.
//
// The arrows step by whole months and keep the width of the range, so Jan–Jun
// becomes Feb–Jul. The centre opens the View Options popover for everything the
// arrows cannot express — presets, an explicit From/To, All Dates.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useTxView } from '../store/TxViewContext.jsx';
import { todayStr } from '../lib/dates.js';
import {
  MONTH_OPTS, RANGE_PRESETS, clampRange, presetOf, rangeFor, rangeLabel, shiftRange, yearOpts,
} from '../lib/dateRange.js';

const selStyle = {
  height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5,
};
const arrowStyle = disabled => ({
  width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
  color: 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 14,
  opacity: disabled ? 0.4 : 1,
});

export default function TxMonthNav() {
  const { data: S } = useStore();
  const { range, setRange } = useTxView();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Same dismissal contract as the other popovers in the header.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const years = yearOpts(S);
  const prev = shiftRange(range.from, range.to, -1, years);
  const next = shiftRange(range.from, range.to, 1, years);
  const activePreset = presetOf(range.from, range.to);

  // Every control applies live — no draft, no Apply. The popover stays open
  // until Esc, an outside click, or the × button. The From/To selects are
  // month-grained, so editing one normalises that bound to a month ('YYYY-MM'),
  // converting a day preset back to a month range.
  const setBound = (key, part, v) => {
    const cur = (range[key] || rangeFor('month').from).slice(0, 7);
    const nextVal = part === 'm' ? cur.slice(0, 4) + '-' + v : v + '-' + cur.slice(5, 7);
    const nr = { ...range, [key]: nextVal };
    setRange(clampRange(nr.from, nr.to));
  };

  const label = rangeLabel(range.from, range.to, todayStr());

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg)' }}>
        <button
          onClick={() => prev && setRange(prev)} disabled={!prev}
          aria-label="Previous month" style={arrowStyle(!prev)}
        >‹</button>
        <button
          onClick={() => setOpen(o => !o)}
          aria-haspopup="dialog" aria-expanded={String(open)}
          title="Choose dates"
          className="tnum"
          style={{
            minWidth: 96, height: 26, padding: '0 8px', border: 'none', borderRadius: 6,
            background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >{label}</button>
        <button
          onClick={() => next && setRange(next)} disabled={!next}
          aria-label="Next month" style={arrowStyle(!next)}
        >›</button>
      </div>

      {open && (
        <div role="dialog" aria-label="Date range" style={{ position: 'absolute', top: 38, left: 0, zIndex: 30, width: 800, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>View Options</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="hv-soft"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          {/* nowrap keeps the presets on one line; it scrolls
              rather than wrapping if the window is too narrow. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12, borderBottom: '1px solid var(--border)' }}>
            {RANGE_PRESETS.map(p => (
              <button key={p.id} onClick={() => setRange(rangeFor(p.id))} className={activePreset === p.id ? 'hv-accent' : 'hv-soft'}
                style={{ flex: 'none', whiteSpace: 'nowrap', height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  border: '1px solid ' + (activePreset === p.id ? 'var(--accent)' : 'var(--border)'),
                  background: activePreset === p.id ? 'var(--accent)' : 'var(--surface)',
                  color: activePreset === p.id ? 'var(--on-accent)' : 'var(--text)' }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '14px 0' }}>
            {[['from', 'From'], ['to', 'To']].map(([key, lbl]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{lbl}:</span>
                <select aria-label={lbl + ' month'} value={(range[key] || rangeFor('month').from).slice(5, 7)}
                  onChange={e => setBound(key, 'm', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 120 }}>
                  {MONTH_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select aria-label={lbl + ' year'} value={(range[key] || rangeFor('month').from).slice(0, 4)}
                  onChange={e => setBound(key, 'y', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 92 }}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </span>
            ))}
          </div>
          {!range.from && !range.to && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>All dates — every transaction you have recorded.</div>
          )}
        </div>
      )}
    </div>
  );
}
