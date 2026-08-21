import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { monthLabel, relTime } from '../lib/calc.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { openers } from '../drawers/openers.js';
import Tooltip from '../ui/Tooltip.jsx';
import { SHORTCUT_BY_ID } from '../lib/shortcuts.js';
import { useAppLock } from '../ui/AppLockContext.jsx';
import TxMonthNav from './TxMonthNav.jsx';
import MonthGridPopover from './MonthGridPopover.jsx';
import { useIsPhone } from '../lib/useIsPhone.js';
import { showMonthSel } from '../lib/headerNav.js';

const TITLES = {
  dashboard: 'Dashboard', transactions: 'All Accounts', accounts: 'Accounts',
  budget: 'Budget', budgets: 'Budgets', recurring: 'Recurring', categories: 'Categories', settings: 'Settings',
  reflect: 'Reflect',
};

export default function Header() {
  const { pathname } = useLocation();
  // undo/redo stay wired here only for the global Cmd+Z / Cmd+Y shortcut below;
  // the visible buttons moved to the Transactions list toolbar.
  const { data: S, syncStatus, prefsSaved, undo, redo } = useStore();
  const { month, isPast, isFuture, prevDisabled, nextDisabled, goPrev, goNext, months, pick } = useMonth();
  const { drawer, openDrawer } = useDrawer();
  const { enabled: lockEnabled, lockNow } = useAppLock();
  const phoneHdr = useIsPhone();
  const { payeesOpen } = useUI();

  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      // Text fields own Cmd+Z; a drawer open over the table means a form is
      // mid-edit, and pulling the store out from under it would leave the
      // drawer editing a row that no longer exists. Manage Payees owns its
      // own scoped Undo/Redo buttons while open (spec decision 4) — the
      // global shortcut must stand down too, or it would reach across the
      // modal's undo boundary into pre-modal history.
      const el = document.activeElement;
      const tag = el ? el.tagName : '';
      if (drawer || payeesOpen || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, payeesOpen, undo, redo]);

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
  // not a single month, so it cannot share the stepper below. Reflect's
  // Spending Breakdown is likewise excluded (it owns a range picker) — see
  // showMonthSel in lib/headerNav.js for the full route rule.
  const monthSel = showMonthSel(pathname);
  const showTxNav = seg === 'transactions';
  // The four sidebar pages (Sidebar.jsx NAV) name themselves in the highlighted
  // nav item, so a big matching <h1> here just repeats it. Keep the heading for
  // the document outline / screen readers, but hide it visually. Content-specific
  // titles (scoped account nickname, recurring rule name) and non-sidebar pages
  // (Accounts, Settings) stay visible — they aren't duplicated by any nav label.
  const titleRedundant = seg === 'dashboard' || seg === 'reflect' || seg === 'transactions' || seg === 'budget';
  // The queue reports the rejected status as 'rejected' or 'rejected:<table>'
  // (rejectedStatus in store/sync.js), so match on the prefix and name the
  // table in the tooltip when there is one.
  const rejected = typeof syncStatus === 'string' && syncStatus.startsWith('rejected');
  const rejectedTable = rejected ? syncStatus.split(':')[1] || '' : '';

  return (
    <header className="app-header" style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      {acct ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          {/* On phone, Transactions.jsx renders its OWN <h1> with this same
              nickname in the register header block below (the account name
              is the page title there) — a second <h1> here would give
              heading-navigation AT two identically-named top-level headings
              with no way to tell "page title" from "top bar echo" apart
              (WCAG 1.3.1/2.4.6). So on phone this is a plain (non-heading)
              label; desktop has no such duplicate, so it stays the sole <h1>.
              `title` covers the visual "Ba…" truncation for sighted/zoom users. */}
          {phoneHdr ? (
            <div title={acct.nickname} style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.nickname}</div>
          ) : (
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.nickname}</h1>
          )}
          {/* overflow/ellipsis: without them the nowrap subtitle paints past a
              squeezed title block and smears under the month nav on phone. */}
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.type} · {reconLabel}</span>
        </div>
      ) : titleRedundant ? (
        // Redundant with the highlighted sidebar/tab item: keep the heading in
        // the a11y tree (visually-hidden, same precedent as TxSheet's status
        // span) but out of view, so the month control aligns to the left edge.
        <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: 0 }}>{title}</h1>
      ) : (
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      )}
      {monthSel && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg)' }}>
            <button onClick={goPrev} disabled={prevDisabled} aria-label="Previous month" className="hv-soft" style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, opacity: prevDisabled ? .4 : 1 }}>‹</button>
            {/* Stepper shows the month abbreviated to three letters (Aug, Sep …);
                monthLabel stays full-form for prose and range labels elsewhere. */}
            <MonthGridPopover month={month} months={months} pick={pick}
              triggerLabel={monthLabel(month).replace(/^(\w{3})\w*/, '$1')} />
            <button onClick={goNext} disabled={nextDisabled} aria-label="Next month" className="hv-soft" style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, opacity: nextDisabled ? .4 : 1 }}>›</button>
          </div>
          {isPast && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)' }}>Closed month</span>}
          {isFuture && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)' }}>Future month</span>}
        </>
      )}
      {showTxNav && <TxMonthNav />}
      <div style={{ flex: 1 }} />
      {lockEnabled && (
        <button onClick={lockNow} aria-label="Lock now" title="Lock now" className="hv-soft rq-btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', flex: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </button>
      )}
      {(syncStatus === 'retrying' || syncStatus === 'error') && (
        <span role="status" title="Changes are kept locally and pushed automatically when the connection recovers" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          Not saved — retrying
        </span>
      )}
      {/* 'rejected' is the dead-end branch of the sync queue (see run() in
          store/sync.js): the server refused this change and the queue has
          STOPPED retrying it, so it gets its own pill — an alert, not a
          status — and copy that never promises a retry. */}
      {rejected && (
        <span role="alert" title={'The server rejected this change' + (rejectedTable ? ' to ' + rejectedTable : '') + '. It will not be retried on its own — make another edit to try again, and note that reloading this page loses the change.'}
          style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--neg-soft)', color: 'var(--neg)' }}>
          Not saved — rejected
        </span>
      )}
      {prefsSaved === false && (
        <span role="status" title="This browser rejected saving your settings (storage full, private mode, or disabled). Your data is safe; only display settings on this device — including theme, amount masking, and other view preferences — won't persist." style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          Settings not saved here
        </span>
      )}
      {acct && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <button onClick={() => openers.editAccount(S, acct.id, openDrawer)} aria-label="Edit account" title="Edit account" className="hv-soft rq-btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
          </button>
          <Tooltip shortcut={SHORTCUT_BY_ID.reconcile} placement="bottom" align="end">
            <button onClick={() => openers.reconcile(S, acct.id, openDrawer)} className="hv-accent rq-btn-solid"
              style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              Reconcile
            </button>
          </Tooltip>
        </span>
      )}
    </header>
  );
}
