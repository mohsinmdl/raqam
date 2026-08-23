# Requirement Verification Questions — Multi-Plan System

> **Note**: Answers below are pre-filled with Claude's recommendations (per your convention). Edit any `[Answer]:` you disagree with, or just confirm and everything stands as-is. Q1 was answered by you directly.

Context: YNAB-style multi-Plan support — plan switcher, New Plan modal (name, currency, currency placement, number format, date format), Open Plan, per-plan data scoping. Reverse engineering confirmed: 13 per-user tables PK `(user_id, id)`, no plan entity, unfiltered `fetchAll()` in `src/store/sync.js`, formatting hardcoded `'Rs '`/`en-PK` in `src/lib/calc.js`.

## Question 1
What happens to your existing data (accounts, transactions, categories, budgets) when multi-Plan ships?

A) Auto-migrate everything into a first plan named "My Plan" — you can rename it later from the plan switcher

B) Auto-migrate everything into a first plan named after something existing (e.g. "Raqam" or your email), renameable later

C) On first launch after the update, show a one-time dialog asking you to name your existing plan before continuing

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
How should plan scoping be added to the database schema? (All 13 per-user tables currently have PK `(user_id, id)`.)

A) New `plans` table + a `plan_id` column (NOT NULL, FK to plans, backfilled by migration) on every per-user table; primary keys stay `(user_id, id)`; RLS stays user_id-based — recommended: least churn, IDs stay globally unique per user

B) Widen primary keys to `(user_id, plan_id, id)` so row IDs are only unique within a plan — deeper migration, touches every FK and the sync layer's identity assumptions

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 3
How should the app load plan data at runtime? (`fetchAll()` currently pulls every row of every table, RLS-trusted.)

A) Fetch only the open plan's rows (add `plan_id` filters in sync.js); switching plans refetches — YNAB behavior, smaller memory/network footprint, keeps store shape unchanged

B) Fetch all plans' data up front and filter in the client store — instant plan switching, but heavier initial load and bigger store/undo/audit blast radius

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 4
What do "currency" and the format settings mean for amounts?

A) Display-only, like YNAB — currency/placement/number/date format only change how amounts and dates are rendered in that plan; amounts stay plain integers; no conversion between plans

B) Real multi-currency — exchange rates, conversion on transfers between plans (major scope increase; not what YNAB does)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 5
Where should each plan's settings (name, currency, placement, number format, date format) be stored?

A) As columns on the `plans` table in Postgres — settings follow you across devices/browsers, like YNAB

B) In localStorage per device (like current Raqam prefs) — no schema change for settings, but not portable

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 6
Which option sets should the New Plan modal offer? (Screenshots show YNAB's full lists.)

A) Full YNAB parity — complete ISO currency list (searchable), all 8 number formats (incl. `1,23,456.78`), all 7 date formats, 3 currency placements; defaults: PKR, Don't show, `123,456.78`, `30/12/2026`-style

B) Curated shortlist — PKR + ~10 common currencies, 3–4 number formats, 3–4 date formats; expandable later

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 7
What should a newly created plan contain?

A) Seed with Raqam's default category groups/catalogues (same as current first-use seeding; YNAB seeds Bills/Needs/Wants) — accounts always start empty

B) Completely empty — no categories, no accounts

C) Ask at creation time (checkbox in the New Plan modal: "Start with default categories")

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: C`

## Question 8
Where does the plan switcher live?

A) YNAB-style: current plan name + your email at the top of the desktop sidebar, opening a dropdown with New Plan / Open Plan (plan list); phone gets an equivalent entry point in its shell

B) Desktop-first: sidebar-top switcher on desktop only; phone ships later

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 9
Beyond create / open / switch, which plan-management operations belong in v1?

A) Rename + delete (delete requires typing the plan name to confirm; deleting the last remaining plan is blocked)

B) Rename only — defer delete to a follow-up

C) Rename + delete + archive/unarchive

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 10
Should the per-plan date format also take over the app's existing date displays (register, reports, pickers), replacing hardcoded `en-PK` formatting everywhere?

A) Yes — all user-facing dates and numbers flow through per-plan format settings (single formatting module reads the open plan)

B) Minimal — apply plan formats to amounts/currency only for now; date displays keep current formatting until a follow-up

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 11: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 12: Resiliency Extensions
Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies a set of **directional, design-time best practices** for building resilient systems, derived from the **AWS Well-Architected Framework (Reliability Pillar)** and resilience-review guidance. It steers requirements, design, and code toward fault tolerance, high availability, observability, and recoverability — covering 15 practice areas across business goals, change management, observability, high availability, disaster recovery, and continuous improvement.

**What this extension is NOT.** Enabling it does **not** make your workload production-ready, nor does it certify or guarantee any availability, RTO, or RPO target. It is a **starting point** that scaffolds good resiliency decisions early — it is not a substitute for a formal **AWS Well-Architected Review** of the built system.

Treat the output as a well-grounded **first draft of your resiliency posture** to build on and validate — not a finished, production-certified result.

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads, as an informed starting point that you can validate and harden before go-live)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects where rapid iteration matters more than reliability)

X) Other (please describe after `[Answer]:` tag below)

`[Answer]: B`

## Question 13: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)

X) Other (please describe after `[Answer]:` tag below)

`[Answer]: B`
