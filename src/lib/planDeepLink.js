// Pure logic for opening a plan in its own tab/window. The open plan used to
// be one device-wide localStorage id, so a second tab had no way to be told
// which plan it belongs to. Two pieces fix that:
//   - a ONE-SHOT pre-hash `?plan=<id>` that a new tab boots from (pre-hash, like
//     Supabase's `?code=`, because the app is a HashRouter — it stays out of every
//     route's own param space and the new tab keeps the current #/route), and
//   - a per-tab pin in sessionStorage (per-tab, survives reload, copied by
//     "Duplicate tab") that PlanProvider consults before the device-wide id.
// No DOM here so all of it is testable under the node Vitest env.
const PLAN_PARAM = 'plan';

const paramsOf = search => new URLSearchParams(String(search || '').replace(/^\?/, ''));
const searchOf = params => { const s = params.toString(); return s ? '?' + s : ''; };

// The URL that opens `planId` on the current route — used as a real <a href>, so
// the browser's own Ctrl/Cmd+click, Shift+click, middle-click and context menu
// all work. URLSearchParams would encode a space as '+'; keep it as %20 so the
// href reads like the rest of the app's hand-built links.
export function planHref(planId, loc = window.location) {
  const params = paramsOf(loc.search);
  params.delete(PLAN_PARAM);
  const rest = params.toString();
  const search = '?' + (rest ? rest + '&' : '') + PLAN_PARAM + '=' + encodeURIComponent(planId);
  return (loc.pathname || '/') + search + (loc.hash || '');
}

// The one-shot plan id a tab was opened with; null when absent or empty.
export function planIdFromSearch(search) {
  return paramsOf(search).get(PLAN_PARAM) || null;
}

// The search string with the plan param consumed and everything else kept.
export function stripPlanParam(search) {
  const params = paramsOf(search);
  if (!params.has(PLAN_PARAM)) return String(search || '');
  params.delete(PLAN_PARAM);
  return searchOf(params);
}

export const tabPlanKey = uid => `raqam.tabPlan.u.${uid}`;

// sessionStorage throws on access when storage is disabled (Safari private
// mode) — a tab that can't pin degrades to the device-wide id, never an error.
export function loadTabPlan(uid, storage = sessionStorage) {
  try { return storage.getItem(tabPlanKey(uid)) || null; }
  catch { return null; }
}

export function writeTabPlan(uid, planId, storage = sessionStorage) {
  try { storage.setItem(tabPlanKey(uid), planId); return true; }
  catch { return false; }
}

// The gestures a browser treats as "open this link somewhere else".
export function isNewTabClick(e) {
  return !!e && (!!e.metaKey || !!e.ctrlKey || !!e.shiftKey || e.button === 1);
}
