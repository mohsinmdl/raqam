// Phone bottom tab bar — floating pill, YNAB section set: Home · Plan ·
// Spending · Accounts · Reflect. The add action moved to AddTxPill (floating
// "+ Transaction" above this bar). Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
import { NavLink } from 'react-router-dom';

const icon = d => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Line icons in the sidebar's 1.8-stroke language.
const ICONS = {
  home: 'M3 11l9-8 9 8M5 9.5V20h5v-5h4v5h5V9.5',
  plan: 'M12 3v18M5 8c0-2 14-2 14 0M5 8v8c0 2 14 2 14 0V8',
  spending: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5',
  accounts: 'M4 10h16M4 10l8-6 8 6M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16',
  reflect: 'M4 20v-9m5.33 9V4m5.34 16v-6M20 20V9',
};

const tabStyle = ({ isActive }) => ({
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  minHeight: 48, justifyContent: 'center', textDecoration: 'none', borderRadius: 999,
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
  return (
    <nav aria-label="Primary" style={{
      position: 'fixed', left: 10, right: 10,
      bottom: 'calc(8px + env(safe-area-inset-bottom))', zIndex: 40,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '6px 8px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 999,
      boxShadow: 'var(--shadow)',
    }}>
      <Tab to="/dashboard" label="Home" d={ICONS.home} />
      <Tab to="/budget" label="Plan" d={ICONS.plan} />
      <Tab to="/transactions" label="Spending" d={ICONS.spending} />
      <Tab to="/accounts" label="Accounts" d={ICONS.accounts} />
      <Tab to="/reflect" label="Reflect" d={ICONS.reflect} />
    </nav>
  );
}
