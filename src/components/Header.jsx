import { useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';

const TITLES = {
  dashboard: 'Dashboard', transactions: 'Transactions', accounts: 'Accounts', cards: 'Cards',
  budgets: 'Budgets', recurring: 'Recurring', reports: 'Reports', categories: 'Categories', settings: 'Settings',
};

const btnStyle = {
  height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
};

// children: screen-specific header widgets (month selector on dashboard/transactions — added in M2).
export default function Header({ children, titleOverride }) {
  const { pathname } = useLocation();
  const { data, prefs, setPrefs } = useStore();
  const seg = pathname.split('/')[1] || 'dashboard';
  const title = titleOverride || (pathname.startsWith('/accounts/') ? 'Account' : TITLES[seg] || 'Dashboard');
  const theme = prefs.theme;
  return (
    <header style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      {children}
      <div style={{ flex: 1 }} />
      {data && (
        <button
          onClick={() => setPrefs({ masked: !prefs.masked })}
          aria-pressed={String(prefs.masked)}
          className="hv-elev"
          style={btnStyle}
        >
          {prefs.masked ? 'Show amounts' : 'Hide amounts'}
        </button>
      )}
      <button
        onClick={() => setPrefs({ theme: theme === 'light' ? 'dark' : 'light' })}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        className="hv-elev"
        style={btnStyle}
      >
        {theme === 'light' ? '◐ Dark' : '◐ Light'}
      </button>
    </header>
  );
}
