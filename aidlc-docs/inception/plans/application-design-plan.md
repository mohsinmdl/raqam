# Application Design Plan — Multi-Plan System

> **Note**: Questions are pre-filled with Claude's recommended answers (per your convention). Edit any `[Answer]:` you disagree with, then approve.

## Scope

High-level component identification and interfaces for the four units (db-plans, plan-scoping, plan-formatting, plan-shell-ui). Detailed business logic comes later in per-unit Functional Design.

## Clarifying Questions

## Question 1
How should the formatting engine replace the hardcoded PKR formatting?

A) **Pure core + bound surface**: a new pure module `makeFormatter(planSettings)` returns `{ money, moneyS, num, date, … }`; `calc.js`'s `fmtPKR`/`fmtNum`/`fmtSigned` and the `useMoney()` hook become thin wrappers reading the active plan's formatter (set once at plan load). Call sites across ~195 files stay unchanged; the pure core is directly PBT-testable.

B) Thread plan settings explicitly through every formatter call site (purest, but touches every screen/component)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
How should plan switching work mechanically?

A) In-app: flush pending syncs → teardown store + undo → refetch target plan → re-render (smoothest, but every piece of state must provably reset)

B) **Flush + persist + reload**: flush pending syncs, persist the target plan id (localStorage via prefsStore), then `location.reload()` — the existing boot path (LoadingScreen → fetchAll) does the rest with guaranteed-clean state; YNAB itself does a full navigation between budgets. Upgrade to in-app later if the flash ever bothers us.

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: B`

## Question 3
How should the app read/write the `plans` collection itself?

A) **14th sync.js collection descriptor** (unfiltered by plan_id, camelCase mappers, optimistic write-behind like everything else) — plan create/rename/delete reuse the proven queue, retries, and 401 handling; plans work offline

B) A separate `plansService` with direct Supabase calls (plans are metadata, not ledger data)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 4
Where do rename/delete live in the UI?

A) **Switcher dropdown = switch list + New Plan; a "Manage Plans" item opens a modal** with the plan list, rename inline, and the type-name-to-confirm delete — keeps the dropdown fast, puts destructive actions behind one more deliberate step

B) Kebab menu per plan row inside the switcher dropdown (fewer clicks, destructive actions closer to the surface)

C) A dedicated settings screen/route

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist

- [x] Generate `aidlc-docs/inception/application-design/components.md` with component definitions and high-level responsibilities
- [x] Generate `aidlc-docs/inception/application-design/component-methods.md` with method signatures (business rules detailed later in Functional Design)
- [x] Generate `aidlc-docs/inception/application-design/services.md` with service definitions and orchestration patterns
- [x] Generate `aidlc-docs/inception/application-design/component-dependency.md` with dependency relationships, communication patterns, and data flow
- [x] Generate `aidlc-docs/inception/application-design/application-design.md` consolidating the docs above
- [x] Validate design completeness and consistency against the 17 stories and security/PBT extension rules (all 17 stories covered by C1–C6/S1–S6; no blocking security or PBT findings)
