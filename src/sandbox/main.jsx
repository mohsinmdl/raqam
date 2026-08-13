import React from 'react';
import { createRoot } from 'react-dom/client';
import Sandbox from './Sandbox.jsx';
// Reuse the real app tokens/typography so the harness renders in the true
// design language — nothing app-specific (no AuthProvider, no router, no store).
import '../styles/theme.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sandbox />
  </React.StrictMode>
);
