# U2 plan-scoping — Business Logic Model

## L1: Boot (S1 refined)
```
AuthProvider ready (userId)
└─ PlanProvider:
   1. plans = await fetchPlans()                       (retry UI on failure, like hydrate)
   2. open = resolveOpenPlan(plans, prefs.openPlanId)
        • prefs id found in plans → that plan
        • else plans.length > 0 → first by name (localeCompare)
        • else → null
   3. open == null → render <FirstPlanSetup/>; on create: write plan via direct
      supabase insert (store not yet alive), set prefs.openPlanId + optional
      pendingSeed, continue to 4 with the new plan
   4. setActivePlanId(open.id); persist prefs.openPlanId = open.id
   5. render <StoreProvider planId={open.id}>
└─ StoreProvider hydrate:
   6. server = await fetchAll(planId)
   7. SEEDING SWITCH-OVER: replace the old `server.categories.length ? … : seed`
      heuristic with:
        if (prefs.pendingSeed === planId) → base = server + seeded categories
        (fresh uid() ids); clear pendingSeed (one-shot, cleared even if later
        sync fails — the optimistic rows are already in the store/queue)
      else base = server  (a truly empty plan stays empty — US-6 unchecked path;
        legacy fresh-login case is now handled by FirstPlanSetup's seed default)
   8. queue baseline = server; rollover; hydrate as today
```

## L2: resolveOpenPlan (pure)
`(plans, persistedId) → plan | null` — exactly the three branches above; unit-tested (US-9 incl. deleted-plan fallback).

## L3: Switch (S2 refined)
```
switchPlan(targetId):
  1. if targetId === openPlanId → no-op
  2. queue.update(latest store data); await drainSync()
     • on drain failure (offline/rejected): abort switch, surface existing
       sync-status UI; do NOT persist or reload (fail-closed, SECURITY-15)
  3. prefs.openPlanId = targetId  (write result checked — prefsSaved pattern)
  4. location.reload()
```

## L4: Create (S3 refined — in-app path, store alive)
```
createPlan action (pure): store' = { ...store, plans: [...store.plans, newPlan] }
NewPlanModal submit:
  1. validate (trimmed name non-empty ≤80; values ∈ catalogues)
  2. id = uid(); applyData(createPlan(fields))         → queue upserts plans row
  3. if seedDefaults checked → prefs.pendingSeed = id
  4. await switchPlan(id)                              → drain pushes the plans row
                                                          before reload (step L3.2)
Non-undoable (Q1=A): dispatched with system:true so the undo stack is bypassed
(reload would clear it anyway; consistency for the no-reload failure path).
```

## L5: Rename
`renamePlan(store, id, name)` pure, validated like create; ordinary undoable data action (Q1=A). No audit row (Q2=A).

## L6: Delete (S5 refined)
```
ManagePlansModal confirm (typed name === plan.name exactly):
  guard: store.plans.length <= 1 → delete unavailable (US-17)
  1. wasOpen = (id === openPlanId)
  2. applyData(deletePlan(id), system:true)   → local plans row removed
  3. queue.update; await drainSync()          → DELETE pushes; server cascade
     removes children atomically (U1 BR-2)
     • drain failure → surface sync status; plan row reappears on next
       hydrate (server truth) — fail-closed, no pretend success
  4. if wasOpen → fallback = first remaining by name;
     prefs.openPlanId = fallback.id; location.reload()
     else → refresh usePlan().plans from store (no reload needed)
```
Note ordering: local delete BEFORE drain is safe — the differ turns it into one
DELETE on plans; children of that plan are not in memory when it isn't open, and
when it IS open, cascade owns them server-side; local store dies at reload.

## L7: Isolation invariant (US-11/12 — the tests' spine)
For any store hydrated with `fetchAll(p)`:
- every scoped fetch call carried `.eq('plan_id', p)` (asserted via supabase client mock)
- every scoped `toRow()` emits `plan_id === p`
- plans/institutions/cardProducts carry no plan filter
- scoped-rows(p) ∪ scoped-rows(others) = all rows; intersection = ∅ (PBT-03 invariant, U3 test suite hosts the generator)
