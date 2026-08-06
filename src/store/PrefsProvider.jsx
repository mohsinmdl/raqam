import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Device-level preferences (theme, amount masking) — localStorage-backed and
// mounted ABOVE auth so the login screen is themed too. Per-user prefs
// (skippedSetup) live with StoreProvider, which knows the signed-in user.
const KEY = 'raqam.prefs.v1';
const DEFAULTS = { theme: 'light', masked: true };

const Ctx = createContext(null);

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function PrefsProvider({ children }) {
  const [prefs, setPrefsState] = useState(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  // On the document element, not a wrapper div: custom properties only inherit
  // downward, and the drawer, confirm dialog and toast render as SIBLINGS of the
  // app shell (their providers emit them after {children}). Themed on a nested
  // div they resolved every var() against :root — the light palette — forever.
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme; }, [prefs.theme]);
  const value = useMemo(() => ({
    devicePrefs: prefs,
    setDevicePrefs: patch => setPrefsState(p => ({ ...p, ...patch })),
  }), [prefs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevicePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDevicePrefs outside PrefsProvider');
  return v;
}
