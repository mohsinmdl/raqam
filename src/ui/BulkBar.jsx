// Floating bulk-action toolbar, shown while rows are selected.
//
// position:fixed, so it escapes <main>'s overflowY:auto without a portal —
// there are no portals in this codebase, and the Transactions section
// deliberately carries no overflow of its own (it would clip the row menus).
//
// Inverted like Toast (background --text on --bg) so it reads as an overlay
// rather than another card, and so it stays legible against both themes.
import { useState } from 'react';

const btn = {
  height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid transparent', background: 'transparent',
  color: 'var(--bg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
};

export default function BulkBar({ count, actions, onClear }) {
  const [clearHover, setClearHover] = useState(false);
  if (!count) return null;
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
      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--bg)', opacity: 0.25, margin: '0 4px' }} />
      {actions.filter(Boolean).map(a => (
        <button
          key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}
          style={{ ...btn, opacity: a.disabled ? 0.4 : 1, cursor: a.disabled ? 'default' : 'pointer', color: a.tone === 'neg' ? 'var(--neg)' : 'var(--bg)' }}
        >{a.label}</button>
      ))}
    </div>
  );
}
