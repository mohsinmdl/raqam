# Component Methods — Multi-Plan System

Signatures only; business rules are detailed in per-unit Functional Design.

## C1: `plans` schema (SQL)
```sql
plans(user_id uuid default auth.uid(), id text, name text, currency text,
      currency_placement text CHECK (in 'before'|'after'|'none'),
      number_format text CHECK (in 8 known keys),
      date_format text CHECK (in 7 known keys),
      created_at timestamptz, PRIMARY KEY (user_id, id))
-- every scoped table: plan_id text NOT NULL,
--   FOREIGN KEY (user_id, plan_id) REFERENCES plans(user_id, id) ON DELETE CASCADE
```

## C2: PlanProvider
| Method | Signature | Purpose |
|---|---|---|
| `usePlan()` | `() → { plans, openPlan, openPlanId, switchPlan, refreshPlans }` | Context accessor |
| `resolveOpenPlan` | `(plans, persistedId) → plan \| null` | persisted → first-by-name → null (pure, unit-tested) |
| `switchPlan` | `async (planId) → void` | `drainSync()` → persist `openPlanId` (prefsStore) → `location.reload()` |
| first-use render | `plans.length === 0 → <FirstPlanSetup/>` | zero-plan state creates the first plan |

## C3: sync layer
| Method | Signature | Purpose |
|---|---|---|
| `fetchPlans` | `async () → Plan[]` | Lightweight pre-hydration plans query (plans descriptor reused) |
| `fetchAll` | `async (planId) → store` | Existing fetch; scoped collections gain `.eq('plan_id', planId)`; plans collection included unfiltered |
| `setActivePlanId` | `(planId) → void` | Module-level stamp source for scoped `toRow` mappers |
| plans descriptor | `{ name:'plans', table:'plans', keyOf:r=>r.id, toRow, fromRow }` | camelCase ↔ snake_case (`currencyPlacement ↔ currency_placement`, …) |

## C4: Format engine (pure)
| Method | Signature | Purpose |
|---|---|---|
| `makeFormatter` | `(settings) → fmt` | `settings = { currency, placement, numberFormat, dateFormat }` |
| `fmt.money` | `(n, masked?, decimals?) → string` | grouping + decimal char + symbol placement; U+2212 negative |
| `fmt.moneySigned` | `(n, masked?, decimals?) → string` | +/− prefixed |
| `fmt.moneyCompact` | `(n) → string` | compact tail (M/B), symbol per placement |
| `fmt.num` | `(n, decimals?) → string` | number without symbol |
| `fmt.date` | `(iso) → string` | per plan date format |
| `fmt.parseAmount` | `(string) → number \| null` | inverse of `num` (PBT-02 round-trip partner) |
| `setActiveFormat` | `(settings) → void` | binds singleton at hydration |
| `activeFormat` | `() → fmt` | read by calc.js/dates.js wrappers |
| `planFormatOptions` | `CURRENCIES: [{code,name,symbol}]`, `NUMBER_FORMATS: [{key,example,group,decimal,pattern}]`, `DATE_FORMATS: [{key,example,order,sep}]`, `PLACEMENTS: [{key,label,example}]` | option catalogues + previews |

Existing wrappers (signatures unchanged): `fmtPKR(n, masked, decimals)`, `fmtSigned`, `fmtNum`, `fmtPKRCompact`, `shortDate(iso)`, `dayLabel(iso)`, `monthLabel(ym)`, `useMoney()`.

## C5: Plan actions (pure)
| Method | Signature |
|---|---|
| `createPlan` | `(store, { id, name, currency, currencyPlacement, numberFormat, dateFormat }) → store'` |
| `renamePlan` | `(store, id, name) → store'` |
| `deletePlan` | `(store, id) → store'` (guard: refuses when it is the last plan) |
| `seedPlanCategories` | `(store) → store'` (idempotent: no-op when categories exist) |

## C6: Shell UI (props)
| Component | Props |
|---|---|
| `PlanSwitcher` | `{}` — reads `usePlan()`, `useAuth()` (email) |
| `NewPlanModal` | `{ open, onClose }` — on create: `applyData(createPlan)` [+ optional seed flag persisted for post-switch] → `switchPlan(newId)` |
| `ManagePlansModal` | `{ open, onClose }` — rename via `applyData(renamePlan)`; delete via typed-name confirm → `applyData(deletePlan)` → drain → switch-away if open plan |
| `FirstPlanSetup` | `{ onCreated }` — NewPlanModal fields inline for the zero-plan state |
