// Pure logic for opening a plan in its own tab/window. The device-wide
// openPlanId in localStorage can't tell a second tab which plan it belongs to,
// so two tab-scoped pieces sit in front of it:
//   - a ONE-SHOT pre-hash `?plan=<id>` that a new tab boots from (pre-hash, like
//     Supabase's `?code=`, because the app is a HashRouter — it stays out of every
//     route's own param space and the new tab keeps the current #/route), and
//   - a per-tab pin in sessionStorage (per-tab, survives reload, copied by
//     "Duplicate tab" — so the duplicate stays on the same plan even though its
//     ?plan= was consumed long ago) that PlanProvider consults before the
//     device-wide id.
// No DOM access at import time — browser globals are only reached for when a
// caller doesn't inject them — so all of it is testable under the node Vitest env.
const PLAN_PARAM = 'plan';

const paramsOf = search => new URLSearchParams(String(search || '').replace(/^\?/, ''));
const searchOf = params => { const s = params.toString(); return s ? '?' + s : ''; };

// The URL that opens `planId` on the current route: same path and #/route, safe
// as an <a href> or a window.open/location.replace target. Nothing else from the
// current query is carried over — all route state lives in the hash, and the one
// param the app ever has there (Supabase's one-time PKCE ?code=) must not be
// handed to another tab to redeem a second time.
export function planHref(planId, loc = window.location) {
  return (loc.pathname || '/') + '?' + PLAN_PARAM + '=' + encodeURIComponent(planId) + (loc.hash || '');
}

// The one-shot plan id a tab was opened with; null when absent or empty.
export function planIdFromSearch(search) {
  return paramsOf(search).get(PLAN_PARAM) || null;
}

// The search string with the plan param consumed and everything else kept
// (re-serialised by URLSearchParams; returned untouched when there is no plan
// param to strip).
export function stripPlanParam(search) {
  const params = paramsOf(search);
  if (!params.has(PLAN_PARAM)) return String(search || '');
  params.delete(PLAN_PARAM);
  return searchOf(params);
}

// Keyed per user: sessionStorage outlives sign-out, so an unkeyed pin would
// hand one user's plan id to the next sign-in in the same tab.
export const tabPlanKey = uid => `raqam.tabPlan.u.${uid}`;

// Storage can throw on getItem/setItem (quota, partly disabled) AND on merely
// reading window.sessionStorage (site data blocked) — so the default is resolved
// INSIDE the guard, never as a default argument. A tab that can't pin degrades
// to the device-wide id, never an error.
export function loadTabPlan(uid, storage) {
  try { return (storage ?? sessionStorage).getItem(tabPlanKey(uid)) || null; }
  catch { return null; }
}

export function writeTabPlan(uid, planId, storage) {
  if (!planId) return false;
  try { (storage ?? sessionStorage).setItem(tabPlanKey(uid), planId); return true; }
  catch { return false; }
}

// True when a click on a plan LINK should be left to the browser: a real user
// gesture it treats as "open this link somewhere else". (Middle-click arrives as
// `auxclick`, never `click`, so it never reaches a click handler at all.)
// isTrusted matters: Base UI re-dispatches SYNTHETIC clicks — Space on a focused
// row, drag-release over one — that copy the modifier flags, and a browser
// ignores modifiers on an untrusted click and navigates THIS tab instead.
// The new-tab modifier is per platform — ⌘ on Apple, Ctrl elsewhere; Shift (new
// window) everywhere. The OTHER one means nothing to the browser: Ctrl+Enter on a
// focused link on a Mac is a trusted ctrlKey click that it follows in THIS tab,
// so it must be intercepted like a plain click, not left alone.
const isApplePlatform = () => typeof navigator !== 'undefined'
  && /mac|iphone|ipad|ipod/i.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''));

export function isNewTabClick(e, apple = isApplePlatform()) {
  return !!e && e.isTrusted === true && (!!e.shiftKey || !!(apple ? e.metaKey : e.ctrlKey));
}
