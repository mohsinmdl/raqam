import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useDevicePrefs } from './PrefsProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { fetchAll, createSyncQueue } from './sync.js';
import { rolloverMonth } from './actions.js';
import { CATEGORIES } from './seed.js';
import { currentMonth } from '../lib/dates.js';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { makeAudit } from './audit.js';
import { applyRedo, applyUndo, emptyStacks, labelFor, recordChange, redoLabel, undoLabel } from '../lib/undo.js';

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

export function reducer(state, act) {
  switch (act.type) {
    case 'hydrate':
      // Fresh data from the server: any stack from before is meaningless.
      return { ...state, status: 'ready', data: act.data, ...emptyStacks() };
    case 'hydrateError':
      return { ...state, status: 'error', error: act.error };
    case 'retry':
      return { ...state, status: 'loading', error: null };
    case 'data': { // act.fn: (data) => newData — pure actions from actions.js
      if (state.status !== 'ready') return state;
      const next = act.fn(state.data);
      // Actions no-op by returning the same reference; nothing to undo.
      if (next === state.data) return state;
      // act.system: month rollover and other machine-initiated changes are not
      // the user's to undo — and they also invalidate every snapshot taken
      // before them: an older `past` entry predates this month's opening
      // snapshots, so restoring it would delete rows the sync differ now
      // treats as real deletes. Losing undo history at a system boundary is
      // the correct, conventional trade; silently corrupting the new month
      // is not.
      if (act.system) return { ...state, data: next, ...emptyStacks() };
      return { ...state, data: next, ...recordChange(state, state.data, labelFor(state.data, next)) };
    }
    case 'undo': {
      const out = state.status === 'ready' ? applyUndo(state, act.auditRow) : null;
      return out ? { ...state, ...out } : state;
    }
    case 'redo': {
      const out = state.status === 'ready' ? applyRedo(state, act.auditRow) : null;
      return out ? { ...state, ...out } : state;
    }
    case 'replaceData':
      // Legacy import and other wholesale replacements: not undoable.
      return state.status === 'ready' ? { ...state, data: act.data, ...emptyStacks() } : state;
    default:
      return state;
  }
}

export function StoreProvider({ userId, children }) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', data: null, error: null, ...emptyStacks() });
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
        // NOTE: onStatus must NOT be gated on `cancelled` — this effect re-runs
        // (and flips cancelled) the moment hydration lands, but the queue lives on.
        // React 18 no-ops setState after unmount, so the raw call is safe.
        queueRef.current = createSyncQueue({
          initialBaseline: server,
          onStatus: setSyncStatus,
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

  // Symmetric lifecycle: HMR runs this cleanup without a real remount, so the
  // (re-)run must undo the stop or the queue stays silenced and writes never push.
  useEffect(() => {
    queueRef.current?.resume?.();
    return () => queueRef.current?.stop();
  }, []);

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
        dispatch({ type: 'data', fn: rolloverMonth, system: true });
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
    undo: () => dispatch({ type: 'undo', auditRow: makeAudit({
      entityType: 'app', entityId: 'undo', action: 'undo',
      summary: 'Undid: ' + (undoLabel(state) || 'last change'),
    }) }),
    redo: () => dispatch({ type: 'redo', auditRow: makeAudit({
      entityType: 'app', entityId: 'redo', action: 'redo',
      summary: 'Redid: ' + (redoLabel(state) || 'last change'),
    }) }),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoLabel: undoLabel(state),
    redoLabel: redoLabel(state),
  }), [state.data, state.past, state.future, syncStatus, userPrefs, devicePrefs, setPrefs]);

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
