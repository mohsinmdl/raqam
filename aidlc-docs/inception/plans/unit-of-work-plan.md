# Unit of Work Plan — Multi-Plan System

> **Note**: Questions pre-filled with Claude's recommendations (per your convention). The 4-unit decomposition was already sketched and approved in `execution-plan.md`; these questions pin it down.

## Decomposition context

Monolith SPA — units are sequential slices of one codebase (logical modules), not deployable services. Story grouping follows the approved feature areas; team alignment is N/A (solo); no per-unit scalability/deployment differences (single bundle, single DB); domain boundary = the plan scoping dimension itself. These categories are therefore settled by evidence; the open items are below.

## Clarifying Questions

## Question 1
Confirm the unit decomposition?

A) **Four units as approved**: U1 `db-plans` (C1 schema/migration) → U2 `plan-scoping` (C2 PlanProvider, C3 sync, C5 actions) → U3 `plan-formatting` (C4 engine + catalogues) → U4 `plan-shell-ui` (C6 switcher/modals/first-use/phone)

B) Three units — merge U3 formatting into U4 UI (fewer gates, but the formatting logic then gets reviewed mixed with UI noise)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
Construction order for the middle units?

A) **U1 → U2 → U3 → U4** — scoping right after schema so the data path is provable early; formatting next; UI last consumes everything

B) U1 → U3 → U2 → U4 — formatting earlier (it only depends on U1's settings shape)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist (Part 2 — Generation)

- [x] Generate `aidlc-docs/inception/application-design/unit-of-work.md` with unit definitions, responsibilities, and in-repo module organization
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-dependency.md` with dependency matrix and coordination points
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-story-map.md` mapping all 17 stories to units
- [x] Validate unit boundaries and dependencies against components.md/services.md (C1–C6 each owned by exactly one unit; S1–S6 flows span U2/U4 as designed)
- [x] Ensure all stories are assigned to units (17/17 mapped, each with exactly one owner)
