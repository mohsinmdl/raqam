import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './store/StoreProvider.jsx';
import { PlanProvider, usePlan } from './store/PlanProvider.jsx';
import LockScreen from './components/LockScreen.jsx';
import { AppLockContext } from './ui/AppLockContext.jsx';
import { shouldLock } from './lib/appLock.js';
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
import DevTools from './screens/DevTools.jsx';
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
import { useIsPhone } from './lib/useIsPhone.js';
import MobileTabBar from './components/MobileTabBar.jsx';
import AddTxPill from './components/AddTxPill.jsx';
import ManagePayees from './ui/payees/ManagePayees.jsx';
import PasteSmsEntry from './ui/ai/PasteSmsEntry.jsx';
import ReceiptScanEntry from './ui/ai/ReceiptScanEntry.jsx';
import CommandPalette from './ui/command/CommandPalette.jsx';
import { useDrawer } from './ui/DrawerProvider.jsx';

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
  const phone = useIsPhone();
  // U2 sms-parse: the paste sheet reads the 'pasteSms' drawer slot (opened by
  // openers.pasteSms). Held-mounted here like ManagePayees.
  const { drawer, closeDrawer } = useDrawer();

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : `${sbW}px minmax(0,1fr)`,
        height: phone ? '100dvh' : '100vh',
        background: 'var(--bg)', color: 'var(--text)',
        fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
      }}
    >
      <GlobalShortcuts />
      <CommandPalette />
      <ManagePayees />
      <PasteSmsEntry open={drawer?.name === 'pasteSms'} onClose={closeDrawer} />
      <ReceiptScanEntry open={drawer?.name === 'scanReceipt'} onClose={closeDrawer} />
      {!phone && <Sidebar />}
      {/* Drag handle sitting on the sidebar's right seam. A hairline stays
          invisible until hover/drag, then lights up in the accent colour. */}
      {!phone && (
        <div
          role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
          title="Drag to resize · double-click to reset"
          onMouseDown={startDrag} onDoubleClick={resetWidth}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ position: 'absolute', top: 0, bottom: 0, left: sbW, width: 10, transform: 'translateX(-5px)', cursor: 'col-resize', zIndex: 50, display: 'flex', justifyContent: 'center' }}
        >
          {/* Fixed 3px width; the hover/drag "thicken" is a composited scaleX
              (transformOrigin centre keeps it on the seam) rather than an
              animated width, so the transition never triggers layout. */}
          <span aria-hidden="true" style={{ width: 3, height: '100%', background: (dragging || hover) ? 'var(--accent)' : 'transparent', transform: (dragging || hover) ? 'scaleX(1)' : 'scaleX(0.667)', transformOrigin: 'center', transition: 'background .15s ease, transform .15s ease' }} />
        </div>
      )}
      <HeaderSlotProvider>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Header />
        {/* Phone: clear the fixed tab bar (--phone-nav-clearance) PLUS the
            floating AddTxPill (48px pill + 8px gap) so the last row is never
            hidden behind either piece of bottom chrome. */}
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0,
          paddingBottom: phone ? 'calc(var(--phone-nav-clearance) + 56px)' : 0 }}>
          <Routes>
            {/* Dashboard merged into Reflect as its "Overview" index tab.
                Old bookmarks / deep-links to /dashboard land there. */}
            <Route path="/dashboard" element={<Navigate to="/reflect" replace />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:accountId" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/recurring/:id" element={<RecurringDetail />} />
            <Route path="/reports" element={<Navigate to="/reflect" replace />} />
            <Route path="/settings" element={<Planned />} />
            <Route path="/dev-tools" element={<DevTools />} />
            <Route path="/budget" element={<BudgetHub />}>
              <Route index element={<Plan />} />
              <Route path="recurring" element={<Recurring />} />
              {/* Stale sub-paths (e.g. the removed /budget/categories tab) land
                  back on the Budget screen rather than the app-wide dashboard. */}
              <Route path="*" element={<Navigate to="/budget" replace />} />
            </Route>
            <Route path="/reflect" element={<Reflect />}>
              <Route index element={<Dashboard />} />
              <Route path="spending" element={<SpendingBreakdown />} />
              <Route path="trends" element={<SpendingTrends />} />
              <Route path="net-worth" element={<NetWorth />} />
              <Route path="income-expense" element={<IncomeVsExpense />} />
              <Route path="age-of-money" element={<AgeOfMoney />} />
              <Route path="*" element={<Navigate to="/reflect" replace />} />
            </Route>
            <Route path="/budgets" element={<Navigate to="/budget" replace />} />
            <Route path="/categories" element={<Navigate to="/budget" replace />} />
            <Route path="/recurring" element={<Navigate to="/budget/recurring" replace />} />
            <Route path="*" element={<Navigate to="/reflect" replace />} />
          </Routes>
        </main>
        {phone && <AddTxPill />}
        {phone && <MobileTabBar />}
      </div>
      </HeaderSlotProvider>
    </div>
  );
}

