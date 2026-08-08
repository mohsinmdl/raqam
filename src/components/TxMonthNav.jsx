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
  // The popover edits a draft; nothing re-filters until Apply.
  const [draft, setDraft] = useState(range);
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
  const activePreset = presetOf(draft.from, draft.to);

  const openPopover = () => { setDraft(range); setOpen(true); };
  const applyRange = () => { setRange(clampRange(draft.from, draft.to)); setOpen(false); };
  // The From/To selects are month-grained, so editing either one normalises the
  // bound to a month ('YYYY-MM') — converting a day preset back to a month range.
  const setBound = (key, part, v) => setDraft(d => {
    const cur = (d[key] || rangeFor('month').from).slice(0, 7);
    const nextVal = part === 'm' ? cur.slice(0, 4) + '-' + v : v + '-' + cur.slice(5, 7);
    return { ...d, [key]: nextVal };
  });

  const label = rangeLabel(range.from, range.to, todayStr());

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg)' }}>
        <button
          onClick={() => prev && setRange(prev)} disabled={!prev}
          aria-label="Previous month" style={arrowStyle(!prev)}
        >‹</button>
        <button
          onClick={openPopover}
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
        <div role="dialog" aria-label="Date range" style={{ position: 'absolute', top: 38, left: 0, zIndex: 30, width: 580, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 10 }}>View Options</div>
          {/* nowrap keeps the presets on one line; it scrolls
              rather than wrapping if the window is too narrow. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12, borderBottom: '1px solid var(--border)' }}>
            {RANGE_PRESETS.map(p => (
              <button key={p.id} onClick={() => setDraft(rangeFor(p.id))} className={activePreset === p.id ? 'hv-accent' : 'hv-soft'}
                style={{ height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  border: '1px solid ' + (activePreset === p.id ? 'var(--accent)' : 'var(--border)'),
                  background: activePreset === p.id ? 'var(--accent)' : 'var(--surface)',
                  color: activePreset === p.id ? 'var(--on-accent)' : 'var(--text)' }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '14px 0' }}>
            {[['from', 'From'], ['to', 'To']].map(([key, lbl]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{lbl}:</span>
                <select aria-label={lbl + ' month'} value={(draft[key] || rangeFor('month').from).slice(5, 7)}
                  onChange={e => setBound(key, 'm', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 120 }}>
                  {MONTH_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select aria-label={lbl + ' year'} value={(draft[key] || rangeFor('month').from).slice(0, 4)}
                  onChange={e => setBound(key, 'y', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 92 }}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </span>
            ))}
          </div>
          {!draft.from && !draft.to && (
            <div style={{ fontSize: 12, color: 'var(--muted)', paddingBottom: 10 }}>All dates — every transaction you have recorded.</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button onClick={() => setOpen(false)} className="hv-soft" style={{ height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={applyRange} className="hv-accent" style={{ height: 32, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
