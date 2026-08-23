# U1 db-plans — Domain Entities

## `plans` (new table)

| Column | Type | Constraint |
|---|---|---|
| `user_id` | uuid | default `auth.uid()`, FK `auth.users on delete cascade` |
| `id` | text | PK `(user_id, id)`; client-minted (`uid()`), backfill uses literal `'default'` |
| `name` | text | CHECK `btrim(name) <> ''`; max length CHECK (`char_length(name) <= 80`) |
| `currency` | text | CHECK `currency ~ '^[A-Z]{3}$'` (ISO 4217 alpha-3; full list lives client-side) |
| `currency_placement` | text | CHECK in `('before','after','none')`; default `'none'` |
| `number_format` | text | CHECK in the 8 keys below; default `'comma-dot'` |
| `date_format` | text | CHECK in the 7 keys below; default `'DD/MM/YYYY'` |
| `created_at` | timestamptz | default `now()` |

RLS: enable; four policies (select/insert/update/delete) `to authenticated` using `(select auth.uid()) = user_id` — the exact 0015 canonical form.

## Canonical settings keys — SINGLE SOURCE (U1 ↔ U3 ↔ U4 contract)

**number_format** (key → rendering of 1234567.89 / example):
| Key | Example |
|---|---|
| `comma-dot` | `123,456.78` (default — today's rendering) |
| `dot-comma` | `123.456,78` |
| `space-dot` | `123 456.78` |
| `apostrophe-dot` | `123'456.78` |
| `space-dash` | `123 456-78` |
| `space-comma` | `123 456,78` |
| `comma-slash` | `123,456/78` |
| `lakh` | `1,23,456.78` (3-then-2 grouping) |

**date_format** (self-descriptive keys): `YYYY/MM/DD`, `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY` (default), `DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY.MM.DD`

**currency_placement**: `before` (Rs123,456.78) · `after` (123,456.78Rs) · `none` (123,456.78, default)

**Backfill defaults** = the three defaults above + currency `PKR` → migrated "My Plan" renders exactly as today (US-1 AC).

## Scoped tables (11) — uniform addition

`category_groups, categories, accounts, snapshots, cards, transactions, budgets, assignments, recurring, payees, audit_log` each gain:

| Addition | Spec |
|---|---|
| `plan_id` | `text NOT NULL` (after backfill) |
| FK | `(user_id, plan_id) REFERENCES plans(user_id, id) ON DELETE CASCADE` |
| Index | `(user_id, plan_id)` btree per table (FKs don't auto-index; serves the scoped fetch) |

**Not scoped** (Q1=A): `institutions` (catalogue + own banks, per-user shared across plans), `card_products` (global).

## Constraint interactions (existing uniques that change meaning)

| Constraint | Today | Under plans | Action |
|---|---|---|---|
| categories name unique `(user_id, type, normalized name)` | one "Groceries" per user | one per **plan** ("Groceries" in every plan is legal) | **recreate index with `plan_id`**: `(user_id, plan_id, type, lower(btrim(regexp_replace(name,'\s+',' ','g'))))` |
| budgets `unique nulls not distinct (user_id, category_id)` | one budget/category + one overall per user | one per **plan** | **recreate as `(user_id, plan_id, category_id)`** |
| assignments `unique (user_id, category_id, month)` | identity per category-month | unchanged — category ids are unique per user, so a category already implies its plan | keep (sync conflictKey untouched) |
| snapshots PK `(user_id, account_id, month)` | identity per account-month | unchanged — same reasoning via accounts | keep; `plan_id` added as plain column |

## Seed-id consequence (handed to U2)
Canonical seed categories use fixed ids (`groceries`, `salary`, …) shared per user. A second seeded plan would collide on PK `(user_id, id)`. Therefore **`seedPlanCategories` must mint fresh `uid()` ids per plan**; only the migrated default plan keeps the historic fixed ids. `is_system` semantics unchanged (per-row flag).
