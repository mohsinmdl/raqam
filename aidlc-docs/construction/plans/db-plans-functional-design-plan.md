# U1 db-plans — Functional Design Plan

> **Note**: Questions pre-filled with Claude's recommendations (per your convention).

## Scope
Detailed design of the plans schema, scoping columns/FKs/RLS, and the backfill migration. Owns US-1 (migration) and US-2 (ownership integrity); contributes to US-3/4/5/11/17.

## Clarifying Questions

## Question 1
Which tables get `plan_id`? Two of the 13 are reference data: `institutions` (global bank catalogue + your own custom banks) and `card_products` (global catalogue).

A) **Scope the 11 ledger tables only** (category_groups, categories, assignments, accounts, cards, transactions, snapshots, budgets, recurring, payees, audit_log). Your own custom banks and the catalogues stay **per-user, shared across plans** — banks are real-world entities; a new plan still offers your banks when adding accounts (matches YNAB, where institutions aren't budget-scoped)

B) Scope own-institutions too (each plan maintains its own bank list; catalogues stay global)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
Backfill identity for the migrated plan?

A) **Deterministic id `"default"`** with name "My Plan" — constant id makes the backfill naturally idempotent (`INSERT … ON CONFLICT DO NOTHING`, `UPDATE … WHERE plan_id IS NULL`) and trivially testable; ids only need uniqueness per user

B) Random uid per user (consistent with client-generated ids, but idempotency needs bookkeeping)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 3
How does the migration reach the production database?

A) **Current practice**: migration lands in `supabase/migrations/` via the PR; after merge you apply it to prod (Supabase SQL editor / CLI) with a DB backup taken first — I include exact apply + verify + rollback steps in the migration's header comment and Build & Test instructions

B) Wire migrations into CI to auto-apply on deploy (new automation, new failure modes — out of this feature's scope)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist
- [x] Generate `aidlc-docs/construction/db-plans/functional-design/domain-entities.md` (plans entity, settings value keys — single source for U1/U3 —, scoping column spec per table)
- [x] Generate `aidlc-docs/construction/db-plans/functional-design/business-rules.md` (constraints, RLS, cascade, idempotency, uniqueness interactions with (category,month)/(account,month))
- [x] Generate `aidlc-docs/construction/db-plans/functional-design/business-logic-model.md` (backfill algorithm, verification queries, rollback)
- [x] Validate against US-1/US-2 ACs and SECURITY-05/08/13 (all ACs mapped; found + resolved: per-plan category-name uniqueness, per-plan overall-budget unique, seed-id collision → fresh ids rule handed to U2)
