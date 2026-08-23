# Units of Work — Multi-Plan System

Monolith SPA: units are sequential development slices (logical modules) of one codebase, each fully designed + coded + tested before the next. Construction order: **U1 → U2 → U3 → U4**.

## U1: `db-plans` — schema & migration
- **Responsibility**: Everything Postgres. New migration `supabase/migrations/00XX_plans.sql`: `plans` table (PK `(user_id, id)`, name, CHECK-constrained `currency`/`currency_placement`/`number_format`/`date_format`, `created_at`); RLS (`user_id = auth.uid()`, default `user_id`); `plan_id text NOT NULL` on all 13 per-user tables with composite FK `(user_id, plan_id) → plans(user_id, id)` ON DELETE CASCADE; transactional backfill creating "My Plan" per existing user and stamping every row; supporting indexes (`(user_id, plan_id)` where useful).
- **Components**: C1. **Stages**: Functional Design → Code Generation.
- **Done means**: migration applies cleanly on a copy of the real DB; re-run guard proven; constraint tests (cross-user plan_id rejected).

## U2: `plan-scoping` — data layer & lifecycle
- **Responsibility**: `src/store/sync.js` (plans descriptor first in COLLECTIONS; `fetchAll(planId)` filters the 12 scoped collections; `fetchPlans()`; `setActivePlanId` stamping in scoped `toRow`s); new `src/store/PlanProvider.jsx` (resolution, `usePlan()`, `switchPlan` = drain → persist → reload, zero-plan gate); plan actions in `src/store/actions.js` (`createPlan`/`renamePlan`/`deletePlan`/`seedPlanCategories`); `StoreProvider` seeding switch-over (per-plan seed flag replaces the first-login categories heuristic); open-plan persistence in `src/lib/prefsStore.js`.
- **Components**: C2, C3, C5. **Stages**: Functional Design → Code Generation.
- **Done means**: two plans provably isolated through the sync contract tests; switch flow drains before reload; deleted-plan fallback works.

## U3: `plan-formatting` — format engine
- **Responsibility**: New pure `src/lib/planFormat.js` (`makeFormatter`, `setActiveFormat`, `activeFormat`, `parseAmount`) + `src/lib/planFormatOptions.js` (full ISO currency catalogue with symbols; 8 number formats; 7 date formats; 3 placements; example previews). Rewire `src/lib/calc.js` money/date helpers and `src/lib/format.js` `useMoney()` as wrappers; make `src/lib/amountInput.js` (and keypads) separator-aware. PBT suite (fast-check): format↔parse round-trips, invariants, domain generators.
- **Components**: C4. **Stages**: Functional Design (incl. PBT-01 property table) → Code Generation.
- **Done means**: "My Plan" defaults render pixel-identical to today (existing snapshots/tests unchanged); PBT green across the 8×3 money and 7 date format space.

## U4: `plan-shell-ui` — user surfaces
- **Responsibility**: `src/ui/plans/`: `PlanSwitcher.jsx` (sidebar top, Base UI), `NewPlanModal.jsx` (fields + seed checkbox + Creating… state), `ManagePlansModal.jsx` (rename, typed-name delete, last-plan guard), `FirstPlanSetup.jsx` (zero-plan boot state); Sidebar/Header integration; phone-shell entry point; wiring to S2–S5 orchestration.
- **Components**: C6. **Stages**: Code Generation only (Functional Design skipped — behavior pinned by US-4..10, US-16..17 ACs and Q4=A decision).
- **Done means**: all switcher/modal story ACs pass in live Playwright verification, desktop and phone.

## Code organization
Brownfield — existing structure extended in place (`src/store/`, `src/lib/`, `src/ui/plans/` new folder, `supabase/migrations/`). No new packages, no build changes.
