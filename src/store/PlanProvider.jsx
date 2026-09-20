import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPlans, setActivePlanId } from './sync.js';
import { setActiveFormat } from '../lib/planFormat.js';
import { loadUserPrefs, writeUserPrefs } from '../lib/prefsStore.js';
import { planHref, planIdFromSearch, stripPlanParam, loadTabPlan, writeTabPlan } from '../lib/planDeepLink.js';
import LoadingScreen from '../components/LoadingScreen.jsx';
import FirstPlanSetup from '../ui/plans/FirstPlanSetup.jsx';

// Owns WHICH plan the app lifetime belongs to (BR-U2-1). Mounted between
// AuthProvider and StoreProvider: it fetches the (small) plans list before any
// ledger data exists client-side, resolves the plan to open, arms sync.js's
// active-plan stamp, and only then lets StoreProvider hydrate. Changing plan is
// always a full reload — the store, undo stack, and format singleton are all
// single-plan by design, so no in-place swap can be correct.
const Ctx = createContext(null);

// Resolution order (L2, US-9): each id in `overrides` (tab-scoped candidates —
// see bootPlanDecision), then the device-wide persisted id, taking the first
// that still exists; else the first plan by name (a deleted plan degrades
// gracefully); else null — the zero-plan first-use gate.
export function resolveOpenPlan(plans, persistedId, overrides = []) {
  const list = plans || [];
  for (const id of [...overrides, persistedId]) {
    const hit = id != null && list.find(p => p.id === id);
    if (hit) return hit;
  }
  if (list.length) return [...list].sort((a, b) => a.name.localeCompare(b.name))[0];
  return null;
}

// Everything boot decides, as one pure step. A tab owns its plan: the one-shot
// ?plan= (how "open in new tab" tells a fresh tab which plan it is) beats this
// tab's session pin, which beats the device-wide last-used id.
//   healOpenPlanId — the device-wide id is only SELF-HEALED (BR-U2-6: stale/
//     deleted/never set), never moved: booting another tab into a different plan
//     must not change what a fresh launch opens. null = leave it alone.
//   missed — 'url' | 'pin' | null. The URL id (and, failing that, the pin) is
//     the user's explicit choice of LEDGER; when it no longer exists the tab
//     opens something else, and saying nothing is how entries land in the wrong
//     plan. A stale device-wide id is NOT a miss — that one degrades quietly.
export function bootPlanDecision({ plans, persistedId, urlId, tabPin }) {
  const list = plans || [];
  const open = resolveOpenPlan(list, persistedId, [urlId, tabPin]);
  if (!open) return { open: null, healOpenPlanId: null, missed: null };
  const asked = urlId ? 'url' : tabPin ? 'pin' : null;
  const missed = asked && open.id !== (urlId || tabPin) ? asked : null;
  return { open, healOpenPlanId: list.some(p => p.id === persistedId) ? null : open.id, missed };
}

