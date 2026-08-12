# Raqam — project instructions

## Stacked PRs

Multi-step features are shipped as **stacked pull requests** using GitHub's
native `gh stack` CLI extension — see [docs/STACKED-PRS.md](docs/STACKED-PRS.md)
for the full workflow (create → submit → sync → merge).

- One branch per reviewable concern; foundations in lower branches.
- Submit with `gh stack submit --auto` (drafts); land with `gh stack merge`
  (never `gh pr merge` on a stacked PR).
- Agents must use the non-interactive forms: `view --json`, `submit --auto`,
  and always pass branch names to `init`/`add`/`checkout`.
