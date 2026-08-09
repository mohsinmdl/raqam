// Reflect: the reporting section shell. Hosts a five-tab segmented bar (same
// pill-toggle idiom as Plan's ViewToggle) and routes the selected tab into an
// Outlet. The month comes from the shared MonthContext; category/account
// filters live here as shell state (Task 6) and are handed down alongside it
// via outlet context so each tab can read them without re-subscribing.
//
// Filters are shell-owned (one source of truth, no prop drilling through
// routes) but only Spending Breakdown consumes them today — the other four
// tabs ignore categoryId/accountId (noted on each tab).
//
// Export: kept OUT of this shell and placed inside each tab page instead.
// Every tab already knows its own current rows/series and CSV columns; a
// shell-level button would need each tab to register an exporter on the
// outlet context (`registerExport`) just to hand back the same thing this
// component would otherwise call directly. Per-tab is the simpler, less
// coupled option the brief calls out as preferred.
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMonth } from '../../store/MonthContext.jsx';
import { useStore } from '../../store/StoreProvider.jsx';

const TABS = [
  { to: '/reflect', label: 'Spending Breakdown', end: true },
  { to: '/reflect/trends', label: 'Spending Trends' },
  { to: '/reflect/net-worth', label: 'Net Worth' },
  { to: '/reflect/income-expense', label: 'Income v Expense' },
  { to: '/reflect/age-of-money', label: 'Age of Money' },
];

// Matches TxMonthNav.jsx's selStyle (~19-22) so the two filter selects read as
// the same control language as the rest of the app's header-area selects.
const selStyle = {
  height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5,
};

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

function FilterRow({ categoryId, setCategoryId, accountId, setAccountId }) {
  const { data: S } = useStore();
  const categories = [...(S.categories || [])]
    .filter(c => c.type === 'expense' && c.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));
  const accounts = [...(S.accounts || [])]
    .filter(a => a.status === 'active')
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select aria-label="Filter by category" value={categoryId || ''}
        onChange={e => setCategoryId(e.target.value || null)} style={selStyle}>
        <option value="">All Categories</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label="Filter by account" value={accountId || ''}
        onChange={e => setAccountId(e.target.value || null)} style={selStyle}>
        <option value="">All Accounts</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname}</option>)}
      </select>
    </div>
  );
}

export default function Reflect() {
  const { month } = useMonth();
  const [categoryId, setCategoryId] = useState(null);
  const [accountId, setAccountId] = useState(null);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <TabBar />
          <span style={{ flex: 1 }} />
          <FilterRow categoryId={categoryId} setCategoryId={setCategoryId} accountId={accountId} setAccountId={setAccountId} />
        </div>
        <Outlet context={{ month, categoryId, accountId }} />
      </div>
    </div>
  );
}
