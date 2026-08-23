# Integration Test Instructions — Multi-Plan

Two integration layers: (A) live browser flows across all four units (runnable now, stubbed data boundary), (B) database proofs (runnable only at 0017 apply time).

## A. Live browser verification (Playwright, stubbed sync boundary)
The repo has no jsdom; UI integration is verified by mounting the real app in a throwaway Vite harness that stubs the supabase/sync boundary via a plugin `resolveId` hook (never `alias`), then driving it with Playwright. The stub serves two seeded plans, honors `plan_id` filters, captures pushes, and survives `location.reload()` via localStorage — so switch/create/delete flows run end-to-end minus the real DB.

**Scenarios = the 17 stories' Given/When/Then ACs** (`aidlc-docs/inception/user-stories/stories.md`), desktop + phone viewports. Executed by the verification subagent during this stage; its per-story PASS/FAIL table is recorded in `build-and-test-summary.md`.

**What the stub CANNOT prove** (deferred to B): RLS enforcement, composite-FK rejection, ON DELETE CASCADE, migration idempotency/equivalence, PostgREST filter behavior.

## B. Database proofs (at 0017 apply time)
1. **Backup** the Supabase project.
2. Run the PRE-APPLY block of `scripts/plans-migration-verify.sql`; keep output.
3. Apply `supabase/migrations/0017_plans.sql` (SQL editor or `supabase db push`).
4. Run the POST-APPLY checks (default-plan count, zero unstamped rows, count equivalence, ownership joins, constraint shape).
5. **Idempotency**: re-apply 0017; repeat checks — identical output required.
6. **Constraint probes** (SQL editor, as an authenticated test where relevant):
   - insert a row with a `plan_id` not owned by that user → composite FK violation
   - insert a scoped row with NULL `plan_id` → NOT NULL violation
   - same category name in two plans → OK; duplicate within one plan → unique violation
   - two overall budgets in one plan → violation; one per plan → OK
   - delete a test plan row → children vanish (cascade)
7. Smoke the deployed app: sign in → "My Plan" renders identically to pre-migration (balances, Rs formatting, dates), switcher visible.

## Cross-unit contracts re-checked here
- Format keys: 0017 CHECK lists ≡ seed.js `PLAN_*` ≡ `planFormatOptions` (pinned by `tests/plan-format.test.js` catalogue-consistency)
- Migrated defaults ≡ legacy rendering (equivalence oracle files)
- Seeded plans mint fresh category ids (US-6/AC + `tests/plan-shell.test.js`)
