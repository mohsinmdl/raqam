// Reflect: the reporting section shell. Hosts a five-tab segmented bar (same
// pill-toggle idiom as Plan's ViewToggle) and routes the selected tab into an
// Outlet. The month comes from the shared MonthContext and is handed down via
// outlet context so each tab can read it without re-subscribing.
//
// categoryId/accountId ride along on the outlet context as constant `null`
// for shape stability (screens destructuring `{ month, balanceMonth,
// categoryId, accountId }` keep working), but the shell no longer owns a
// filter UI for them: Spending Breakdown — the only tab that ever read
// them — now owns its own range/category/account filter bar
// (ReportFilterBar) with its own local state; the other four tabs never
// read categoryId/accountId at all. A shell-level FilterRow was therefore
// dead UI (no consumer) and has been removed.
//
// Export: kept OUT of this shell and placed inside each tab page instead.
// Every tab already knows its own current rows/series and CSV columns; a
// shell-level button would need each tab to register an exporter on the
// outlet context (`registerExport`) just to hand back the same thing this
// component would otherwise call directly. Per-tab is the simpler, less
// coupled option the brief calls out as preferred.
import { NavLink, Outlet } from 'react-router-dom';
import { useMonth } from '../../store/MonthContext.jsx';

const TABS = [
  { to: '/reflect', label: 'Spending Breakdown', end: true },
  { to: '/reflect/trends', label: 'Spending Trends' },
  { to: '/reflect/net-worth', label: 'Net Worth' },
  { to: '/reflect/income-expense', label: 'Income v Expense' },
  { to: '/reflect/age-of-money', label: 'Age of Money' },
];

// categoryId/accountId are retained as null constants on the outlet context
// (see header comment) — no shell state needed for them any more.
const categoryId = null;
const accountId = null;

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
        <Outlet context={{ month, balanceMonth, categoryId, accountId }} />
      </div>
    </div>
  );
}
