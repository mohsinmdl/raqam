// Shared local-storage persistence for BOTH device-level prefs (theme/mask,
// src/store/PrefsProvider.jsx) and per-user prefs (skippedSetup + Plan views,
// src/store/StoreProvider.jsx). Pure and injectable so the failure path is
// unit-testable: localStorage.setItem throws on quota-exceeded, Safari private
// mode, and when storage is disabled — swallowing that silently makes a change
// look saved when it wasn't, so callers need the boolean to signal it.
// Financial records do NOT live here; they sync to Supabase. Losing this is
// losing settings, not money — hence a quiet badge, not an alarm.
export const userPrefsKey = uid => `raqam.prefs.u.${uid}`;

// Returns true when the write landed, false when storage rejected it (or the
// value couldn't be serialized, e.g. a circular object). Never throws.
export function writeJson(key, obj, storage = localStorage) {
  try { storage.setItem(key, JSON.stringify(obj)); return true; }
  catch { return false; }
}

// Merges the stored object over `fallback`. Guards against non-object JSON
// (a stored array would otherwise spread its indices as keys; a stored
// number/string/null is simply ignored) and survives malformed JSON — both
// cases fall back to the defaults. Never throws.
export function readJson(key, fallback, storage = localStorage) {
  try {
    const p = JSON.parse(storage.getItem(key) || 'null');
    return { ...fallback, ...(p && typeof p === 'object' && !Array.isArray(p) ? p : {}) };
  } catch { return { ...fallback }; }
}

export function loadUserPrefs(uid, storage = localStorage) {
  return readJson(userPrefsKey(uid), { skippedSetup: false }, storage);
}

export function writeUserPrefs(uid, obj, storage = localStorage) {
  return writeJson(userPrefsKey(uid), obj, storage);
}
