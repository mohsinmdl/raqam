import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './store/StoreProvider.jsx';
import { UIProvider } from './ui/UIProvider.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import DataControls from './components/DataControls.jsx';

// Placeholder screens — replaced milestone by milestone.
const Stub = ({ name }) => (
  <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px', color: 'var(--muted)' }}>{name} — coming in a later milestone.</div>
);

function LoadError() {
  const { startFresh } = useStore();
  return (
    <div style={{ maxWidth: 520, margin: '60px auto 0', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '36px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Couldn't load your data</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
        The saved data on this device could not be read. A backup copy of the unreadable data was kept. Reload the page to try again, or start fresh.
      </div>
      <button onClick={startFresh} style={{ marginTop: 16, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Start fresh
      </button>
    </div>
  );
}

function Shell() {
  const { corrupt, prefs } = useStore();
  return (
    <div
      data-theme={prefs.theme}
      style={{
        display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', height: '100vh',
        background: 'var(--bg)', color: 'var(--text)',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
      }}
    >
      <Sidebar footer={<DataControls />} />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {corrupt ? <LoadError /> : (
            <Routes>
              <Route path="/dashboard" element={<Stub name="Dashboard" />} />
              <Route path="/transactions" element={<Stub name="Transactions" />} />
              <Route path="/accounts" element={<Stub name="Accounts" />} />
              <Route path="/accounts/:id" element={<Stub name="Account detail" />} />
              <Route path="/cards" element={<Stub name="Cards" />} />
              <Route path="/budgets" element={<Stub name="Budgets" />} />
              <Route path="/recurring" element={<Stub name="Recurring" />} />
              <Route path="/reports" element={<Stub name="Reports" />} />
              <Route path="/categories" element={<Stub name="Categories" />} />
              <Route path="/settings" element={<Stub name="Settings" />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <StoreProvider>
        <UIProvider>
          <Shell />
        </UIProvider>
      </StoreProvider>
    </HashRouter>
  );
}
