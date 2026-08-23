# U2 plan-scoping — Code Generation Summary

Verification: `pnpm test` = 92 files / 1295 tests passing (2 new test files); `pnpm build` succeeds. No commits yet.

## Created
- `src/store/PlanProvider.jsx` — pure `resolveOpenPlan`, fetchPlans boot with retry, `switchPlan` (drain-fail-closed, returns boolean for U4), `usePlan()`, `registerDrain`/`publishPlans` bridges, `NoPlansYet` placeholder (U4 replaces with FirstPlanSetup)
- `tests/plan-scoping.test.js` — mappers, exactly-11 `planScoped` set, `pushRow` stamping symmetry, `fetchAll(planId)` filter assertions on mocked client, plan actions, prefs fold
- `tests/plan-provider.test.js` — `resolveOpenPlan` branches, fallback, ordering, immutability

## Modified
- `src/store/sync.js` — plans descriptor first; `planScoped` on the 11; `setActivePlanId` + exported `pushRow` (single serialization point stamps `plan_id` symmetrically; `fromRow` never surfaces it); scoped fetch/delete filters; `fetchPlans()`; shared `withSkewRetry`
- `src/store/StoreProvider.jsx` — `planId` prop; `pendingSeed` one-shot replaces categories.length heuristic; drain registration; plans published to PlanProvider; prefs facade surfaces the open plan's view namespace under existing flat names (**Plan.jsx / planViews.js needed zero changes**); `replaceData` carries plans across (guards legacy-import wiping plans via differ)
- `src/store/actions.js` — `createPlan` (validated/clamped to 0017 catalogues), `renamePlan`, `deletePlan` (last-plan + unknown-id guards), `seedPlanCategories` (fresh uid ids, idempotent); no audit rows (Q2=A)
- `src/lib/prefsStore.js` — `plans:{}` namespace defaults; `migrateFlatViewPrefs` applied inside `loadUserPrefs`; `planPrefs`
- `src/store/seed.js` — `PLAN_PLACEMENTS`/`PLAN_NUMBER_FORMATS`/`PLAN_DATE_FORMATS`/`PLAN_DEFAULTS` mirroring 0017 CHECKs (shared clamp source for U3/U4)
- `src/App.jsx` — `AuthProvider → PlanProvider → StoreProvider(planId)`
- Tests updated: `audit-fetch`, `hydrate-retry` (mock `eq` pass-through), `prefs-store` (new defaults + migration case)

## Deviations (accepted at review)
1. Real flat views key is `planViews` (not the design's `customViews`) — migration folds it; facade preserves the screen-facing name.
2. `renamePlan`/`deletePlan` take payload objects per repo action convention.
3. `switchPlan` returns boolean (false = drain abort) for U4 UI.
4. `replaceData` plans-carryover guard added (un-specced): without it, legacy import/reset built plan-free stores and the differ would push "delete every plan" → server cascade wipes all data.

## Stories
US-6 ✅ US-8 ✅ US-9 ✅ US-11 ✅ US-12 ✅ (client side; live-DB proof of scoped fetch/stamp lands with 0017 apply in Build & Test)

## Handoffs
- **U4**: replace `NoPlansYet`; NewPlanModal/ManagePlansModal wiring (`system:true`, typed-name confirm, `pendingSeed` before `switchPlan`); **resetAll/ImportLegacy still seed fixed-id categories — must mint fresh ids once plan creation exists (cross-plan re-stamp hazard from a non-default plan)**.
- **U3**: format engine reads `openPlan` settings; option catalogues in seed.js; consider making `prefs.planViewId` (active pill) per-plan.
