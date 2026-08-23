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

// Defaults: skippedSetup stays account-global; openPlanId (last-opened plan on
// this device) and pendingSeed (one-shot plan id to seed at next hydrate) are
// simply absent until set — JSON drops undefined, so absence IS the default.
// prefs.plans namespaces the per-plan view prefs (BR-U2-7):
//   plans: { [planId]: { customViews: [...], builtinViews: [...] } }
export function loadUserPrefs(uid, storage = localStorage) {
  // Migrating on every load (idempotent, pure) means no reader ever sees the
  // pre-plans flat keys, even before the migrated shape is first written back.
  return migrateFlatViewPrefs(readJson(userPrefsKey(uid), { skippedSetup: false, plans: {} }, storage));
}

export function writeUserPrefs(uid, obj, storage = localStorage) {
  return writeJson(userPrefsKey(uid), obj, storage);
}

// One-shot fold of the pre-plans flat Plan-screen view keys into the
// 'default' plan's namespace — that is where migration 0017 filed all
// existing data. `planViews` was the flat key for custom views (the screen's
// name for them); the namespace uses the design name `customViews`. The
// namespaced value wins over a flat leftover, so re-running never clobbers.
export function migrateFlatViewPrefs(prefs) {
  const { planViews, builtinViews, ...rest } = prefs;
  if (planViews === undefined && builtinViews === undefined) return prefs;
  const ns = { ...((rest.plans || {}).default || {}) };
  if (planViews !== undefined && ns.customViews === undefined) ns.customViews = planViews;
  if (builtinViews !== undefined && ns.builtinViews === undefined) ns.builtinViews = builtinViews;
  return { ...rest, plans: { ...(rest.plans || {}), default: ns } };
}

// The open plan's view namespace; {} for a plan with nothing saved yet.
export function planPrefs(prefs, planId) {
  return (prefs.plans || {})[planId] || {};
}
