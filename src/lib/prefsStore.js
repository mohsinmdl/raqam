// Device-local user prefs persistence (theme/mask/onboarding + Plan views).
// Pure and injectable so the failure path is unit-testable: localStorage.setItem
// throws on quota-exceeded, Safari private mode, and when storage is disabled —
// swallowing that silently makes a change look saved when it wasn't, so callers
// need the boolean to signal it. Financial records do NOT live here; they sync
// to Supabase. Losing this is losing settings, not money — hence a quiet badge,
// not an alarm.
export const userPrefsKey = uid => `raqam.prefs.u.${uid}`;

export function loadUserPrefs(uid, storage = localStorage) {
  try { return { skippedSetup: false, ...JSON.parse(storage.getItem(userPrefsKey(uid)) || '{}') }; }
  catch { return { skippedSetup: false }; }
}

// Returns true when the write landed, false when storage rejected it. Never throws.
export function writeUserPrefs(uid, obj, storage = localStorage) {
  try { storage.setItem(userPrefsKey(uid), JSON.stringify(obj)); return true; }
  catch { return false; }
}
