# U2 plan-scoping — Business Rules

## BR-U2-1: One plan per app lifetime
The store, undo stack, audit view, and format singleton belong to exactly one plan between boot and reload. Any code path that would mix plans must pass through `location.reload()`. (Foundation for US-8/11/12.)

## BR-U2-2: Drain before any plan boundary
`switchPlan` and `deletePlan` flows must `queue.update(latest)` + `drainSync()` **before** persisting/reloading. Drain failure aborts the operation and surfaces the existing sync-status UI — never persist a switch the server hasn't caught up with (SECURITY-15, US-8).

## BR-U2-3: Stamping is symmetrical and invisible
`plan_id` is stamped only in scoped `toRow()` mappers from `setActivePlanId`; `fromRow()` never surfaces it into the store. Screens, actions, envelope math, undo, and reports remain plan-ignorant. Scoped deletes also filter by `plan_id` (defense-in-depth; RLS+FK remain the boundary — SECURITY-08).

## BR-U2-4: Undo semantics (Q1=A)
`renamePlan` = ordinary undoable action. `createPlan`/`deletePlan` dispatch `system:true` (never undoable). No audit_log rows for any plan lifecycle event (Q2=A).

## BR-U2-5: Seeding (US-6, U1 seed-id rule)
- Seeding happens exactly once per plan, driven by the one-shot `pendingSeed` pref consumed at hydrate; cleared on consumption.
- Seeded categories always mint fresh `uid()` ids; never the fixed catalogue ids.
- The legacy `server.categories.length` heuristic is removed; a deliberately empty plan stays empty forever.
- `FirstPlanSetup` defaults the seed checkbox ON (US-3).

## BR-U2-6: Open-plan persistence (US-9)
`prefs.openPlanId` written on every successful resolution and switch; `resolveOpenPlan` tolerates a stale/deleted id (falls back to first-by-name) and a zero-plan state (first-use gate). Failed prefs writes degrade per the existing `prefsSaved` pattern (badge, not blocker).

## BR-U2-7: Per-plan prefs namespace (Q3=A)
Saved Plan-screen views (`customViews`, `builtinViews`) live under `prefs.plans[planId]`; one-shot pure migration folds existing flat keys into `plans['default']` and removes them. Readers (`planViews` consumers) address the open plan's namespace only. `skippedSetup` stays account-global.

## BR-U2-8: Plans collection availability (FR-5.5)
`store.plans` is always fetched and always writable through the queue; it is the switcher's data source post-hydrate (pre-hydrate list comes from `fetchPlans()`).

## BR-U2-9: Delete guards (US-17)
- Typed name must equal `plan.name` exactly (case-sensitive, no trim forgiveness beyond leading/trailing whitespace of the input).
- `store.plans.length <= 1` → delete unavailable at both action level (pure guard returns store unchanged) and UI level.
- Deleting the open plan: fallback selection + reload happens only after a clean drain.

## Error scenarios
| Scenario | Rule |
|---|---|
| fetchPlans fails at boot | Retry screen (same UX as hydrate failure) |
| Drain timeout on switch | Abort switch; stay in current plan; sync-status shows pending/rejected |
| pendingSeed for a plan that no longer exists | Cleared without effect at next consumption attempt |
| Prefs write fails on switch persist | Proceed with reload (switch still succeeds this session); prefsSaved badge reports the stale pref |
| createPlan sync rejected (CHECK violation) | Existing `rejected:plans` terminal surfacing; plan vanishes on next hydrate — validation should make this unreachable |