// Sits inside StoreProvider (needs prefs) and AuthProvider (needs signOut).
// Cold launch always locks when enabled; and the app relocks THE MOMENT it
// goes to the background (no inactivity grace) — so a peek at the app switcher
// or a quick tab-away already re-locks it.
function AppLockGate({ children }) {
  const { prefs, setPrefs } = useStore();
  const { signOut } = useAuth();
  const enabled = !!prefs.appLock?.enabled;
  const [locked, setLocked] = useState(enabled);
  // Holds the LockScreen mounted from the moment Sign out is tapped until the
  // session actually drops (Gate then swaps to <AuthScreen/> and unmounts this
  // whole tree). Without it, clearing the pref flips `enabled` false and the
  // Shell — all financial data — would render while signOut() is still
  // draining/revoking (fail-open). Never reset on rejection: fail-closed.
  const [signingOut, setSigningOut] = useState(false);
  // Lock immediately on hide. iOS fires visibilitychange→hidden just before it
  // freezes the page, so the overlay is already up when the user returns; the
  // LockScreen re-fires its biometric prompt on becoming visible again.
  useEffect(() => {
    const onVis = () => {
      if (enabled && document.visibilityState === 'hidden') setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);
  // If the user disables the lock while it's showing (not reachable today, but
  // keeps state honest), drop the overlay.
  useEffect(() => { if (!enabled) setLocked(false); }, [enabled]);
  // Manual "lock now" (the L keyboard shortcut, dispatched by GlobalShortcuts).
  // Gated on `enabled` so a disabled app can never be trapped behind a lock
  // screen it has no credId to unlock.
  useEffect(() => {
    if (!enabled) return undefined;
    const onLockNow = () => setLocked(true);
    window.addEventListener('raqam:lock-now', onLockNow);
    return () => window.removeEventListener('raqam:lock-now', onLockNow);
  }, [enabled]);
  // Manual "Lock now" from the header icon. Setting locked only shows the
  // overlay when a lock is configured (the render guard needs `enabled` too),
  // so this is a no-op when off — and the icon is hidden then anyway.
  const lockNow = useCallback(() => setLocked(true), []);
  const lockCtx = useMemo(() => ({ enabled, lockNow }), [enabled, lockNow]);
  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true); // holds the LockScreen up regardless of enabled/locked
    try {
      await signOut();
      // Success only: clear so a re-login isn't locked with a dead credId
      // (the escape-hatch path — passkey deleted in OS settings — still works
      // because signOut() is a Supabase op, unaffected by the passkey).
      setPrefs({ appLock: { enabled: false, credId: null } });
    } catch {
      // Fail-closed: the session is still alive and the pref stays enabled.
      // The overlay remains (signingOut never resets), and because the pref
      // was NOT cleared, a reload re-locks instead of exposing the session.
    }
  };
  if (signingOut || (enabled && locked)) {
    return (
      <LockScreen
        credId={prefs.appLock?.credId}
        signingOut={signingOut}
        onUnlock={() => setLocked(false)}
        onSignOut={onSignOut}
      />
    );
  }
  return <AppLockContext.Provider value={lockCtx}>{children}</AppLockContext.Provider>;
}

// Bridges the resolved open plan into the store. PlanProvider only renders
// children once a plan is open, so openPlanId is always set here.
function PlannedStore({ userId, children }) {
  const { openPlanId } = usePlan();
  return <StoreProvider userId={userId} planId={openPlanId}>{children}</StoreProvider>;
}

// Auth gate — not a route: the requested #/route survives login untouched.
function Gate() {
  const { session, user, authLoading } = useAuth();
  if (authLoading) return <LoadingScreen message="Checking your session…" />;
  if (!session) return <AuthScreen />;
  return (
    // Keyed by user so switching accounts remounts plans + store with no stale state.
    <PlanProvider key={user.id} userId={user.id}>
      <PlannedStore userId={user.id}>
      <MonthProvider>
        <TxViewProvider>
          <UIProvider>
            <DrawerProvider registry={drawerRegistry}>
              <AppLockGate>
                <Shell />
                <ImportLegacy />
              </AppLockGate>
            </DrawerProvider>
          </UIProvider>
        </TxViewProvider>
      </MonthProvider>
      </PlannedStore>
    </PlanProvider>
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
