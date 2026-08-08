import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { monthLabel, relTime } from '../lib/calc.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { openers } from '../drawers/openers.js';
import Tooltip from '../ui/Tooltip.jsx';
import { SHORTCUT_BY_ID } from '../lib/shortcuts.js';
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
  const { drawer, openDrawer } = useDrawer();

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
  // Scoped ledger (/transactions/:accountId): the top bar IS the account header
  // — nickname title + a "type · reconcile status" subtitle + edit/Reconcile
  // buttons on the right. (No in-content header band any more.)
  const acct = pathname.startsWith('/transactions/')
    ? S?.accounts.find(a => a.id === decodeURIComponent(pathname.split('/')[2]))
    : null;
  if (acct) title = acct.nickname;
  if (pathname.startsWith('/recurring/')) {
    const rule = S?.recurring.find(r => r.id === decodeURIComponent(pathname.split('/')[2]));
    title = rule?.name || 'Recurring';
  }
  const acctSnap = acct ? S.snapshots.find(s => s.accountId === acct.id && s.month === currentMonth()) : null;
  const reconLabel = acctSnap && acctSnap.status === 'confirmed' ? 'Reconciled ' + relTime(acctSnap.confirmedAt, nowIso()) : 'Not reconciled';
  // Transactions gets its own control in this slot: it filters by a date range,
  // not a single month, so it cannot share the stepper below.
  const showMonthSel = seg === 'dashboard' || pathname === '/budget';
  const showTxNav = seg === 'transactions';

  return (
    <header style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      {acct ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.nickname}</h1>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{acct.type} · {reconLabel}</span>
        </div>
      ) : (
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      )}
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
      {acct && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <button onClick={() => openers.editAccount(S, acct.id, openDrawer)} aria-label="Edit account" title="Edit account" className="hv-soft"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
          </button>
          <Tooltip shortcut={SHORTCUT_BY_ID.reconcile} placement="bottom">
            <button onClick={() => openers.reconcile(S, acct.id, openDrawer)} className="hv-accent"
              style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              Reconcile
            </button>
          </Tooltip>
        </span>
      )}
    </header>
  );
}
