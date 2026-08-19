// Reflect: the reporting section shell. Hosts a six-tab segmented bar (same
// pill-toggle idiom as Plan's ViewToggle) and routes the selected tab into an
// Outlet. The month comes from the shared MonthContext and is handed down via
// outlet context so each tab can read it without re-subscribing.
//
// The first tab, Overview, is the former standalone Dashboard screen (now the
// index route) — the app's default landing surface. The remaining five tabs
// are the report views.
//
// The shell owns no category/account filter UI: Spending Breakdown — the only
// tab that ever read one — now owns its own range/category/account filter bar
// (ReportFilterBar) with its own local state, and the other five tabs
// (Overview + the four remaining charts) filter nothing. A shell-level FilterRow was therefore dead UI (no consumer) and has
// been removed along with the categoryId/accountId it fed onto the outlet
// context.
//
// Export: kept OUT of this shell and placed inside each tab page instead.
// Every tab already knows its own current rows/series and CSV columns; a
// shell-level button would need each tab to register an exporter on the
// outlet context (`registerExport`) just to hand back the same thing this
// component would otherwise call directly.
import { NavLink, Outlet } from 'react-router-dom';
import { useMonth } from '../../store/MonthContext.jsx';

const TABS = [
  { to: '/reflect', label: 'Overview', end: true },
  { to: '/reflect/spending', label: 'Spending Breakdown' },
  { to: '/reflect/trends', label: 'Spending Trends' },
  { to: '/reflect/net-worth', label: 'Net Worth' },
  { to: '/reflect/income-expense', label: 'Income v Expense' },
  { to: '/reflect/age-of-money', label: 'Age of Money' },
];

function TabBar() {
  return (
    // These are navigation links (NavLink), not a stateful ARIA tab widget —
    // role="tablist" without role="tab" + aria-selected on the children was
    // an incomplete pattern. A plain nav-labelled group is the honest fix.
    <div aria-label="Reflect reports" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(125,109,63,.16)' }}>
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
  const { month, balanceMonth } = useMonth();

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <TabBar />
        </div>
        <Outlet context={{ month, balanceMonth }} />
      </div>
    </div>
  );
}
