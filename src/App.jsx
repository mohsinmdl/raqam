import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';

// Placeholder screens — replaced milestone by milestone.
const Stub = ({ name }) => (
  <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px', color: 'var(--muted)' }}>{name} — coming in a later milestone.</div>
);

export default function App() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('raqam.theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => { try { localStorage.setItem('raqam.theme', theme); } catch {} }, [theme]);

  return (
    <HashRouter>
      <div
        data-theme={theme}
        style={{
          display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', height: '100vh',
          background: 'var(--bg)', color: 'var(--text)',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
        }}
      >
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Header theme={theme} onToggleTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} />
          <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
