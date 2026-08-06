// Floating bulk-action toolbar, shown while rows are selected.
//
// position:fixed, so it escapes <main>'s overflowY:auto without a portal —
// there are no portals in this codebase, and the Transactions section
// deliberately carries no overflow of its own (it would clip the row menus).
//
// Inverted like Toast (background --text on --bg) so it reads as an overlay
// rather than another card, and so it stays legible against both themes.
const btn = {
  height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid transparent', background: 'transparent',
  color: 'var(--bg)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
};

export default function BulkBar({ count, actions, onClear }) {
  if (!count) return null;
  return (
    <div
      role="region" aria-label="Bulk actions"
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 35, display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 10px', borderRadius: 12,
        background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadow)',
        maxWidth: 'calc(100vw - 32px)', overflowX: 'auto',
        animation: 'hsUp .18s ease',
      }}
    >
      <button onClick={onClear} aria-label="Clear selection" className="hv-elev"
        style={{ ...btn, padding: '0 8px', opacity: 0.75 }}>×</button>
      <span aria-live="polite" style={{ fontSize: 12.5, fontWeight: 700, padding: '0 8px 0 2px', whiteSpace: 'nowrap' }}>
        {count} selected
      </span>
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
