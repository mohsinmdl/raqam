import { NavLink, useLocation } from 'react-router-dom';

const MAIN = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'cards', label: 'Cards' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'categories', label: 'Categories' },
];
const PLANNED = [
  { id: 'recurring', label: 'Recurring' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

function NavButton({ id, label, active, small }) {
  return (
    <NavLink
      to={`/${id}`}
      aria-current={active ? 'page' : undefined}
      className="hv-elev"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, height: small ? 32 : 38, padding: '0 12px',
        border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)', fontSize: small ? 13 : 14,
        fontWeight: active ? 600 : 500, cursor: 'pointer', textAlign: 'left', width: '100%',
        textDecoration: 'none',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? 'var(--accent)' : 'transparent', flex: 'none' }} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ footer }) {
  const { pathname } = useLocation();
  // "Accounts" stays active on /accounts/:id (prototype navOf, script 860).
  const isActive = id => pathname === `/${id}` || (id === 'accounts' && pathname.startsWith('/accounts/'));
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
        {MAIN.map(n => <NavButton key={n.id} {...n} active={isActive(n.id)} />)}
      </nav>
      <div style={{ padding: '16px 24px 4px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.09em', color: 'var(--muted)' }}>PLANNED</div>
      <nav aria-label="Planned areas" style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {PLANNED.map(n => <NavButton key={n.id} {...n} active={isActive(n.id)} small />)}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {footer}
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Manual entry only · Synced to your account · Asia/Karachi</div>
      </div>
    </aside>
  );
}
