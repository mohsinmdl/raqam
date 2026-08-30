import { useUI } from '../UIProvider.jsx';
import { isMacPlatform } from './CommandPalette.jsx';

// The desktop sidebar "Quick search… ⌘K" affordance (US-2). Looks like an input
// but is a button — it opens the command palette, it does not host the query.
export default function SidebarSearch() {
  const { openPalette } = useUI();
  const kbd = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', background: 'var(--surface)' };
  return (
    <div style={{ padding: '10px 12px 4px' }}>
      <button
        type="button"
        onClick={openPalette}
        className="hv-elev"
        aria-label="Open command palette"
        aria-keyshortcuts="Meta+K Control+K"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 34, padding: '0 8px 0 10px',
          border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--muted)',
          cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
        </span>
        <span style={{ flex: 1 }}>Quick search…</span>
        <span aria-hidden="true" style={kbd}>{isMacPlatform() ? '⌘K' : 'Ctrl K'}</span>
      </button>
    </div>
  );
}
