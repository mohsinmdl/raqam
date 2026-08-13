// The Transactions date control, sitting in the header slot the month stepper
// uses on every other screen.
//
// It lives here rather than in Header because the range belongs to
// Transactions: Header stays free of any knowledge of it and just decides
// whether to render this.
//
// The arrows step by whole months and keep the width of the range, so Jan–Jun
// becomes Feb–Jul. The centre opens the View Options overlay for everything the
// arrows cannot express — presets, an explicit From/To, All Dates.
//
// The overlay is Base UI: a Popover anchored to the label on desktop, and a
// Dialog styled as a bottom sheet on phone. Base UI owns positioning (Floating
// UI collision-shift, so a near-viewport-wide panel can no longer stretch the
// header the way the old hand-positioned `absolute; width:800` panel did),
// dismissal (Escape / outside-click / backdrop), focus return, and ARIA.
import { useStore } from '../store/StoreProvider.jsx';
import { useTxView } from '../store/TxViewContext.jsx';
import { useIsPhone } from '../lib/useIsPhone.js';
import { todayStr } from '../lib/dates.js';
import {
  MONTH_OPTS, RANGE_PRESETS, clampRange, presetOf, rangeFor, rangeLabel, shiftRange, yearOpts,
} from '../lib/dateRange.js';
import { Popover, PopoverTrigger, PopoverClose, PopoverPanel } from '../ui/primitives/Popover.jsx';
import { BottomSheet, BottomSheetTrigger, BottomSheetClose, BottomSheetPanel } from '../ui/primitives/BottomSheet.jsx';

const selStyle = {
  height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5,
};
const arrowStyle = disabled => ({
  width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
  color: 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 14,
  opacity: disabled ? 0.4 : 1,
});
const triggerStyle = {
  minWidth: 96, height: 26, padding: '0 8px', border: 'none', borderRadius: 6,
  background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const closeStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
};

// The overlay contents — identical markup on desktop and phone; only the
// enclosing surface (popover vs sheet) and the Close primitive differ, so the
// caller passes the right Close element in.
function ViewOptionsBody({ range, setRange, years, activePreset, setBound, closeButton }) {
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>View Options</span>
        {closeButton}
      </div>
      {/* nowrap keeps the presets on one line; it scrolls rather than wrapping
          if the window is too narrow. */}
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
  );
}

export default function TxMonthNav() {
  const { data: S } = useStore();
  const { range, setRange } = useTxView();
  const phone = useIsPhone();

  const years = yearOpts(S);
  const prev = shiftRange(range.from, range.to, -1, years);
  const next = shiftRange(range.from, range.to, 1, years);
  const activePreset = presetOf(range.from, range.to);

  // Every control applies live — no draft, no Apply. The overlay stays open
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
  const bodyProps = { range, setRange, years, activePreset, setBound };

  // The ‹ label › row. The arrows are plain buttons; the centre label is the
  // overlay trigger (its element differs by device but looks identical).
  const arrowRow = triggerEl => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg)' }}>
      <button onClick={() => prev && setRange(prev)} disabled={!prev} aria-label="Previous month" style={arrowStyle(!prev)}>‹</button>
      {triggerEl}
      <button onClick={() => next && setRange(next)} disabled={!next} aria-label="Next month" style={arrowStyle(!next)}>›</button>
    </div>
  );

  if (phone) {
    return (
      <BottomSheet>
        {arrowRow(
          <BottomSheetTrigger className="tnum" title="Choose dates" style={triggerStyle}>{label}</BottomSheetTrigger>
        )}
        <BottomSheetPanel label="Date range">
          <ViewOptionsBody {...bodyProps}
            closeButton={<BottomSheetClose aria-label="Close" className="hv-soft" style={closeStyle}>×</BottomSheetClose>} />
        </BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <Popover>
      {arrowRow(
        <PopoverTrigger className="tnum" title="Choose dates" style={triggerStyle}>{label}</PopoverTrigger>
      )}
      <PopoverPanel width={800} style={{ maxWidth: '92vw', padding: 0 }} aria-label="Date range">
        <ViewOptionsBody {...bodyProps}
          closeButton={<PopoverClose aria-label="Close" className="hv-soft" style={closeStyle}>×</PopoverClose>} />
      </PopoverPanel>
    </Popover>
  );
}
