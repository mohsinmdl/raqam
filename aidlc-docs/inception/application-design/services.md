# Services — Orchestration Patterns

The SPA has no server-side service layer; "services" here are client orchestration flows spanning components.

## S1: Plan Boot (every app start)
1. Auth resolves user → `PlanProvider` mounts → `fetchPlans()`
2. `resolveOpenPlan(plans, persistedOpenPlanId)`:
   - persisted id present in list → that plan
   - otherwise → first plan by name (covers deleted-plan fallback, US-9)
   - zero plans → render `FirstPlanSetup` (US-3); on create, persist id and continue
3. `setActivePlanId(openPlanId)`; `setActiveFormat(openPlan.settings)`
4. `StoreProvider` hydrates via `fetchAll(openPlanId)`; sync queue baseline includes the plans collection
5. Post-hydrate: if a pending "seed this plan" flag matches the open plan → `applyData(seedPlanCategories)` (replaces today's `server.categories.length` first-login heuristic)

## S2: Plan Switch (US-8)
1. UI calls `switchPlan(targetId)`
2. Push any debounced store state into the queue, then `drainSync()` (existing mechanism — same as sign-out drain; beforeunload prompt stays silent because the queue is clean)
3. Persist `openPlanId = targetId` via prefsStore
4. `location.reload()` → S1 runs for the target plan (guaranteed-clean store, empty undo stack, freshly bound formatter)

## S3: Plan Create (US-4, US-6)
1. `NewPlanModal` validates fields (non-empty trimmed name; values from catalogues)
2. `applyData(createPlan(fields))` — optimistic row; queue upserts `plans` first (FK-safe order)
3. If "Start with default categories" checked → persist one-shot seed flag for the new plan id
4. `switchPlan(newPlanId)` (S2); S1's step 5 performs the seeding inside the new plan

## S4: Plan Rename (US-16)
`ManagePlansModal` → `applyData(renamePlan)` → sidebar/switcher re-render from store; queue syncs. Undoable like any store edit.

## S5: Plan Delete (US-17)
1. Typed name must equal plan name exactly; last remaining plan → action unavailable
2. If deleting the open plan: run S2 to another plan first (data safety before destruction), reload lands in the surviving plan, then delete continues from there? — **No**: to keep one flow, delete is only offered *from* a plan that is not being deleted OR performs: confirm → `applyData(deletePlan)` → drain → if deleted plan was open, `switchPlan(fallback)`. Exact ordering pinned in U2/U4 design; invariant: **the open plan id is never a deleted plan at reload time**, and the server cascade (`ON DELETE CASCADE`) removes children atomically.
3. Fail-closed: drain failure surfaces the existing sync-rejected status; no local pretend-success.

## S6: Formatting (every render)
`useMoney()` / `fmtPKR` / date helpers → `activeFormat()` (bound once in S1). No per-render settings lookups; React needs no new context — a switch always passes through a reload.
