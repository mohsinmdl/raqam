// Budget hub: one screen hosting Budget, Categories, and Recurring as tabs.
// The three panels are the existing screens, rendered through <Outlet/>.
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/budget', label: 'Budget', end: true },
  { to: '/budget/categories', label: 'Categories' },
  { to: '/budget/recurring', label: 'Recurring' },
];

export default function BudgetHub() {
  return (
    <div>
      <div role="tablist" aria-label="Budget sections" style={{ display: 'flex', gap: 4, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            role="tab"
            className="hv-accent-fg"
            style={({ isActive }) => ({
              padding: '12px 4px', margin: '0 8px', fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
              color: isActive ? 'var(--text)' : 'var(--muted)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
