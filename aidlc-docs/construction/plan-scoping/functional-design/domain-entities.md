# U2 plan-scoping — Domain Entities

## Plan (store object, camelCase)
```js
{ id, name, currency, currencyPlacement, numberFormat, dateFormat, createdAt }
```
Mapper: `currency_placement ↔ currencyPlacement`, `number_format ↔ numberFormat`, `date_format ↔ dateFormat`, `created_at ↔ createdAt` (fetch-only; not pushed). `store.plans` joins the in-memory store as a new top-level collection.

## sync.js additions
- `COLLECTIONS`: `plans` descriptor **first** (parents before children in PUSH_ORDER; deletes reversed — plan delete pushes last, after any child deletes, though normally cascade makes child deletes unnecessary).
  - `{ name:'plans', table:'plans', keyOf: r => r.id, toRow, fromRow }` — writable (create/rename/delete flow through the differ).
  - **planScoped: false** on plans/institutions/cardProducts; **planScoped: true** on the other 11 descriptors (new flag).
- `fetchAll(planId)`: scoped descriptors add `.eq('plan_id', planId)`; audit keeps its 300-row cap (now per-plan).
- `fetchPlans()`: standalone `select` on plans via its descriptor (pre-hydration, small).
- `setActivePlanId(id)` (module-level): scoped `toRow` output gains `plan_id: activePlanId`. Baseline rows from the server already carry `plan_id` via… **no** — `fromRow` deliberately does NOT surface `plan_id` into the store (screens never see it); the differ compares `toRow(storeRow)` vs baseline `toRow` output, so both sides stamp identically. Deletes: scoped delete calls add `.eq('plan_id', activePlanId)` for defense-in-depth.

## Per-user prefs schema (localStorage `raqam.prefs.u.{uid}`)
```js
{
  skippedSetup: bool,               // stays global (account-level onboarding)
  openPlanId: string | undefined,   // US-9 — last-opened plan on this device
  pendingSeed: string | undefined,  // one-shot: plan id to seed on next hydrate
  plans: {                          // Q3=A — per-plan namespaced prefs
    [planId]: { customViews: [...], builtinViews: {...} }
  }
}
```
Migration of existing flat view keys (`customViews`, `builtinViews`, and any other per-plan-ish keys currently flat): on first plans-aware load, fold them into `plans['default']` and delete the flat keys (one-shot, pure function, unit-tested).

## PlanProvider context (`usePlan()`)
```js
{ plans,            // Plan[] (pre-hydration list; refreshed from store after hydrate)
  openPlanId, openPlan,
  switchPlan(id),   // async: drain → persist → reload
  planCount }
```

## Seed catalogue reuse
`seedPlanCategories` clones `CATEGORIES` from `src/store/seed.js` with **fresh `uid()` ids** (U1 rule — fixed ids exist only in the migrated default plan), preserving name/type/color/icon/sortOrder; `isSystem` stays true (semantics: "came from the default set").
