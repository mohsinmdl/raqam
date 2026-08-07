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
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Transactions from './screens/Transactions.jsx';
import Accounts from './screens/Accounts.jsx';
import AccountDetail from './screens/AccountDetail.jsx';
import Planned from './screens/Planned.jsx';
import Categories from './screens/Categories.jsx';
import Budgets from './screens/Budgets.jsx';
import Recurring from './screens/Recurring.jsx';
import RecurringDetail from './screens/RecurringDetail.jsx';
import BudgetHub from './screens/BudgetHub.jsx';

function Shell() {
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', height: '100vh',
        background: 'var(--bg)', color: 'var(--text)',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
      }}
    >
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/:id" element={<AccountDetail />} />
            <Route path="/recurring/:id" element={<RecurringDetail />} />
            <Route path="/reports" element={<Planned />} />
            <Route path="/settings" element={<Planned />} />
            <Route path="/budget" element={<BudgetHub />}>
              <Route index element={<Budgets />} />
              <Route path="categories" element={<Categories />} />
              <Route path="recurring" element={<Recurring />} />
            </Route>
            <Route path="/budgets" element={<Navigate to="/budget" replace />} />
            <Route path="/categories" element={<Navigate to="/budget/categories" replace />} />
            <Route path="/recurring" element={<Navigate to="/budget/recurring" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
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
