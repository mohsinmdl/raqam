# Stacked PRs (gh-stack)

This repo uses GitHub's native stacked pull requests via the official
[`gh-stack`](https://github.com/github/gh-stack) CLI extension. A stack is a
chain of branches where each PR's base is the branch below it, so reviewers see
only that layer's diff. Merging is bottom-up.

**Requirements:** `gh` ≥ 2.90 with the extension: `gh extension install github/gh-stack`.
One-time repo config (prevents interactive prompts):

```bash
git config rerere.enabled true       # remember conflict resolutions across rebases
git config remote.pushDefault origin
```

## Create

```bash
gh stack init my-first-layer         # new stack; branches from trunk (main)
# ...edit, git add, git commit as usual...
gh stack add my-second-layer         # next branch, stacked on the previous one
# ...edit, commit...
gh stack submit --auto               # push all + create linked PRs (drafts)
gh stack submit --auto --open        # same, but PRs ready for review
```

Plan layers by dependency: foundations (models, utils) in lower branches,
consumers (UI) in higher ones. One branch = one reviewable concern.

## Inspect / navigate

```bash
gh stack view --json                 # stack state (agents: always --json, the
                                     # bare command opens an interactive TUI)
gh stack up / down [n]               # move away from / toward trunk
gh stack top / bottom / trunk        # jump to stack extremes or main
gh stack checkout <stack#|PR#|branch>
```

## Update mid-stack + restack

Change a lower layer where it belongs, then cascade the rebase upward:

```bash
gh stack down                        # or: gh stack checkout <branch>
# ...edit, commit on the lower branch...
gh stack rebase --upstack            # rebase everything above onto the change
gh stack push                        # force-with-lease per branch
```

Routine sync (fetch + cascade rebase + push + reconcile PR state, handles
squash-merged PRs automatically):

```bash
gh stack sync                        # add --prune to delete merged local branches
```

On a rebase conflict (exit code 3): resolve markers, `git add` the files, then
`gh stack rebase --continue` (or `--abort` to restore everything).

## Restructure

```bash
gh stack modify                      # interactive: drop / fold / reorder (humans)
gh stack unstack                     # tear down tracking (PRs/branches survive),
                                     # then: gh stack init <new-order...>
```

## Land

```bash
gh stack merge --yes                 # bottom-up, ALL-or-nothing for the stack
gh stack merge <PR#> --yes           # merge everything up to and including PR#
```

`gh pr merge` does **not** work on stacked PRs — always land via `gh stack merge`.
Drafts must be marked ready first (`gh pr ready`).

## Notes

- Stack metadata is local-only (`.git/gh-stack`, not committed). PR base-chaining
  on GitHub is visible to everyone; another clone can adopt a stack with
  `gh stack checkout <stack#>` or manage it API-only with `gh stack link`.
- Stacks are strictly linear — one parent, one child. Parallel work = separate stacks.
- Agents: never run `init`/`add`/`checkout` without arguments, `submit` without
  `--auto`, or `view` without `--json` — the interactive prompts hang. Full agent
  rules ship with the extension's skill (`~/.claude/skills/gh-stack/SKILL.md`).
