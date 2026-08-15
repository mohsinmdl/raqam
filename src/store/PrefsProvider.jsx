import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, writeJson } from '../lib/prefsStore.js';

// Device-level preferences (theme, amount masking) — localStorage-backed and
// mounted ABOVE auth so the login screen is themed too. Per-user prefs
// (skippedSetup) live with StoreProvider, which knows the signed-in user.
// Persistence goes through the same tested helper (src/lib/prefsStore.js) as
// the per-user path, so a rejected write here is just as visible.
const KEY = 'raqam.prefs.v1';
// `masked` = the overall privacy toggle (profile menu, `H`, Plan/phone menu) —
// hides every amount EXCEPT the Dashboard "Current position" card.
// `maskedPosition` = the eye icon beside the hero balance — hides only that
// card's figures. The two are independent; both default hidden to match the
// pre-split first-load look.
const DEFAULTS = { theme: 'light', masked: true, maskedPosition: true, decimals: false, appLock: { enabled: false, credId: null } };

const Ctx = createContext(null);

function load() {
  return readJson(KEY, DEFAULTS);
}

export function PrefsProvider({ children }) {
  const [prefs, setPrefsState] = useState(load);
  // true after a device-local prefs write; false when storage rejected it
  // (quota/private mode/storage disabled). Combined into StoreProvider's
  // prefsSaved so the Header badge reflects theme/mask too, not just the
  // per-user prefs write.
  const [deviceSaved, setDeviceSaved] = useState(true);
  // Skip flipping the signal on the mount run — a private-mode load shouldn't
  // proactively badge before the user has changed anything — but still write
  // on mount, matching the user-prefs path (which only signals on explicit
  // change).
  const didMount = useRef(false);
  useEffect(() => {
    const ok = writeJson(KEY, prefs);
    if (didMount.current) setDeviceSaved(ok);
    didMount.current = true;
  }, [prefs]);
  // On the document element, not a wrapper div: custom properties only inherit
  // downward, and the drawer, confirm dialog and toast render as SIBLINGS of the
  // app shell (their providers emit them after {children}). Themed on a nested
  // div they resolved every var() against :root — the light palette — forever.
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme; }, [prefs.theme]);
  const value = useMemo(() => ({
    devicePrefs: prefs,
    setDevicePrefs: patch => setPrefsState(p => ({ ...p, ...patch })),
    deviceSaved,
  }), [prefs, deviceSaved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevicePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDevicePrefs outside PrefsProvider');
  return v;
}
