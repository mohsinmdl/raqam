import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { loadPersisted, savePersisted, clearPersisted, DEFAULT_PREFS, STORAGE_KEY } from './persistence.js';
import { rolloverMonth } from './actions.js';
import { freshStore } from './seed.js';
import { currentMonth } from '../lib/dates.js';

const Ctx = createContext(null);

function reducer(state, act) {
  switch (act.type) {
    case 'data': // act.fn: (data) => newData — pure actions from actions.js
      return { ...state, data: act.fn(state.data) };
    case 'replaceData':
      return { ...state, corrupt: false, data: act.data, prefs: act.prefs ?? state.prefs };
    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...act.patch } };
    default:
      return state;
  }
}

function init() {
  const loaded = loadPersisted();
  if (loaded.kind === 'loaded') return { corrupt: false, data: rolloverMonth(loaded.data), prefs: loaded.prefs };
  if (loaded.kind === 'corrupt') return { corrupt: true, data: null, prefs: { ...DEFAULT_PREFS } };
  return { corrupt: false, data: freshStore(), prefs: { ...DEFAULT_PREFS } };
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const saveTimer = useRef(null);

  // Debounced persistence; flush on tab hide/unload.
  useEffect(() => {
    if (state.corrupt || !state.data) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePersisted(state.data, state.prefs), 250);
    const flush = () => savePersisted(state.data, state.prefs);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(saveTimer.current);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [state.data, state.prefs, state.corrupt]);

  // If the app stays open across a month boundary, roll the new month over on re-focus / once a minute.
  useEffect(() => {
    if (state.corrupt) return;
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
  }, [state.corrupt]);

  // Cross-tab safety: adopt another tab's save.
  useEffect(() => {
    const onStorage = e => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      try {
        const p = JSON.parse(e.newValue);
        if (p.data) dispatch({ type: 'replaceData', data: p.data, prefs: { ...DEFAULT_PREFS, ...p.prefs } });
      } catch { /* another tab wrote something unreadable; keep ours */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({
    corrupt: state.corrupt,
    data: state.data,
    prefs: state.prefs,
    // apply a pure action: applyData(store => newStore)
    applyData: fn => dispatch({ type: 'data', fn }),
    replaceData: data => dispatch({ type: 'replaceData', data }),
    setPrefs: patch => dispatch({ type: 'prefs', patch }),
    startFresh: () => { clearPersisted(); dispatch({ type: 'replaceData', data: freshStore(), prefs: { ...DEFAULT_PREFS } }); },
  }), [state]);

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
