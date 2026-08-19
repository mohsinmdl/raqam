// Reflect: the reporting section shell. Hosts a six-tab underline strip
// (minimal text tabs sitting on a hairline rail; scrolls horizontally instead
// of wrapping on narrow screens) and routes the selected tab into an Outlet.
// The month comes from the shared MonthContext and is handed down via outlet
// context so each tab can read it without re-subscribing.
//
// The first tab, Overview, is the former standalone Dashboard screen (now the
// index route) — the app's default landing surface. The remaining five tabs
// are the report views.
//
// The shell owns no category/account filter UI: Spending Breakdown — the only
// tab that ever read one — now owns its own range/category/account filter bar
// (ReportFilterBar) with its own local state, and the other five tabs
// (Overview + the four remaining charts) filter nothing. A shell-level
// FilterRow was therefore dead UI (no consumer) and has been removed along
// with the categoryId/accountId it fed onto the outlet context.
//
// Export: kept OUT of this shell and placed inside each tab page instead.
// Every tab already knows its own current rows/series and CSV columns; a
// shell-level button would need each tab to register an exporter on the
// outlet context (`registerExport`) just to hand back the same thing this
// component would otherwise call directly.
import { NavLink, Outlet } from 'react-router-dom';
import { useMonth } from '../../store/MonthContext.jsx';
import { useStore } from '../../store/StoreProvider.jsx';
import { isFirstUse } from '../../lib/txRow.js';

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
    // A minimal underline strip. These are navigation links (NavLink), not a
    // stateful ARIA tab widget — role="tablist" without role="tab" +
    // aria-selected was an incomplete pattern, so this is a plain nav-labelled
    // group. `.reflect-tabs` (theme.css) owns the hairline rail + hidden
    // horizontal scroll; the active link's 2px accent border overlaps the rail
    // (marginBottom:-1) so it reads as sitting on it. The transparent border on
    // idle tabs reserves the same height, so switching never shifts the row.
    <nav aria-label="Reflect reports" className="reflect-tabs">
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          style={({ isActive }) => ({
            flex: 'none', padding: '9px 1px', marginBottom: -1,
            borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
            fontSize: 13, fontWeight: isActive ? 600 : 500, whiteSpace: 'nowrap',
            textDecoration: 'none', color: isActive ? 'var(--text)' : 'var(--muted)',
            transition: 'color .15s ease',
          })}
        >{t.label}</NavLink>
      ))}
    </nav>
  );
}

export default function Reflect() {
  const { month, balanceMonth } = useMonth();
  const { data: S, prefs } = useStore();
  // The Overview (index) tab renders <FirstUse/> while setup is incomplete.
  // Framing that onboarding card with the report tab bar would invite a new
  // user to click into empty reports, so hide the bar until setup is complete
  // or skipped. Same condition Dashboard uses to decide to show <FirstUse/>.
  const firstUse = isFirstUse(S, prefs);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>
        {!firstUse && <TabBar />}
        <Outlet context={{ month, balanceMonth }} />
      </div>
    </div>
  );
}
