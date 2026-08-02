import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useDevicePrefs } from './PrefsProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { fetchAll, createSyncQueue } from './sync.js';
import { rolloverMonth } from './actions.js';
import { CATEGORIES } from './seed.js';
import { currentMonth } from '../lib/dates.js';
import LoadingScreen from '../components/LoadingScreen.jsx';

// Server-backed store. The in-memory store + pure actions are unchanged from the
// localStorage era; persistence is now: hydrate from Supabase once per login, then
// mirror every change through the diff-sync queue (src/store/sync.js).
const Ctx = createContext(null);

// Per-user, device-local prefs (currently just the onboarding skip flag).
const userPrefsKey = uid => `raqam.prefs.u.${uid}`;
const loadUserPrefs = uid => {
  try { return { skippedSetup: false, ...JSON.parse(localStorage.getItem(userPrefsKey(uid)) || '{}') }; }
  catch { return { skippedSetup: false }; }
};

function reducer(state, act) {
  switch (act.type) {
    case 'hydrate':
      return { ...state, status: 'ready', data: act.data };
    case 'hydrateError':
      return { ...state, status: 'error', error: act.error };
    case 'retry':
      return { ...state, status: 'loading', error: null };
    case 'data': // act.fn: (data) => newData — pure actions from actions.js
      return state.status === 'ready' ? { ...state, data: act.fn(state.data) } : state;
    case 'replaceData':
      return state.status === 'ready' ? { ...state, data: act.data } : state;
    default:
      return state;
  }
}

export function StoreProvider({ userId, children }) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', data: null, error: null });
  const { devicePrefs, setDevicePrefs } = useDevicePrefs();
  const { registerBeforeSignOut } = useAuth();
  const [userPrefs, setUserPrefs] = useState(() => loadUserPrefs(userId));
  const [syncStatus, setSyncStatus] = useState('synced');
  const queueRef = useRef(null);
  const pushTimer = useRef(null);

  // ---- hydrate once per login (StrictMode-safe) ----
  useEffect(() => {
    if (state.status !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const server = await fetchAll();
        if (cancelled) return;
        // First login: server has no categories yet — start from the defaults.
        // The differ (baseline = server state) pushes them as ordinary inserts.
        const base = server.categories.length ? server : { ...server, categories: CATEGORIES.map(c => ({ ...c })) };
        queueRef.current?.stop();
        queueRef.current = createSyncQueue({
          initialBaseline: server,
          onStatus: s => { if (!cancelled) setSyncStatus(s); },
        });
        // Month rollover runs against fresh server data; its changes sync like any edit.
        const rolled = rolloverMonth(base);
        dispatch({ type: 'hydrate', data: rolled });
        queueRef.current.update(rolled);
      } catch (e) {
        console.error('Raqam: hydration failed', e);
        if (!cancelled) dispatch({ type: 'hydrateError', error: e.message || 'Network error' });
      }
    })();
    return () => { cancelled = true; };
  }, [state.status]);

  useEffect(() => () => queueRef.current?.stop(), []);

  // ---- mirror store changes into the sync queue (debounced) ----
  useEffect(() => {
    if (state.status !== 'ready' || !queueRef.current) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => queueRef.current.update(state.data), 300);
    return () => clearTimeout(pushTimer.current);
  }, [state.data, state.status]);

  // Unsaved-changes prompt: only when the queue still holds undelivered writes.
  useEffect(() => {
    const onBeforeUnload = e => {
      const q = queueRef.current;
      if (q && !q.isClean()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Sign-out must not race in-flight pushes: drain first.
  useEffect(() => {
    registerBeforeSignOut(async () => {
      clearTimeout(pushTimer.current);
      if (queueRef.current && state.status === 'ready') {
        queueRef.current.update(state.data);
        await queueRef.current.drain();
      }
    });
    return () => registerBeforeSignOut(null);
  }, [registerBeforeSignOut, state.data, state.status]);

  // If the app stays open across a month boundary, roll the new month over.
  useEffect(() => {
    if (state.status !== 'ready') return;
    let known = currentMonth();
    const check = () => {
      if (currentMonth() !== known) {
        known = currentMonth();
        dispatch({ type: 'data', fn: rolloverMonth });
      }
    };
    const t = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [state.status]);

  const setPrefs = useCallback(patch => {
    const device = {}, user = {};
    Object.entries(patch).forEach(([k, v]) => {
      (k === 'theme' || k === 'masked' ? device : user)[k] = v;
    });
    if (Object.keys(device).length) setDevicePrefs(device);
    if (Object.keys(user).length) {
      setUserPrefs(p => {
        const next = { ...p, ...user };
        try { localStorage.setItem(userPrefsKey(userId), JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [setDevicePrefs, userId]);

  const value = useMemo(() => ({
    data: state.data,
    syncStatus,
    // Facade: consumers (Header, format.js, Dashboard) see one flat prefs object.
    prefs: { ...userPrefs, theme: devicePrefs.theme, masked: devicePrefs.masked },
    setPrefs,
    // apply a pure action: applyData(store => newStore)
    applyData: fn => dispatch({ type: 'data', fn }),
    replaceData: data => dispatch({ type: 'replaceData', data }),
    // Await everything reaching the server (used by the legacy import flow).
    drainSync: () => (queueRef.current ? queueRef.current.drain() : Promise.resolve(true)),
  }), [state.data, syncStatus, userPrefs, devicePrefs, setPrefs]);

  if (state.status === 'loading') return <LoadingScreen message="Loading your data…" />;
  if (state.status === 'error') {
    return <LoadingScreen error={state.error} onRetry={() => dispatch({ type: 'retry' })} />;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
export function usePrefs() {
  return useStore().prefs;
}
