import { NavLink, useLocation } from 'react-router-dom';
import AccountList from './AccountList.jsx';
import SidebarUser from './SidebarUser.jsx';

const NAV = [
  { to: '/budget', label: 'Budget' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/transactions', label: 'All Accounts' },
];

function NavButton({ to, label, active }) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      className="hv-elev"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 12px',
        border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)', fontSize: 14,
        fontWeight: active ? 600 : 500, cursor: 'pointer', textAlign: 'left', width: '100%', textDecoration: 'none',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? 'var(--accent)' : 'transparent', flex: 'none' }} />
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
    || (to === '/transactions' && pathname.startsWith('/accounts'));

  return (
    <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 14px' }}>
        <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>₨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Raqam</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Personal finance · PKR</div>
        </div>
      </div>
      <nav aria-label="Main" style={{ padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(n => <NavButton key={n.to} {...n} active={isActive(n.to)} />)}
      </nav>
      <AccountList />
      <SidebarUser />
    </aside>
  );
}
