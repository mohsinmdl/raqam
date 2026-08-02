import { useStore } from '../store/StoreProvider.jsx';
import { loadDemo, resetAll } from '../store/actions.js';
import { useUI } from '../ui/UIProvider.jsx';

// Sidebar footer controls — replaces the prototype's "With data / New user" demo
// toggle with explicit, confirmed actions against the single persistent store.
const quietBtn = {
  height: 30, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--muted)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
};

export default function DataControls() {
  const { data, replaceData } = useStore();
  const { ask, notify } = useUI();
  const hasUserData = data && (data.accounts.length > 0 || data.transactions.length > 0 || data.cards.length > 0);

  const onLoadDemo = async () => {
    if (hasUserData) {
      const ok = await ask({
        title: 'Replace your data with demo data?',
        body: 'Everything currently in Raqam will be replaced by fictional demo data (accounts, cards, and three months of transactions). This cannot be undone.',
        action: 'Load demo data',
      });
      if (!ok) return;
    }
    replaceData(loadDemo());
    notify('Demo data loaded — all values are fictional.');
  };

  const onReset = async () => {
    const ok = await ask({
      title: 'Reset all data?',
      body: 'This removes every account, card, and transaction from this device and starts Raqam fresh. This cannot be undone.',
      action: 'Reset all data',
    });
    if (!ok) return;
    replaceData(resetAll());
    notify('All data cleared — starting fresh.');
  };

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'var(--muted)' }}>DATA</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onLoadDemo} className="hv-elev" style={quietBtn}>Load demo data</button>
        {hasUserData && <button onClick={onReset} className="hv-neg-soft" style={quietBtn}>Reset all data</button>}
      </div>
    </>
  );
}
