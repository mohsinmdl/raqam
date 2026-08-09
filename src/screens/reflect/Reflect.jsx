// Reflect: the reporting section shell. Hosts a five-tab segmented bar (same
// pill-toggle idiom as Plan's ViewToggle) and routes the selected tab into an
// Outlet. The month comes from the shared MonthContext and is handed down via
// outlet context so each tab (and Tasks 4-5's real content) can read it
// without re-subscribing.
import { NavLink, Outlet } from 'react-router-dom';
import { useMonth } from '../../store/MonthContext.jsx';

const TABS = [
  { to: '/reflect', label: 'Spending Breakdown', end: true },
  { to: '/reflect/trends', label: 'Spending Trends' },
  { to: '/reflect/net-worth', label: 'Net Worth' },
  { to: '/reflect/income-expense', label: 'Income v Expense' },
  { to: '/reflect/age-of-money', label: 'Age of Money' },
];

function TabBar() {
  return (
    <div role="tablist" aria-label="Reflect sections" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(125,109,63,.16)' }}>
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          style={({ isActive }) => ({
            height: 28, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            background: isActive ? 'var(--surface)' : 'transparent', color: isActive ? 'var(--text)' : 'var(--muted)',
            boxShadow: isActive ? 'var(--shadow)' : 'none',
          })}
        >{t.label}</NavLink>
      ))}
    </div>
  );
}

export default function Reflect() {
  const { month } = useMonth();

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>
        {/* Filters/Export land here in Task 6 — tab bar stays alone for now. */}
        <TabBar />
        <Outlet context={{ month }} />
      </div>
    </div>
  );
}
