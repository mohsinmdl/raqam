# U2 plan-scoping — Functional Design Plan

> **Note**: Questions pre-filled with Claude's recommendations (per your convention).

## Scope
Detailed logic for: sync.js plan awareness (plans descriptor, `fetchAll(planId)`, `fetchPlans`, `setActivePlanId` stamping), `PlanProvider` (resolution/switch/zero-plan gate), plan actions (`createPlan`/`renamePlan`/`deletePlan`/`seedPlanCategories` with fresh ids), seeding switch-over, open-plan persistence. Owns US-6/8/9/11/12; contributes to US-1/3/4/16/17.

Settled by evidence (no questions): `openPlanId` and the one-shot seed flag persist in the existing per-user localStorage prefs (`raqam.prefs.u.{uid}` via prefsStore — per-user *and* per-device, exactly US-9's semantics); stamping happens in scoped `toRow` mappers from the module-level active plan id.

## Clarifying Questions

## Question 1
Undo semantics for plan lifecycle actions?

A) **Rename undoable; create/delete NOT undoable** — rename is an ordinary in-plan edit; create immediately switches away (reload empties the stack anyway), and undoing a delete cannot restore the server-side cascaded children, so offering it would be a lie. Delete's protection is the typed-name confirm, not undo

B) All three undoable (delete-undo restores only the plan row, orphan-risk accepted)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 2
Audit-trail rows for plan lifecycle (create/rename/delete)?

A) **None in v1** — audit_log is per-plan ledger history; plan meta-events aren't ledger events, and auditing them would require widening the audit entity_type CHECK (another migration touch). Plan lifecycle remains traceable via plans.created_at and the sync layer

B) Log rename/create as entity_type 'app' rows inside the affected plan (no schema change, partial coverage)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 3
Per-user localStorage prefs that are really per-plan (saved Plan-screen views via planViews, skippedSetup): scope them per plan?

A) **Namespace per plan** — saved views (and future per-plan prefs) key under the plan id inside the existing prefs object (`plans: { [planId]: { views… } }`); each plan keeps its own saved views like YNAB; migration of the existing flat keys folds them into the default plan's namespace

B) Leave shared across plans for v1 (saved views bleed between plans; simpler)

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist
- [x] Generate `aidlc-docs/construction/plan-scoping/functional-design/business-logic-model.md` (fetch/stamp/switch/seed flows, resolveOpenPlan algorithm, seed-flag lifecycle)
- [x] Generate `aidlc-docs/construction/plan-scoping/functional-design/business-rules.md` (isolation invariants, drain-before-reload, delete guards, fresh-seed-ids, prefs namespacing)
- [x] Generate `aidlc-docs/construction/plan-scoping/functional-design/domain-entities.md` (plan object shape in the store, prefs schema, seed-flag shape)
- [x] Validate against US-6/8/9/11/12 ACs and SECURITY-08/15 (all ACs mapped to L1–L7/BR-U2-1..9; FirstPlanSetup creation runs pre-store via direct insert — noted for U4)
