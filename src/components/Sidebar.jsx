import { NavLink, useLocation } from 'react-router-dom';
import AccountList from './AccountList.jsx';
import SidebarUser from './SidebarUser.jsx';

// Nav glyphs from the design: budget = ledger lines, reflect = bar chart,
// all accounts = a bank. Stroke icons take currentColor, so they follow the
// item's active/inactive colour for free. (Dashboard merged into Reflect as
// its Overview tab, so it no longer has a standalone nav item.)
const NAV = [
  { to: '/budget', label: 'Budget', icon: <path d="M3 7h18M3 12h18M3 17h12" /> },
  { to: '/reflect', label: 'Reflect', icon: <path d="M4 20V10M10 20V4M16 20v-7M20 20H2" /> },
  { to: '/transactions', label: 'All Accounts', icon: <path d="M4 10h16M4 10l8-6 8 6M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16" /> },
];

function NavButton({ to, label, icon, active }) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      className="hv-elev"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 40, padding: '0 12px',
        border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)', fontSize: 14,
        fontWeight: active ? 600 : 500, cursor: 'pointer', textAlign: 'left', width: '100%', textDecoration: 'none',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none', color: active ? 'var(--accent)' : 'var(--muted)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  // Budget stays lit across its tabs; All Accounts stays lit while browsing an
  // account's detail (the list rows live under it).
  const isActive = to =>
    pathname === to
    || (to === '/budget' && pathname.startsWith('/budget'))
    || (to === '/transactions' && pathname.startsWith('/transactions'))
    || (to === '/reflect' && pathname.startsWith('/reflect'));

  return (
    <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* No brand block — kept minimal. A little top padding is just breathing
          room so the nav isn't flush against the edge. */}
      <nav aria-label="Main" style={{ padding: '16px 12px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(n => <NavButton key={n.to} {...n} active={isActive(n.to)} />)}
      </nav>
      <AccountList />
      <SidebarUser />
    </aside>
  );
}
