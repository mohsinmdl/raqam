# Application Design — Multi-Plan System (Consolidated)

Decisions locked in `../plans/application-design-plan.md`: **pure formatter core + bound wrappers** (Q1=A), **reload-based plan switch** (Q2=B), **plans as a sync collection** (Q3=A), **Manage Plans modal** (Q4=A).

## Component overview (details: components.md, component-methods.md)

| # | Component | Unit | One-liner |
|---|---|---|---|
| C1 | `plans` schema + `plan_id` scoping | U1 | plans table, CHECK-constrained settings, composite FK `(user_id, plan_id)` ON DELETE CASCADE on 13 tables, backfill "My Plan" |
| C2 | `PlanProvider` | U2 | pre-hydration plan resolution, `usePlan()`, switch (drain→persist→reload), zero-plan first-use |
| C3 | sync layer extensions | U2 | plans descriptor (unfiltered, first in push order); `fetchAll(planId)` filters; `toRow` stamps `plan_id` |
| C4 | format engine | U3 | pure `makeFormatter(settings)` + option catalogues; calc.js/`useMoney()`/date helpers become wrappers — call sites unchanged |
| C5 | plan actions | U2 | pure `createPlan`/`renamePlan`/`deletePlan`/`seedPlanCategories` through the existing reducer/undo/sync pipeline |
| C6 | shell UI | U4 | `PlanSwitcher`, `NewPlanModal`, `ManagePlansModal`, `FirstPlanSetup`, phone entry — Base UI primitives |

## Orchestration (details: services.md)
- **S1 Boot**: fetchPlans → resolve open plan (persisted → first-by-name → zero ⇒ FirstPlanSetup) → bind `setActivePlanId` + `setActiveFormat` → `fetchAll(planId)` → post-hydrate one-shot seeding for a freshly created plan.
- **S2 Switch**: flush+drain → persist id → reload (clean store, empty undo, rebound formatter — kills cross-plan leakage by construction).
- **S3 Create**: validate → optimistic `createPlan` → seed flag → switch.
- **S4 Rename**: plain undoable store edit.
- **S5 Delete**: typed-name confirm; last-plan guard; open-plan switch-away invariant; server cascade; fail-closed on drain failure.
- **S6 Formatting**: singleton bound at boot; no per-render lookups; safe because every settings change passes through a reload.

## Design rationale highlights
- **Store shape unchanged below the provider tree** — the 60+ screens/drawers and all envelope/RTA/report math stay untouched by scoping (they see one plan's data, as they always have).
- **Reload switch** trades a sub-second flash for structural correctness; matches YNAB's own full navigation; upgrade path to in-app teardown stays open.
- **Formatter as pure core** satisfies PBT-02/03/07 directly (round-trips + invariants over generated settings) while the singleton wrapper keeps ~195 call sites API-stable, `maskDigits` composing unchanged on top.
- **Security**: client stamping/filtering is convenience; RLS (`user_id = auth.uid()`) + composite FK are the enforcement (SECURITY-08). Settings validated by CHECK constraints (SECURITY-05). Delete fail-closed (SECURITY-15).

## Security Compliance (Application Design stage)
- SECURITY-05 ✅ (CHECK-constrained settings, validated name), SECURITY-08 ✅ (RLS + composite FK design), SECURITY-11 ✅ (security logic isolated in schema + sync layer; misuse case = forged plan_id, addressed), SECURITY-13 ✅ (audit_log continuity per plan), SECURITY-15 ✅ (fail-closed delete/drain).
- SECURITY-01/02/04/06/07 N/A (managed platform); SECURITY-03/09/10/12/14 unchanged existing posture.
- **No blocking findings.**

## PBT Compliance (Application Design stage)
- PBT-09 ✅ direction set (fast-check + vitest; formalized in the NFR Requirements pass). PBT-01 identification lands in U3 Functional Design as planned. No blocking findings.
