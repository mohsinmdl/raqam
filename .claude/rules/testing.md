# Testing & scratch-harness rules

How to validate features without churning throwaway files inside the worktree.
This file auto-loads every session (rules without `paths` frontmatter load at
launch with the same priority as `.claude/CLAUDE.md`).

Two paths for validation:

- **Reusable behavior → a REAL, committed test** under `tests/`. Never deleted.
- **One-off UI/debug probe → an OUT-OF-TREE harness**, reused across sessions,
  never inside the worktree.

## Rules

1. **Prefer the repo's framework — Vitest.** `pnpm test` runs `vitest run`.
   Tests live in `tests/*.test.js`, node environment, **no jsdom** — so only
   pure logic is unit-tested (`src/lib/`, `src/store/`).

2. **Would-regress behavior becomes a permanent test.** If a validation covers
   behavior that could regress, create or update a test under `tests/`. Do NOT
   delete it afterward — that is how a probe becomes a regression test.

3. **Never put throwaway files inside the git worktree.** No disposable
   harnesses, debug scripts, or temp files under the checkout. Nothing throwaway
   may ever appear in `git status` (guards against an accidental `git add .`).

4. **All harness runtime files live out of tree**, in the scratch dir:

   ```sh
   ~/.cache/claude-harness/$(basename "$(git rev-parse --show-toplevel)")/
   ```

   For this repo that resolves to `~/.cache/claude-harness/raqam/`. It survives
   branch switches, worktree add/remove, rebases, and resets — and never shows in
   `git status`. **Reuse what's already there before creating anything new.**

## UI probes — two modes

Both resolve app source + `node_modules` against the **CURRENT worktree** via
`RAQAM_WT="$(git rev-parse --show-toplevel)"` (never the main checkout or the git
common dir), and run with the worktree's own toolchain
(`pnpm --dir "$RAQAM_WT" exec vite …`).

5. **Local-DB mode (default — real app, real data).** Runs the real app against a
   **local seeded Supabase stack** (Docker), never production.

   ```sh
   ~/.cache/claude-harness/raqam/up.sh      # start stack (if down) + db reset → seed
   ~/.cache/claude-harness/raqam/serve.sh   # app on http://127.0.0.1:5173, auto-logged-in
   ```

   - Requires Docker running. The stack is **one per machine, shared across
     worktrees** (`supabase/config.toml` `project_id="raqam"`); first `supabase
     start` pulls images (slow, one-time).
   - Seed lives in `supabase/seed.sql` (synthetic, committed); harness login is
     `harness@raqam.test` / `harness-password`. `up.sh`/`db reset` restores a
     known state. All probe writes (auto-synced ~300ms by `src/store/sync.js`)
     land in **local** Postgres only, RLS-scoped to the harness user.
   - Drive with Playwright MCP against `http://127.0.0.1:5173`. Verify isolation:
     `browser_network_requests` must show only `127.0.0.1:54321`, never the prod
     project.
   - The harness Vite config (`vite.harness.local.mjs`) sets `root=$RAQAM_WT`,
     overrides only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` via `define`, and
     injects auto-login. **Do NOT edit the worktree's `.env.local`** (it holds the
     prod URL, copied in by `.worktreeinclude`).

6. **Stub mode (isolate one component, no DB).** For probing a single component
   in isolation, use `vite.harness.config.mjs` + `supabase.stub.js` in the scratch
   dir — it stubs `src/lib/supabase.js` via a `resolveId` plugin (not `alias`).
   See memories `verifying-ui-without-jsdom`, `verifying-native-dnd`.

7. **Run the suite before finishing.** `pnpm test` (or the relevant subset) must
   pass before you call the work done.
