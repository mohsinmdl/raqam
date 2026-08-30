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

## UI probes — real app against remote Supabase

5. **Run the real app against the hosted (production) Supabase**, auto-logged-in
   as a **dedicated test account** — never your own:

   ```sh
   ~/.cache/claude-harness/raqam/serve.remote.sh   # → http://127.0.0.1:5173
   ```

   Then drive it with Playwright MCP against `http://127.0.0.1:5173`.

   - **SAFETY (critical): writes auto-sync to the DB in ~300ms** (`src/store/sync.js`).
     Only ever sign in as the dedicated test account, whose rows RLS isolates from
     the real ledger. **Never** point a write-capable probe at your own account.
     Before interacting, confirm you are signed in as the test account.
   - The account starts empty under RLS — seed it once (CSV import / a few entries).
   - Credentials live in a **gitignored** `~/.cache/claude-harness/raqam/.harness-creds`
     (copy `.harness-creds.example`), never in the repo or a committed file.

6. **Resolve against the CURRENT worktree.** `serve.remote.sh` sets
   `RAQAM_WT="$(git rev-parse --show-toplevel)"` and the harness Vite config uses
   `root=$RAQAM_WT`, so the app + its prod `.env.local` + `node_modules` all come
   from the active worktree (never the main checkout or the git common dir).
   **Do NOT edit `.env.local`** — it already holds the prod URL/key
   (copied in by `.worktreeinclude`); the harness needs no env override.

7. **Run the suite before finishing.** `pnpm test` (or the relevant subset) must
   pass before you call the work done.
