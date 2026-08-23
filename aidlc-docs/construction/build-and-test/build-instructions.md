# Build Instructions — Multi-Plan

## Prerequisites
- **Build tool**: pnpm 10.33.4 (pinned via packageManager), Node ≥ 20, Vite (repo-pinned)
- **Dependencies**: `pnpm install` (worktrees self-provision via the post-checkout hook); new devDependency this feature: `fast-check@4.9.0`
- **Environment**: `.env` with the Supabase URL/anon key (see `.env.example`) — needed to RUN, not to build/test

## Build Steps
1. `pnpm install` — lockfile-driven, ~seconds
2. `pnpm build` — Vite production build
3. **Verify**: build ends `✓ built`; the long-standing chunk-size warning is expected and acceptable

## Deployment coupling (CRITICAL for this feature)
Merging to `main` auto-deploys to raqam.pages.dev (`.github/workflows/deploy.yml`: test → build → wrangler). The deployed build REQUIRES migration `0017_plans.sql` to be applied first — an un-migrated DB has no `plans` table, so boot fails at `fetchPlans`; conversely an old client against a migrated DB fails loudly on NOT NULL inserts (never misfiles). **Procedure: apply 0017 (with backup + verify script) and merge in the same sitting — migration first.** Details: header of `supabase/migrations/0017_plans.sql` and `scripts/plans-migration-verify.sql`.

## Troubleshooting
- **Install fails**: check pnpm version (`corepack enable` / repo-pinned pnpm)
- **Build import errors on plan modules**: ensure you're on `worktree-multi-plan` with all four units present (`src/lib/planFormat.js`, `src/store/PlanProvider.jsx`, `src/ui/plans/`)
