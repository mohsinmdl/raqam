import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider } from './store/StoreProvider.jsx';
import ImportLegacy from './components/ImportLegacy.jsx';
import { PrefsProvider } from './store/PrefsProvider.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import AuthScreen from './auth/AuthScreen.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import { MonthProvider } from './store/MonthContext.jsx';
import { TxViewProvider } from './store/TxViewContext.jsx';
import { UIProvider } from './ui/UIProvider.jsx';
import { DrawerProvider } from './ui/DrawerProvider.jsx';
import { drawerRegistry } from './drawers/index.js';
import GlobalShortcuts from './components/GlobalShortcuts.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Transactions from './screens/Transactions.jsx';
import Accounts from './screens/Accounts.jsx';
import Planned from './screens/Planned.jsx';
import Plan from './screens/Plan.jsx';
import Recurring from './screens/Recurring.jsx';
import RecurringDetail from './screens/RecurringDetail.jsx';
import BudgetHub from './screens/BudgetHub.jsx';
import Reflect from './screens/reflect/Reflect.jsx';
import SpendingBreakdown from './screens/reflect/SpendingBreakdown.jsx';
import SpendingTrends from './screens/reflect/SpendingTrends.jsx';
import NetWorth from './screens/reflect/NetWorth.jsx';
import IncomeVsExpense from './screens/reflect/IncomeVsExpense.jsx';
import AgeOfMoney from './screens/reflect/AgeOfMoney.jsx';
import { HeaderSlotProvider } from './ui/HeaderSlot.jsx';

// Sidebar width is user-draggable and remembered on the device (like theme).
const SB_MIN = 208, SB_MAX = 460, SB_DEFAULT = 236, SB_KEY = 'raqam.sidebarW';
const clampSb = w => Math.min(SB_MAX, Math.max(SB_MIN, w));

function Shell() {
  const [sbW, setSbW] = useState(() => {
    const v = Number(localStorage.getItem(SB_KEY));
    return v >= SB_MIN && v <= SB_MAX ? v : SB_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const startDrag = e => {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = ev => setSbW(clampSb(ev.clientX));
    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragging(false);
      try { localStorage.setItem(SB_KEY, String(clampSb(ev.clientX))); } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const resetWidth = () => { setSbW(SB_DEFAULT); try { localStorage.setItem(SB_KEY, String(SB_DEFAULT)); } catch {} };

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: `${sbW}px minmax(0,1fr)`, height: '100vh',
        background: 'var(--bg)', color: 'var(--text)',
        fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
      }}
    >
      <GlobalShortcuts />
      <Sidebar />
      {/* Drag handle sitting on the sidebar's right seam. A hairline stays
          invisible until hover/drag, then lights up in the accent colour. */}
      <div
        role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
        title="Drag to resize · double-click to reset"
        onMouseDown={startDrag} onDoubleClick={resetWidth}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position: 'absolute', top: 0, bottom: 0, left: sbW, width: 10, transform: 'translateX(-5px)', cursor: 'col-resize', zIndex: 50, display: 'flex', justifyContent: 'center' }}
      >
        <span aria-hidden="true" style={{ width: (dragging || hover) ? 3 : 2, height: '100%', background: (dragging || hover) ? 'var(--accent)' : 'transparent', transition: 'background .15s ease, width .15s ease' }} />
      </div>
      <HeaderSlotProvider>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:accountId" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/recurring/:id" element={<RecurringDetail />} />
            <Route path="/reports" element={<Navigate to="/reflect" replace />} />
            <Route path="/settings" element={<Planned />} />
            <Route path="/budget" element={<BudgetHub />}>
              <Route index element={<Plan />} />
              <Route path="recurring" element={<Recurring />} />
              {/* Stale sub-paths (e.g. the removed /budget/categories tab) land
                  back on the Budget screen rather than the app-wide dashboard. */}
              <Route path="*" element={<Navigate to="/budget" replace />} />
            </Route>
            <Route path="/reflect" element={<Reflect />}>
              <Route index element={<SpendingBreakdown />} />
              <Route path="trends" element={<SpendingTrends />} />
              <Route path="net-worth" element={<NetWorth />} />
              <Route path="income-expense" element={<IncomeVsExpense />} />
              <Route path="age-of-money" element={<AgeOfMoney />} />
              <Route path="*" element={<Navigate to="/reflect" replace />} />
            </Route>
            <Route path="/budgets" element={<Navigate to="/budget" replace />} />
            <Route path="/categories" element={<Navigate to="/budget" replace />} />
            <Route path="/recurring" element={<Navigate to="/budget/recurring" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      </HeaderSlotProvider>
    </div>
  );
}

// Auth gate — not a route: the requested #/route survives login untouched.
function Gate() {
  const { session, user, authLoading } = useAuth();
  if (authLoading) return <LoadingScreen message="Checking your session…" />;
  if (!session) return <AuthScreen />;
  return (
    // Keyed by user so switching accounts remounts the store with no stale state.
    <StoreProvider key={user.id} userId={user.id}>
      <MonthProvider>
        <TxViewProvider>
          <UIProvider>
            <DrawerProvider registry={drawerRegistry}>
              <Shell />
              <ImportLegacy />
            </DrawerProvider>
          </UIProvider>
        </TxViewProvider>
      </MonthProvider>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <PrefsProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </PrefsProvider>
    </HashRouter>
  );
}
