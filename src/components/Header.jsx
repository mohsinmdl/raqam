import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { monthLabel, shortDate, timeLabel } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import RecentMoves from './RecentMoves.jsx';
import TxMonthNav from './TxMonthNav.jsx';

const TITLES = {
  dashboard: 'Dashboard', transactions: 'All Accounts', accounts: 'Accounts',
  budget: 'Budget', budgets: 'Budgets', recurring: 'Recurring', reports: 'Reports', categories: 'Categories', settings: 'Settings',
};

export default function Header() {
  const { pathname } = useLocation();
  // undo/redo stay wired here only for the global Cmd+Z / Cmd+Y shortcut below;
  // the visible buttons moved to the Transactions list toolbar.
  const { data: S, syncStatus, undo, redo } = useStore();
  const { month, isPast, prevDisabled, nextDisabled, goPrev, goNext } = useMonth();
  const { drawer } = useDrawer();

  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      // Text fields own Cmd+Z; a drawer open over the table means a form is
      // mid-edit, and pulling the store out from under it would leave the
      // drawer editing a row that no longer exists.
      const el = document.activeElement;
      const tag = el ? el.tagName : '';
      if (drawer || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, undo, redo]);

  const seg = pathname.split('/')[1] || 'dashboard';
  let title = TITLES[seg] || 'Dashboard';
  if (pathname.startsWith('/accounts/')) {
    const acc = S?.accounts.find(a => a.id === decodeURIComponent(pathname.split('/')[2]));
    title = acc?.nickname || 'Account';
  }
  if (pathname.startsWith('/recurring/')) {
    const rule = S?.recurring.find(r => r.id === decodeURIComponent(pathname.split('/')[2]));
    title = rule?.name || 'Recurring';
  }
  // Transactions gets its own control in this slot: it filters by a date range,
  // not a single month, so it cannot share the stepper below.
  const showMonthSel = seg === 'dashboard' || pathname === '/budget';
  const showTxNav = seg === 'transactions';
  const now = nowIso();

  return (
    <header style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      {showMonthSel && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg)' }}>
            <button onClick={goPrev} disabled={prevDisabled} aria-label="Previous month" className="hv-soft" style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, opacity: prevDisabled ? .4 : 1 }}>‹</button>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 600, padding: '0 8px' }}>{monthLabel(month)}</span>
            <button onClick={goNext} disabled={nextDisabled} aria-label="Next month" className="hv-soft" style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, opacity: nextDisabled ? .4 : 1 }}>›</button>
          </div>
          {isPast && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)' }}>Closed month</span>}
        </>
      )}
      {showTxNav && <TxMonthNav />}
      <div style={{ flex: 1 }} />
      {(syncStatus === 'retrying' || syncStatus === 'error') && (
        <span role="status" title="Changes are kept locally and pushed automatically when the connection recovers" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          Not saved — retrying
        </span>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {isPast && showMonthSel ? 'Closed month' : 'As of ' + shortDate(now) + ' · ' + timeLabel(now)}
      </span>
      <RecentMoves />
    </header>
  );
}
