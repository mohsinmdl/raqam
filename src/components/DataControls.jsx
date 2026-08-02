import { useAuth } from '../auth/AuthProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { resetAll } from '../store/actions.js';
import { useUI } from '../ui/UIProvider.jsx';

// Sidebar footer: account identity + sign out + destructive reset.
const quietBtn = {
  height: 30, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--muted)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
};

export default function DataControls() {
  const { user, signOut } = useAuth();
  const { data, replaceData } = useStore();
  const { ask, notify } = useUI();
  const hasUserData = data && (data.accounts.length > 0 || data.transactions.length > 0 || data.cards.length > 0);

  const onReset = async () => {
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
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--muted)' }}>ACCOUNT</div>
      <div title={user?.email || ''} style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {user?.email || 'Signed in'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={signOut} className="hv-elev" style={quietBtn}>Sign out</button>
        {hasUserData && <button onClick={onReset} className="hv-neg-soft" style={quietBtn}>Reset all data</button>}
      </div>
    </>
  );
}
