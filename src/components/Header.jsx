import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';
import { monthLabel, shortDate, timeLabel } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import RecentMoves from './RecentMoves.jsx';

const TITLES = {
  dashboard: 'Dashboard', transactions: 'All Accounts', accounts: 'Accounts',
  budgets: 'Budgets', recurring: 'Recurring', reports: 'Reports', categories: 'Categories', settings: 'Settings',
};

const btnStyle = {
  height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
};

const iconBtnStyle = {
  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  color: 'var(--text)', fontSize: 14, cursor: 'pointer', flex: 'none',
};

function HistoryButton({ glyph, label, hint, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? label : label + ': ' + hint}
      className="hv-elev"
      style={{ ...iconBtnStyle, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}
    >
      {glyph}
    </button>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const { data: S, prefs, setPrefs, syncStatus, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useStore();
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
  if (pathname.startsWith('/accounts/')) {
    const acc = S?.accounts.find(a => a.id === decodeURIComponent(pathname.split('/')[2]));
    title = acc?.nickname || 'Account';
  }
  if (pathname.startsWith('/recurring/')) {
    const rule = S?.recurring.find(r => r.id === decodeURIComponent(pathname.split('/')[2]));
    title = rule?.name || 'Recurring';
  }
  // Not on transactions: its own date-range filter owns the dates there.
  const showMonthSel = seg === 'dashboard' || seg === 'budgets';
  const activeAccts = S ? S.accounts.filter(a => a.status === 'active') : [];
  const addDisabled = activeAccts.length === 0;
  const now = nowIso();
  const theme = prefs.theme;

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
      <div style={{ flex: 1 }} />
      {(syncStatus === 'retrying' || syncStatus === 'error') && (
        <span role="status" title="Changes are kept locally and pushed automatically when the connection recovers" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          Not saved — retrying
        </span>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {isPast && showMonthSel ? 'Closed month' : 'As of ' + shortDate(now) + ' · ' + timeLabel(now)}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <HistoryButton glyph="↶" label="Undo" hint={undoLabel || ''} disabled={!canUndo} onClick={undo} />
        <HistoryButton glyph="↷" label="Redo" hint={redoLabel || ''} disabled={!canRedo} onClick={redo} />
      </span>
      <RecentMoves />
      <button onClick={() => setPrefs({ masked: !prefs.masked })} aria-pressed={String(prefs.masked)} className="hv-elev" style={btnStyle}>
        {prefs.masked ? 'Show amounts' : 'Hide amounts'}
      </button>
      <button onClick={() => setPrefs({ theme: theme === 'light' ? 'dark' : 'light' })} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="hv-elev" style={btnStyle}>
        {theme === 'light' ? '◐ Dark' : '◐ Light'}
      </button>
      <button
        onClick={() => openers.addTx(openDrawer)}
        disabled={addDisabled}
        title={addDisabled ? 'Add a bank account first' : 'Record an expense, income, transfer, refund, or adjustment'}
        className="hv-accent"
        style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}
      >
        ＋ Add transaction
      </button>
    </header>
  );
}
