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
// The default storage is resolved INSIDE the guard, not as a default argument:
// with site data blocked, merely reading window.localStorage throws.
export function writeJson(key, obj, storage) {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(obj)); return true; }
  catch { return false; }
}

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

// The stored object, or null when nothing usable is there (absent, unreadable,
// malformed, or not an object). Never throws.
function readStored(key, storage) {
  try {
    const p = JSON.parse((storage ?? localStorage).getItem(key) || 'null');
    return isPlainObject(p) ? p : null;
  } catch { return null; }
}

// Merges the stored object over `fallback`. Guards against non-object JSON
// (a stored array would otherwise spread its indices as keys; a stored
// number/string/null is simply ignored) and survives malformed JSON — both
// cases fall back to the defaults. Never throws.
export function readJson(key, fallback, storage) {
  return { ...fallback, ...(readStored(key, storage) || {}) };
}

// Defaults: skippedSetup stays account-global; openPlanId (last-opened plan on
// this device) and pendingSeed (one-shot plan id to seed at next hydrate) are
// simply absent until set — JSON drops undefined, so absence IS the default.
// prefs.plans namespaces the per-plan view prefs (BR-U2-7):
//   plans: { [planId]: { customViews: [...], builtinViews: [...] } }
export function loadUserPrefs(uid, storage) {
  // Migrating on every load (idempotent, pure) means no reader ever sees the
  // pre-plans flat keys, even before the migrated shape is first written back.
  return migrateFlatViewPrefs(readJson(userPrefsKey(uid), { skippedSetup: false, plans: {} }, storage));
}

// loadUserPrefs, except null when nothing usable is stored — for a caller that
// is about to write and must tell "empty" from "couldn't read" (defaults look
// the same for both, and writing them back would erase what it couldn't see).
export function loadStoredUserPrefs(uid, storage) {
  return readStored(userPrefsKey(uid), storage) ? loadUserPrefs(uid, storage) : null;
}

export function writeUserPrefs(uid, obj, storage) {
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

// Tabs share this one blob (there can be a tab per plan), so every write is a
// read-modify-write: STORAGE is the base and only what this write changes is
// laid over it — `userPatch` for account-level keys, `planPatch` into this
// plan's view namespace. A tab's in-memory snapshot must never be the base: it
// is stale the moment another tab writes, and writing it back would erase that
// tab's saved views, its queued pendingSeed, or the device-wide openPlanId.
// An `undefined` in a patch clears the key (JSON drops it). Pure; tolerates a
// missing or malformed `stored`.
export function mergePrefsForWrite(stored, userPatch, planId, planPatch) {
  const base = isPlainObject(stored) ? stored : {};
  const plans = { ...(isPlainObject(base.plans) ? base.plans : {}) };
  if (planPatch && Object.keys(planPatch).length) plans[planId] = { ...(plans[planId] || {}), ...planPatch };
  return { ...base, ...userPatch, plans };
}

// The hydrate-time decision for NewPlanModal's one-shot seed flag: only the plan
// it NAMES consumes it. Some other plan's tab hydrating in between must neither
// seed itself nor eat the flag. A flag left naming a plan that never opens here
// is harmless — seedPlanCategories no-ops on a plan that already has categories.
export function consumePendingSeed(prefs, planId) {
  const mine = !!prefs && prefs.pendingSeed !== undefined && prefs.pendingSeed === planId;
  return { seed: mine, clear: mine };
}