export function PlanProvider({ userId, children }) {
  const [state, setState] = useState({ status: 'loading', plans: [], openPlanId: null, error: null });
  // Set when boot could not open the plan this tab was asked for (see
  // bootPlanDecision.missed); the switcher shows it until dismissed.
  const [planMiss, setPlanMiss] = useState(null);
  // Post-hydrate truth: StoreProvider publishes store.plans here so create/
  // rename/delete show up in the switcher without a refetch. Null until then —
  // the boot list serves the gap.
  const [storePlans, setStorePlans] = useState(null);
  // StoreProvider registers its queue-drain here (same shape as AuthProvider's
  // registerBeforeSignOut) so switchPlan can flush without owning the queue.
  const drainRef = useRef(null);

  useEffect(() => {
    if (state.status !== 'loading') return;
    let cancelled = false;
    (async () => {
      // Only the fetch is a "fetch failed": anything thrown by the steps below
      // would otherwise be reported as a network error that Retry can't fix.
      let plans;
      try {
        plans = await fetchPlans();
      } catch (e) {
        console.error('Raqam: plans fetch failed', e);
        if (!cancelled) setState(s => ({ ...s, status: 'error', error: e.message || 'Network error' }));
        return;
      }
      if (cancelled) return;
      try {
        const urlId = planIdFromSearch(window.location.search);
        const { open, healOpenPlanId, missed } = bootPlanDecision({
          plans, persistedId: loadUserPrefs(userId).openPlanId, urlId, tabPin: loadTabPlan(userId),
        });
        if (urlId) {
          // The param is one-shot — consume it. Non-fatal if the browser refuses
          // (sandboxed frame, replaceState rate limit): a later in-tab switch
          // navigates to its own ?plan=, so a leftover one can't override it.
          try {
            const { pathname, search, hash } = window.location;
            window.history.replaceState(window.history.state, '', pathname + stripPlanParam(search) + hash);
          } catch (e) { console.warn('Raqam: could not strip ?plan=', e); }
        }
        if (open) {
          // Arm the stamp BEFORE StoreProvider can mount and hydrate.
          setActivePlanId(open.id);
          // Bind the format singleton at the same moment (U3): from here on
          // every fmt* wrapper renders in this plan's currency/number/date
          // settings. No plan → the singleton keeps its legacy default.
          setActiveFormat(open);
          // Both writes may fail (storage disabled); neither is a blocker — the
          // tab works, and the next boot simply re-resolves.
          writeTabPlan(userId, open.id);
          if (healOpenPlanId) writeUserPrefs(userId, { ...loadUserPrefs(userId), openPlanId: healOpenPlanId });
          if (missed) {
            console.warn('Raqam: asked-for plan not found (' + missed + '), opened', open.id);
            setPlanMiss({ kind: missed, openedName: open.name });
          }
        }
        setState({ status: 'ready', plans, openPlanId: open ? open.id : null, error: null });
      } catch (e) {
        console.error('Raqam: could not open a plan', e);
        if (!cancelled) setState(s => ({ ...s, status: 'error', error: 'Couldn’t open your plan' + (e?.message ? ' — ' + e.message : '') }));
      }
    })();
    return () => { cancelled = true; };
  }, [state.status, userId]);

  const registerDrain = useCallback(fn => { drainRef.current = fn; }, []);
  const publishPlans = useCallback(plans => setStorePlans(plans), []);
  // The registered drain, callable from UI flows that must flush before a plan
  // boundary of their own (Manage Plans' delete, BR-U2-2) — the same flush
  // switchPlan runs, without duplicating queue access outside StoreProvider.
  const drain = useCallback(() => (drainRef.current ? drainRef.current() : Promise.resolve(true)), []);

  // FirstPlanSetup already inserted the plan row directly (the store isn't
  // alive in the zero-plan state); persist the resolution + optional one-shot
  // seed flag BEFORE re-running boot, which now finds the plan and proceeds
  // through the normal S1 path — hydrate, and seeding via pendingSeed.
  const completeFirstPlan = useCallback(({ planId, seed }) => {
    const prefs = loadUserPrefs(userId);
    writeUserPrefs(userId, { ...prefs, openPlanId: planId, ...(seed ? { pendingSeed: planId } : {}) });
    writeTabPlan(userId, planId);
    setState(s => ({ ...s, status: 'loading', error: null }));
  }, [userId]);

  const switchPlan = useCallback(async targetId => {
    if (targetId === state.openPlanId) return true;
    // Fail-closed (BR-U2-2): nothing may cross a plan boundary until the
    // server has caught up. On a dirty drain the queue's own status UI is
    // already showing pending/rejected — abort with no persist, no reload.
    const clean = drainRef.current ? await drainRef.current() : true;
    if (!clean) return false;
    // The switch itself rides on the URL: ?plan= outranks both stored ids at
    // boot, so the target plan opens even if these writes fail (storage
    // disabled/full) — a plain reload would re-resolve from storage and could
    // silently land back on the OLD plan. A failed openPlanId write then only
    // means the next fresh launch re-resolves differently (error table, US-9).
    writeUserPrefs(userId, { ...loadUserPrefs(userId), openPlanId: targetId });
    writeTabPlan(userId, targetId);
    location.replace(planHref(targetId)); // a search change is a full navigation
    return true;
  }, [state.openPlanId, userId]);

  // Opens `targetId` in a new tab on the current route, leaving this tab alone.
  // No drain: this tab keeps its plan and its queue. Call inside a user gesture
  // (popup blockers). noopener: the new tab starts with an EMPTY sessionStorage
  // rather than a copy of ours, so if its ?plan= turns out stale it falls back to
  // the device-wide id, not to this tab's pin. It also makes window.open return
  // null either way, so a blocked popup can't be detected here.
  const openPlanInNewTab = useCallback(targetId => {
    window.open(planHref(targetId), '_blank', 'noopener');
  }, []);

  const dismissPlanMiss = useCallback(() => setPlanMiss(null), []);

  const value = useMemo(() => {
    const plans = storePlans ?? state.plans;
    return {
      plans,
      openPlanId: state.openPlanId,
      openPlan: plans.find(p => p.id === state.openPlanId) || null,
      planCount: plans.length,
      switchPlan,
      openPlanInNewTab,
      planMiss,
      dismissPlanMiss,
      drain,
      registerDrain,
      publishPlans,
    };
  }, [storePlans, state.plans, state.openPlanId, switchPlan, openPlanInNewTab, planMiss, dismissPlanMiss, drain, registerDrain, publishPlans]);

  if (state.status === 'loading') return <LoadingScreen message="Loading your plans…" />;
  if (state.status === 'error') {
    return <LoadingScreen error={state.error} onRetry={() => setState(s => ({ ...s, status: 'loading', error: null }))} />;
  }
  if (!state.openPlanId) return <FirstPlanSetup onCreated={completeFirstPlan} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlan outside PlanProvider');
  return v;
}
