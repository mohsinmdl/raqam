// localStorage persistence for the whole app state.
// Shape on disk: { version, savedAt, data: <store>, prefs: { theme, masked, skippedSetup, snapDismissedMonth } }
const KEY = 'raqam.v1';

export const DEFAULT_PREFS = { theme: 'light', masked: true, skippedSetup: false, snapDismissedMonth: null };

// Step-up migrations keyed by the version they upgrade FROM. Bump CURRENT_VERSION and add a
// function here whenever the persisted shape changes; the key name never changes.
const CURRENT_VERSION = 1;
const MIGRATIONS = {
  // 1: (persisted) => ({ ...persisted, version: 2, ... })
};

function migrate(persisted) {
  let p = persisted;
  while (p.version < CURRENT_VERSION) {
    const step = MIGRATIONS[p.version];
    if (!step) throw new Error(`No migration from version ${p.version}`);
    p = step(p);
  }
  return p;
}

// Returns { kind: 'fresh' } | { kind: 'loaded', data, prefs } | { kind: 'corrupt' }.
// Synchronous by design — there is no async gap, so the app never needs a loading skeleton.
export function loadPersisted() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { return { kind: 'fresh' }; }
  if (raw == null) return { kind: 'fresh' };
  try {
    const p = migrate(JSON.parse(raw));
    if (!p.data || !Array.isArray(p.data.accounts)) throw new Error('bad shape');
    return { kind: 'loaded', data: p.data, prefs: { ...DEFAULT_PREFS, ...p.prefs } };
  } catch (e) {
    console.error('Raqam: could not read saved data', e);
    // Keep the unreadable payload so nothing is silently destroyed.
    try { localStorage.setItem(`${KEY}.corrupt-${Date.now()}`, raw); } catch {}
    return { kind: 'corrupt' };
  }
}

export function savePersisted(data, prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: CURRENT_VERSION, savedAt: new Date().toISOString(), data, prefs }));
  } catch (e) {
    console.error('Raqam: save failed', e);
  }
}

export function clearPersisted() {
  try { localStorage.removeItem(KEY); } catch {}
}

export const STORAGE_KEY = KEY;
