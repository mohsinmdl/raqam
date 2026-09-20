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

// The resolution branches (L2, US-9): the persisted id when it still exists,
// else the first plan by name (a deleted plan degrades gracefully), else null
// — the zero-plan first-use gate. `overrides` are tab-scoped candidates that
// outrank the device-wide persisted id, in order (the URL's one-shot ?plan=,
// then this tab's session pin — see planDeepLink.js); a stale one falls through.
export function resolveOpenPlan(plans, persistedId, overrides = []) {
  const list = plans || [];
  for (const id of [...overrides, persistedId]) {
    const hit = id != null && list.find(p => p.id === id);
    if (hit) return hit;
  }
  if (list.length) return [...list].sort((a, b) => a.name.localeCompare(b.name))[0];
  return null;
}

export function PlanProvider({ userId, children }) {
  const [state, setState] = useState({ status: 'loading', plans: [], openPlanId: null, error: null });
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
      try {
        const plans = await fetchPlans();
        if (cancelled) return;
        // A tab owns its plan: a one-shot ?plan= (how "open in new tab" tells a
        // fresh tab which plan it is) beats this tab's session pin, which beats
        // the device-wide last-used id. The param is consumed here — left in the
        // URL it would override a later in-tab switch on its reload.
        const urlId = planIdFromSearch(window.location.search);
        const persistedId = loadUserPrefs(userId).openPlanId;
        const open = resolveOpenPlan(plans, persistedId, [urlId, loadTabPlan(userId)]);
        if (urlId) {
          const { pathname, search, hash } = window.location;
          window.history.replaceState(window.history.state, '', pathname + stripPlanParam(search) + hash);
        }
        if (open) {
          // Arm the stamp BEFORE StoreProvider can mount and hydrate. A failed
          // prefs write degrades to "re-resolve next boot" — never a blocker.
          setActivePlanId(open.id);
          // Bind the format singleton at the same moment (U3): from here on
          // every fmt* wrapper renders in this plan's currency/number/date
          // settings. No plan → the singleton keeps its legacy default.
          setActiveFormat(open);
          writeTabPlan(userId, open.id);
          // The device-wide id is only SELF-HEALED here (BR-U2-6: stale/deleted/
          // never set). Booting another tab into a different plan must not change
          // what a fresh launch opens — only an explicit switchPlan does that.
          if (!plans.some(p => p.id === persistedId)) {
            writeUserPrefs(userId, { ...loadUserPrefs(userId), openPlanId: open.id });
          }
        }
        setState({ status: 'ready', plans, openPlanId: open ? open.id : null, error: null });
      } catch (e) {
        console.error('Raqam: plans fetch failed', e);
        if (!cancelled) setState(s => ({ ...s, status: 'error', error: e.message || 'Network error' }));
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
    // A failed write still reloads: the switch succeeds this session, and the
    // stale pref merely re-resolves differently next boot (error table, US-9).
    writeUserPrefs(userId, { ...loadUserPrefs(userId), openPlanId: targetId });
    writeTabPlan(userId, targetId); // the pin outranks openPlanId at boot — move it too
    location.reload();
    return true;
  }, [state.openPlanId, userId]);

  // Opens `targetId` in a new tab on the current route, leaving this tab alone.
  // No drain: this tab keeps its plan and its queue. Call inside a user gesture
  // (popup blockers); noopener gives the new tab a fresh sessionStorage pin.
  const openPlanInNewTab = useCallback(targetId => {
    window.open(planHref(targetId), '_blank', 'noopener');
  }, []);

  const value = useMemo(() => {
    const plans = storePlans ?? state.plans;
    return {
      plans,
      openPlanId: state.openPlanId,
      openPlan: plans.find(p => p.id === state.openPlanId) || null,
      planCount: plans.length,
      switchPlan,
      openPlanInNewTab,
      drain,
      registerDrain,
      publishPlans,
    };
  }, [storePlans, state.plans, state.openPlanId, switchPlan, openPlanInNewTab, drain, registerDrain, publishPlans]);

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
