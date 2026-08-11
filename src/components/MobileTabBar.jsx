// Phone bottom tab bar: Dash · Tx · [+] · Budget · Accounts. The center [+]
// is the screen's one prominent teal action — it opens the add-transaction
// sheet (expense default). Active tab = Soft Teal per the nav-item idiom.
import { NavLink } from 'react-router-dom';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';

const icon = d => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Line icons in the sidebar's 1.8-stroke language.
const ICONS = {
  dash: 'M4 13h6V5H4v8zm10 6h6v-8h-6v8zM4 19h6v-4H4v4zm10-10h6V5h-6v4z',
  tx: 'M4 7h13M13 3l4 4-4 4M20 17H7m4-4l-4 4 4 4',
  budget: 'M12 3v18M5 8c0-2 14-2 14 0M5 8v8c0 2 14 2 14 0V8',
  accounts: 'M4 10h16M4 10l8-6 8 6M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16',
};

const tabStyle = ({ isActive }) => ({
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  minHeight: 48, justifyContent: 'center', textDecoration: 'none', borderRadius: 10,
  color: isActive ? 'var(--text)' : 'var(--muted)',
  background: isActive ? 'var(--soft)' : 'transparent',
  fontSize: 10.5, fontWeight: isActive ? 600 : 500,
});
const Tab = ({ to, label, d }) => (
  <NavLink to={to} style={tabStyle} aria-label={label}>
    {({ isActive }) => (
      <>
        <span style={{ color: isActive ? 'var(--accent)' : 'inherit', display: 'flex' }}>{icon(d)}</span>
        {label}
      </>
    )}
  </NavLink>
);

export default function MobileTabBar() {
  const { openDrawer } = useDrawer();
  return (
    <nav aria-label="Primary" style={{
      display: 'flex', alignItems: 'center', gap: 4, flex: 'none',
      padding: '6px 10px calc(6px + env(safe-area-inset-bottom))',
      background: 'var(--surface)', borderTop: '1px solid var(--border)',
    }}>
      <Tab to="/dashboard" label="Dash" d={ICONS.dash} />
      <Tab to="/transactions" label="Tx" d={ICONS.tx} />
      <button onClick={() => openers.addTx(openDrawer)} aria-label="Add transaction"
        style={{
          width: 52, height: 52, margin: '0 6px', flex: 'none', border: 'none', borderRadius: 999,
          background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 26, lineHeight: 1,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} className="hv-accent">＋</button>
      <Tab to="/budget" label="Budget" d={ICONS.budget} />
      <Tab to="/accounts" label="Accounts" d={ICONS.accounts} />
    </nav>
  );
}
