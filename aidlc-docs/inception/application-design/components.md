# Components — Multi-Plan System

## C1: `plans` schema (Postgres, U1)
- **Purpose**: The plan entity and the scoping dimension.
- **Responsibilities**: `plans` table (PK `(user_id, id)`, settings columns with CHECK constraints); `plan_id` on all 13 per-user tables with composite FK `(user_id, plan_id) → plans(user_id, id)` **ON DELETE CASCADE** (plan delete removes its rows server-side); backfill migration creating "My Plan"; RLS identical in shape to existing tables.
- **Interface**: SQL migration `supabase/migrations/00XX_plans.sql`; consumed via PostgREST like every other table.

## C2: PlanProvider (`src/store/PlanProvider.jsx`, U2)
- **Purpose**: Resolve which plan is open before the store hydrates; own the plan boot/switch lifecycle.
- **Responsibilities**: fetch the plans list pre-hydration (`fetchPlans()`); resolve open plan (persisted id → fallback first plan → none = first-use creation); expose `openPlanId`/`openPlan` + `switchPlan(id)` (drain → persist → reload); render first-use plan creation when the user has zero plans.
- **Interface**: React context `usePlan()`; sits **above** `StoreProvider` in the tree.

## C3: sync layer extensions (`src/store/sync.js`, U2)
- **Purpose**: Plan-scope every fetch and stamp every write.
- **Responsibilities**: `plans` becomes the first COLLECTIONS descriptor (FK-safe push order; **unfiltered** fetch); `fetchAll(planId)` adds `.eq('plan_id', planId)` for the 12 scoped per-user collections (institutions/cardProducts stay catalogue rows); scoped `toRow` mappers emit `plan_id` from the module-level active plan (set at boot); baseline/differ/queue unchanged.
- **Interface**: existing exports, now plan-aware: `fetchAll(planId)`, `fetchPlans()`, `setActivePlanId(id)`.

## C4: Format engine (`src/lib/planFormat.js` + `src/lib/planFormatOptions.js`, U3)
- **Purpose**: Replace hardcoded `'Rs '`/`en-PK` with plan-settings-driven formatting; pure and PBT-testable.
- **Responsibilities**: `makeFormatter(settings)` returns money/number/date formatters + amount parsing; option catalogues (full ISO currency list with symbols, 8 number formats, 7 date formats, 3 placements) with example previews; `setActiveFormat(settings)` binds the app-wide singleton at hydration.
- **Interface**: pure functions; `calc.js` (`fmtPKR`, `fmtNum`, `fmtSigned`, `fmtPKRCompact`, `shortDate`, `dayLabel`, `monthLabel`) and `useMoney()` become thin wrappers over the active formatter — **call sites unchanged**. `maskDigits` composes on top as today.

## C5: Plan actions (`src/store/actions.js` additions, U2)
- **Purpose**: Pure store mutations for plan lifecycle, flowing through the existing reducer/undo/sync pipeline.
- **Responsibilities**: `createPlan(store, fields)`, `renamePlan(store, id, name)`, `deletePlan(store, id)` (local row removal; children cascade server-side), `seedPlanCategories(store)` (default catalogues into the open plan when requested).
- **Interface**: pure `(store, args) → store'` like all existing actions.

## C6: Shell UI (`src/ui/plans/`, U4)
- **Purpose**: The user-facing plan surfaces, on Base UI primitives.
- **Responsibilities**:
  - `PlanSwitcher.jsx` — sidebar-top trigger (plan name + email) + dropdown (plan list ordered by name, current marked, New Plan, Manage Plans)
  - `NewPlanModal.jsx` — name/currency/placement/number/date fields, "Start with default categories" checkbox, Creating… state
  - `ManagePlansModal.jsx` — rename inline, delete with exact-name confirmation, last-plan guard
  - Phone entry point wired into the existing phone shell
- **Interface**: consume `usePlan()` + `useStore()`; formatting previews via `makeFormatter`.

## Component ownership by unit
| Unit | Components |
|---|---|
| U1 db-plans | C1 |
| U2 plan-scoping | C2, C3, C5 |
| U3 plan-formatting | C4 |
| U4 plan-shell-ui | C6 |
