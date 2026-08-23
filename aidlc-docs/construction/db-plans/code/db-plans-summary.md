# U1 db-plans — Code Generation Summary

## Created
- `supabase/migrations/0017_plans.sql` — plans table (CHECK-constrained settings, canonical policy quartet RLS); idempotent "My Plan"/`'default'` backfill for every data-owning user; `do $$` scoping pass over the 11 ledger tables (add `plan_id` → stamp → NOT NULL → composite FK `on delete cascade` → `(user_id, plan_id)` index); per-plan recreation of `categories_user_type_normname_key` → `categories_user_plan_type_normname_key` and `budgets_user_id_category_id_key` → `budgets_user_plan_category_key`. Header carries design rationale, apply procedure, and full rollback script.
- `scripts/plans-migration-verify.sql` — pre-apply snapshot (row counts, data-owning-user count) + post-apply checks (default-plan count, zero unstamped rows, count equivalence, ownership-integrity joins, constraint-shape probe, idempotency re-run procedure).

## Stories
- US-1 ✅ implemented (backfill + defaults reproduce today's rendering; idempotent re-run)
- US-2 ✅ implemented (composite FK fence; RLS unchanged)

## Deferred to Build & Test / apply time
- Live-DB proofs (constraint rejection, cascade, idempotent re-run) — no local Postgres harness in this repo; the verify script encodes them. Apply to a branch/copy DB first, then production with backup, deploying the plans-aware build in the same sitting (old clients fail loudly on NOT NULL, never misfile).

## Notes for U2
- `setActivePlanId` stamping must cover all 11 collections incl. audit_log; snapshots keep PK `(user_id, account_id, month)` (plan_id is a plain column there).
- Seeding a new plan must mint fresh category ids (fixed seed ids exist only in the migrated default plan).
