# U1 db-plans — Code Generation Plan

**Single source of truth for U1 generation.** Brownfield: modify/create in workspace root; docs in `aidlc-docs/construction/db-plans/code/`.

## Unit context
- **Stories**: US-1 (migration into "My Plan"), US-2 (ownership integrity); contributes to US-3/4/5/11/17
- **Depends on**: nothing (first unit)
- **Provides**: schema contract for U2 (tables/FKs), canonical settings keys for U3/U4
- **Design inputs**: `aidlc-docs/construction/db-plans/functional-design/*` (approved)

## Steps

- [x] **Step 1 — Migration**: Create `supabase/migrations/0017_plans.sql` in house style (lowercase SQL, header design comment, `public.` schema, canonical policy quartet, `do $$` loop for the 11-table scoping pass). Contents per business-logic-model.md: plans table + CHECKs + RLS; default-plan backfill (`ON CONFLICT DO NOTHING`); per-table add column → stamp `'default'` → `set not null` → composite FK `on delete cascade` → `(user_id, plan_id)` index; recreate categories name-unique with `plan_id`; recreate budgets unique as `(user_id, plan_id, category_id) nulls not distinct`. Idempotent guards throughout; single transaction (migration files run in one implicit transaction via psql/supabase CLI — no explicit BEGIN needed, note in header). Header includes: apply procedure, verification pointer, rollback script. *(US-1, US-2)*
- [x] **Step 2 — Verification script**: Create `scripts/plans-migration-verify-{pre,post}apply.sql` — post-apply checks from business-logic-model.md (default-plan count, zero unstamped rows per table, ownership-integrity join, per-table row counts to compare against a pre-apply snapshot; plus a pre-apply snapshot query block).
- [x] **Step 3 — Docs summary**: Create `aidlc-docs/construction/db-plans/code/db-plans-summary.md` — what was generated, apply/rollback procedure, and the deferred live-DB proofs (idempotency/equivalence/integrity tests run at apply time via the verify script — no local Postgres harness exists in this repo; called out for Build & Test).
- [x] **Step 4 — Story checkboxes**: US-1 [x], US-2 [x] implemented; aidlc-state.md updated.

## Test strategy note
DB-level behavior (constraint rejections, cascade, idempotent re-run) is provable only against Postgres; the repo has no local DB harness. Proofs are encoded as the verify script + Build & Test instructions (apply to a copy/branch DB first). Client-side tests covering the schema contract (mappers, keys) belong to U2/U3.
