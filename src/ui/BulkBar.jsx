// Floating bulk-action toolbar, shown while rows are selected.
//
// position:fixed, so it escapes <main>'s overflowY:auto without a portal —
// there are no portals in this codebase, and the Transactions section
// deliberately carries no overflow of its own (it would clip the row menus).
//
// Inverted like Toast (background --text on --bg) so it reads as an overlay
// rather than another card, and so it stays legible against both themes.
import { useEffect, useRef, useState } from 'react';
import { useBottomBar } from './UIProvider.jsx';

const btn = {
  height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid transparent', background: 'transparent',
  color: 'var(--bg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
};
const divider = <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--bg)', opacity: 0.25, margin: '0 4px' }} />;

// Leading icons for the More menu. Stroke style (like the search field's), and
// they take `currentColor`, so the Delete icon turns --neg with its label for
// free. Keyed by name so the menu items stay plain data.
const svg = children => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>{children}</svg>
);
const MENU_ICONS = {
  edit: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>),
  duplicate: svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  repeat: svg(<><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
  delete: svg(<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /><path d="M10 11v6M14 11v6" /></>),
};

// The overflow ("More") menu. It opens UPWARD — the bar is pinned to the bottom
// of the viewport, so a downward menu would fall off-screen. Rendered as a
// normal surface card, not inverted like the bar, so the items read as a menu.
//
// position:FIXED, measured from the trigger, NOT absolute inside the bar: the
// bar sets overflow-x:auto (to scroll when it is too wide), and CSS then forces
// overflow-y to auto as well, which clips anything drawn above the bar — an
// absolute upward menu vanishes. A fixed menu is positioned against the viewport
// and escapes that clip. (The bar's entrance transform is gone by the time a
// click can open this, so it doesn't trap the fixed menu.)
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const place = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    // caret = distance from the menu's right edge (which sits at the button's
    // right edge) to the button's centre, so the tail points at the button.
    if (r) setPos({ bottom: window.innerHeight - r.top + 10, right: window.innerWidth - r.right, caret: r.width / 2 });
  };
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    // Capture phase, so this closes the menu before the screen's Escape clears
    // the whole selection — same contract as RowMenu.
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const onResize = () => setOpen(false); // a resize invalidates the measured spot
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-flex' }}>
      <button
        ref={btnRef}
        onClick={() => { if (!open) place(); setOpen(o => !o); }}
        aria-haspopup="menu" aria-expanded={String(open)}
        style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>⋯</span> More
      </button>
      {open && pos && (
        <div
          role="menu" onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', bottom: pos.bottom, right: pos.right, zIndex: 40,
            minWidth: 184, background: 'var(--surface)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)',
            padding: 4, display: 'flex', flexDirection: 'column',
          }}
        >
          {items.map((it, i) => it.divider ? (
            <span key={i} aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
          ) : (
            <button
              key={i} role="menuitem" disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={it.tone === 'neg' ? 'hv-neg-soft' : 'hv-elev'}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: 'none', background: 'none', textAlign: 'left', padding: '8px 12px',
                borderRadius: 7, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                cursor: it.disabled ? 'default' : 'pointer', opacity: it.disabled ? 0.4 : 1,
                color: it.tone === 'neg' ? 'var(--neg)' : 'var(--text)',
              }}
            >
              {it.icon && (MENU_ICONS[it.icon] || null)}
              {it.label}
            </button>
          ))}
          {/* Speech-bubble tail pointing down at the More button: two stacked
              triangles — a border-coloured one, then a surface fill 1.5px shorter
              that overlaps up to hide the menu's bottom border, so the join is
              seamless rather than a notch. */}
          <span aria-hidden="true" style={{
            position: 'absolute', top: '100%', right: pos.caret - 9, width: 0, height: 0,
            borderLeft: '9px solid transparent', borderRight: '9px solid transparent',
            borderTop: '9px solid var(--border)',
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', top: 'calc(100% - 1.5px)', right: pos.caret - 8, width: 0, height: 0,
            borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
            borderTop: '8px solid var(--surface)',
          }} />
        </div>
      )}
    </div>
  );
}

export default function BulkBar({ count, actions, more, onClear }) {
  const [clearHover, setClearHover] = useState(false);
  // Tell the toast to sit above this bar while it's showing (called before the
  // early return so the hook order is stable).
  useBottomBar(count > 0);
  if (!count) return null;
  const inlineActions = (actions || []).filter(Boolean);
  const moreItems = (more || []).filter(Boolean);
  return (
    <div
      role="region" aria-label="Bulk actions"
      style={{
        // Centred with auto margins, NOT translateX(-50%): the hsUp entrance
        // animation drives `transform` (translateY), which would override a
        // centring transform mid-animation and snap the bar sideways when it
        // ended. Auto-margin centring leaves `transform` free for the animation.
        position: 'fixed', bottom: 24, left: 0, right: 0, margin: '0 auto', width: 'fit-content',
        zIndex: 35, display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 10px', borderRadius: 12,
        background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadow)',
        maxWidth: 'calc(100vw - 32px)', overflowX: 'auto',
        animation: 'hsUp .18s ease',
      }}
    >
      {/* × and count are one button, so the whole "× N selected" is the click
          target to clear. A neutral translucent hover reads on this inverted
          bar in both themes, where the hv-elev theme colours would wash out. */}
      <button
        onClick={onClear} aria-label="Clear selection"
        onMouseEnter={() => setClearHover(true)} onMouseLeave={() => setClearHover(false)}
        style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px',
          background: clearHover ? 'rgba(150, 150, 150, 0.28)' : 'transparent' }}
      >
        <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.8, lineHeight: 1 }}>×</span>
        <span aria-live="polite" style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {count} selected
        </span>
      </button>
      {inlineActions.length > 0 && divider}
      {inlineActions.map(a => (
        <button
          key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}
          style={{ ...btn, opacity: a.disabled ? 0.4 : 1, cursor: a.disabled ? 'default' : 'pointer', color: a.tone === 'neg' ? 'var(--neg)' : 'var(--bg)' }}
        >{a.label}</button>
      ))}
      {moreItems.length > 0 && (
        <>
          {divider}
          <MoreMenu items={moreItems} />
        </>
      )}
    </div>
  );
}
