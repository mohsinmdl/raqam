---
name: sdd-auto
description: Autonomous spec-driven development — explore, design, spec, plan, implement, verify a feature end-to-end without stopping for approval. Invoke with the feature request as arguments.
disable-model-invocation: true
disallowed-tools: AskUserQuestion
---

# sdd-auto — Autonomous SDD Feature Workflow

The arguments to this skill are the feature request. Execute the full workflow
below in one continuous run. Announce the phase you are entering with a single
line each time; otherwise keep narration minimal and let commits and reports
carry the record.

## Workflow

1. **Explore.** Understand the current architecture before designing anything:
   read PRODUCT.md, DESIGN.md, the relevant screens/lib/store code, recent
   commits, and any specs/plans under `docs/superpowers/`. Use Explore
   subagents for broad sweeps; read the load-bearing files yourself.
2. **Design reasoning.** Perform the same reasoning superpowers:brainstorming
   would force: state the problem, enumerate 2–3 viable approaches with
   trade-offs, pick one, and record WHY in the spec's Design Decisions section.
   Do not present the options for approval — decide.
3. **UI/UX tasks.** If the task involves UI structure, visual design,
   interaction patterns, or UX quality, invoke `ui-ux-pro-max:ui-ux-pro-max`
   and follow its workflow (design-system lookup, stack guidelines) before
   writing UI code. DESIGN.md and its named rules remain the binding authority
   where they conflict with generic recommendations.
4. **Resolve ambiguity yourself.** Non-critical ambiguity is resolved from, in
   order: the existing product behavior, the architecture and store/lib
   conventions, DESIGN.md, then conventional best practice. Record each
   resolution as a one-line Decision in the spec.
5. **Write the spec** to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   before any implementation: problem, chosen approach, design decisions,
   scope and anti-goals, states and edge cases, acceptance criteria.
6. **Self-review the spec** with fresh eyes for: ambiguity (could any line be
   read two ways?), scope creep, internal contradictions, missing edge cases,
   responsive behavior, and testable acceptance criteria. Fix inline.
7. **Do NOT stop for approval.** After self-review the spec is internally
   approved. Continue immediately.
8. **Plan.** Create the implementation plan per superpowers:writing-plans
   (bite-sized TDD tasks, exact files, real code in steps, no placeholders)
   at `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`. Commit spec + plan.
9. **Implement incrementally.** Execute the plan task-by-task per
   superpowers:subagent-driven-development (fresh implementer per task, task
   review after each, fix loops, ledger in `.superpowers/sdd/`), committing
   per task. Where the harness lacks subagents, execute inline per
   superpowers:executing-plans.
10. **Gate on checks.** After each task and at the end: `pnpm test` (full
    suite green), `pnpm build` (clean). Run lint only if the project defines a
    lint script.
11. **Verify UI visually.** For UI work, verify the running application:
    start the dev server for the worktree and delegate live verification to a
    Playwright subagent (project convention) — phone viewport 393×852 AND
    desktop 1280×800 when the work is responsive. Real acceptance criteria
    from the spec, not smoke checks. Clean up any test data created.
12. **Fix what verification finds**, re-verify, and re-run the checks.
13. **Finish only when every acceptance criterion is satisfied.** Close with a
    report: what shipped, the commits, how it was verified, and any decisions
    of note. Update the spec's acceptance-criteria checklist to reflect
    verified state.

## Autonomy rules (binding)

- Do not ask the user questions unless execution is genuinely impossible
  without information that cannot be inferred from the repository.
- Do not stop between brainstorming, specification, planning, implementation,
  testing, or verification.
- Make reasonable product and engineering decisions yourself; if one approach
  is clearly best, choose it and document the decision rather than asking.
- Prefer existing conventions over introducing new architecture.
- Never change unrelated functionality.
- Never deploy, push, delete remote resources, modify production data, rotate
  credentials, or perform other irreversible operations. Commits stay local;
  the user pushes and merges.
- Treat the specification as internally approved after self-review.
- Continue working until the requested feature is complete and verified.

## Project constraints that always apply

- Work in an isolated git worktree (create one if not already in one).
- Tests are pure-function vitest only — no jsdom; UI truth comes from the
  live Playwright verification.
- Money figures always go through `useMoney()`/`fmtPKR` (privacy mask) and
  carry `.tnum`; `parseAmt` returns NaN (never 0) for empty/garbage input.
- DESIGN.md named rules (One Teal, Signal-Only, Tabular Money, Weight-Not-
  Face, Flat Ledger) are non-negotiable; document any new type-ramp step in
  DESIGN.md when a design decision introduces one.
- Supabase sync: new persisted fields need fixed-column mapping in
  `src/store/sync.js` and a migration — flag migrations for the user to
  apply; never run them against production yourself.
