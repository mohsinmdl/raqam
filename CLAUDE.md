# Raqam — agent notes

## Package manager

pnpm only, never npm: `pnpm install` / `pnpm test` / `pnpm build`.

## Worktrees self-provision

- `.githooks/post-checkout` auto-runs `pnpm install --frozen-lockfile --prefer-offline`
  in any fresh worktree (skips when `node_modules` exists). Requires the one-time
  per-clone setup from the README: `git config core.hooksPath .githooks`.
- `.worktreeinclude` copies `.env.local` into Claude-created worktrees. The app
  cannot boot without it — it carries the Supabase keys. Never commit it.

## Parallel agent work: named worktree slots

Use named slots (`claude --worktree agent-1`, `agent-2`, …). Reopening a name
reuses the same directory; with the default `worktree.baseRef: "fresh"`, a clean
finished slot resets to origin/main on reopen. Treat slots as reusable execution
slots — don't hoard one-off task worktrees.

## Branch / PR hygiene

- Before pushing more commits to a branch that has a PR, check the PR hasn't
  already merged (stranded-push hazard).
- Stacked PRs are managed with `gh stack` — never `gh pr merge` on a stack.

## Tests

`pnpm test` = vitest, node env only (no jsdom). Components are verified live in
the browser; pure logic gets unit tests.
