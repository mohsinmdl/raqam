// The account menu that opens upward from the sidebar identity row. Holds
// everything that is not day-to-day navigation: a display-name field, the two
// device toggles (moved out of the Header), Settings, Sign out, and the
// destructive Reset (moved out of DataControls, confirm dialog preserved).
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { resetAll } from '../store/actions.js';

const row = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px',
  border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer',
  textAlign: 'left', fontSize: 13, color: 'var(--text)',
};
const rightNote = { marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 };
const sep = <div aria-hidden="true" style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />;

export default function UserMenu({ name, email, onClose }) {
  const { signOut } = useAuth();
  const { data, prefs, setPrefs, replaceData } = useStore();
  const { ask, notify } = useUI();
  const navigate = useNavigate();
  const hasUserData = data && (data.accounts.length > 0 || data.transactions.length > 0 || data.cards.length > 0);

  const onReset = async () => {
    onClose();
    const ok = await ask({
      title: 'Reset all data?',
      body: 'This removes every account, card, and transaction from your Raqam account and starts fresh. This cannot be undone.',
      action: 'Reset all data',
    });
    if (!ok) return;
    replaceData(resetAll());
    notify('All data cleared — starting fresh.');
  };

  return (
    <div role="menu" aria-label="Account menu" onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(100% + 8px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, zIndex: 20 }}>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div title={email} style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
      </div>
      {sep}
      <button role="menuitem" className="hv-elev" style={row} onClick={() => setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' })}>
        <span aria-hidden="true">◐</span> Appearance <span style={rightNote}>{prefs.theme === 'light' ? 'Light' : 'Dark'}</span>
      </button>
      <button role="menuitem" className="hv-elev" style={row} aria-pressed={String(prefs.masked)} onClick={() => setPrefs({ masked: !prefs.masked })}>
        <span aria-hidden="true">◔</span> Hide amounts <span style={rightNote}>{prefs.masked ? 'On' : 'Off'}</span>
      </button>
      <button role="menuitem" className="hv-elev" style={row} onClick={() => { onClose(); navigate('/settings'); }}>
        <span aria-hidden="true">⚙</span> Settings
      </button>
      {sep}
      <button role="menuitem" className="hv-elev" style={row} onClick={() => { onClose(); signOut(); }}>
        <span aria-hidden="true">⇥</span> Sign out
      </button>
      {/* Disabled for now: this is a hard, irreversible, server-side wipe, so
          it stays inert until a type-to-confirm safeguard is added. onReset is
          still wired (never fires while disabled) so re-enabling is a one-liner. */}
      {hasUserData && (
        <button role="menuitem" disabled onClick={onReset}
          title="Temporarily disabled — a type-to-confirm safeguard is coming before this can wipe your data"
          style={{ ...row, color: 'var(--muted)', cursor: 'default', opacity: 0.5 }}>
          <span aria-hidden="true">⌫</span> Reset all data
          <span style={{ ...rightNote, color: 'var(--muted)' }}>Disabled</span>
        </button>
      )}
    </div>
  );
}
