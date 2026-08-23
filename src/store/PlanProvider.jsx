import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPlans, setActivePlanId } from './sync.js';
import { setActiveFormat } from '../lib/planFormat.js';
import { loadUserPrefs, writeUserPrefs } from '../lib/prefsStore.js';
import LoadingScreen from '../components/LoadingScreen.jsx';
import FirstPlanSetup from '../ui/plans/FirstPlanSetup.jsx';

// Owns WHICH plan the app lifetime belongs to (BR-U2-1). Mounted between
// AuthProvider and StoreProvider: it fetches the (small) plans list before any
// ledger data exists client-side, resolves the plan to open, arms sync.js's
// active-plan stamp, and only then lets StoreProvider hydrate. Changing plan is
// always a full reload — the store, undo stack, and format singleton are all
// single-plan by design, so no in-place swap can be correct.
const Ctx = createContext(null);

// The three resolution branches (L2, US-9): the persisted id when it still
// exists, else the first plan by name (a deleted plan degrades gracefully),
// else null — the zero-plan first-use gate.
export function resolveOpenPlan(plans, persistedId) {
  const list = plans || [];
  const persisted = list.find(p => p.id === persistedId);
  if (persisted) return persisted;
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
        const open = resolveOpenPlan(plans, loadUserPrefs(userId).openPlanId);
        if (open) {
          // Arm the stamp BEFORE StoreProvider can mount and hydrate; persist
          // the resolution (BR-U2-6) so a stale/deleted id self-heals. A failed
          // prefs write degrades to "re-resolve next boot" — never a blocker.
          setActivePlanId(open.id);
          // Bind the format singleton at the same moment (U3): from here on
          // every fmt* wrapper renders in this plan's currency/number/date
          // settings. No plan → the singleton keeps its legacy default.
          setActiveFormat(open);
          writeUserPrefs(userId, { ...loadUserPrefs(userId), openPlanId: open.id });
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
    location.reload();
    return true;
  }, [state.openPlanId, userId]);

  const value = useMemo(() => {
    const plans = storePlans ?? state.plans;
    return {
      plans,
      openPlanId: state.openPlanId,
      openPlan: plans.find(p => p.id === state.openPlanId) || null,
      planCount: plans.length,
      switchPlan,
      drain,
      registerDrain,
      publishPlans,
    };
  }, [storePlans, state.plans, state.openPlanId, switchPlan, drain, registerDrain, publishPlans]);

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
