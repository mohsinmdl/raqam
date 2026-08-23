# U2 plan-scoping — Code Generation Plan

**Single source of truth for U2 generation.** Brownfield: modify in place. Design inputs: `aidlc-docs/construction/plan-scoping/functional-design/*` (approved). Stories owned: US-6, US-8, US-9, US-11, US-12 (+ contributions to US-1/3/4/16/17).

## Steps

- [x] **Step 1 — sync.js plan awareness** (modify `src/store/sync.js`): add `plans` descriptor first in COLLECTIONS (toRow/fromRow per domain-entities.md; fetch-only `created_at`); add `planScoped: true` to the 11 scoped descriptors; `setActivePlanId(id)` module state; scoped `toRow` stamping via the existing push path (stamp at push/diff time so mappers stay pure where possible); `fetchAll(planId)` adds `.eq('plan_id', planId)` on scoped fetches; scoped deletes add the same filter; new `fetchPlans()`. *(US-11, US-12)*
- [x] **Step 2 — plan actions** (modify `src/store/actions.js`): `createPlan`, `renamePlan`, `deletePlan` (last-plan guard returns store unchanged), `seedPlanCategories` (fresh `uid()` ids, no-op when categories exist). *(US-6, US-16/17 groundwork)*
- [x] **Step 3 — prefs** (modify `src/lib/prefsStore.js`): extend defaults (`openPlanId`, `pendingSeed`, `plans: {}`); add pure `migrateFlatViewPrefs(prefs)` folding flat `customViews`/`builtinViews` into `plans['default']`; helpers `planPrefs(prefs, planId)` / `writePlanPrefs`. *(US-9, Q3=A)*
- [x] **Step 4 — PlanProvider** (create `src/store/PlanProvider.jsx`): pure `resolveOpenPlan` (exported for tests); fetchPlans boot with retry UI (reuse LoadingScreen); zero-plan gate rendering a minimal placeholder (U4 replaces with FirstPlanSetup); `setActivePlanId` + prefs persist; `switchPlan` per L3 (drain fail-closed); `usePlan()` context (plans list refreshes from store post-hydrate via a bridge prop). *(US-8, US-9)*
- [x] **Step 5 — StoreProvider integration** (modify `src/store/StoreProvider.jsx`): accept `planId` prop; `fetchAll(planId)`; seeding switch-over (pendingSeed one-shot replaces categories.length heuristic); expose plans from store data. *(US-6, US-11)*
- [x] **Step 6 — App wiring** (modify `src/App.jsx`): wrap `StoreProvider` with `PlanProvider` (key by user id); pass open plan id. Plan-screen views read/write through the per-plan namespace (modify `src/screens/Plan.jsx` + `src/lib/planViews.js` accessors minimally). *(US-7 groundwork, Q3=A)*
- [x] **Step 7 — Tests** (create `tests/plan-scoping.test.js`, `tests/plan-provider.test.js`; modify existing sync tests if mapper assertions change): plans mapper round-trip; scoped fetch carries `.eq('plan_id', …)` and unscoped doesn't (mocked client); stamping on push; `resolveOpenPlan` branches (persisted / fallback / zero); `migrateFlatViewPrefs` fold; `seedPlanCategories` fresh-ids + idempotence; `deletePlan` last-plan guard; `createPlan` validation.
- [x] **Step 8 — Verify**: `pnpm test` green (all 80+ files); fix regressions caused by descriptor/provider changes; `pnpm build` passes.
- [x] **Step 9 — Docs summary**: `aidlc-docs/construction/plan-scoping/code/plan-scoping-summary.md` (modified vs created; deferred items; handoffs to U3/U4).
- [x] **Step 10 — Story checkboxes**: mark US-6/8/9/11/12 implemented; update aidlc-state.md.

## Execution approach
Steps 1–8 delegated to a subagent working in this worktree (repo SDD convention), with the functional-design artifacts as its spec; I review the diff and run the gate. No commits until the user-facing review passes.

## Dependencies / contracts honored
- U1 schema (0017) — column names, `'default'` plan id
- `fromRow` never surfaces `plan_id`; screens stay plan-ignorant (BR-U2-3)
- Stamping/filters are convenience; RLS+FK remain the boundary (SECURITY-08)
