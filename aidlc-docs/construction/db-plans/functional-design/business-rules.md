# U1 db-plans — Business Rules

## BR-1: Ownership integrity (US-2, SECURITY-08)
A row's `plan_id` must reference a plan owned by the same `user_id`. Enforced structurally by the composite FK `(user_id, plan_id) → plans(user_id, id)` — a forged `plan_id` belonging to another user cannot satisfy the FK because the row's own `user_id` participates. RLS remains the read/write boundary (`auth.uid() = user_id`), unchanged in shape.

## BR-2: Cascade delete (US-17, FR-7.2)
`ON DELETE CASCADE` from every scoped table to `plans` makes plan deletion atomic and server-side: deleting the plan row removes all 11 tables' rows in one transaction. Client never enumerates children. audit_log rows of that plan cascade too — accepted: the plan's audit trail is meaningless without the plan (deleting a plan is the documented data-destruction act, guarded by the typed-name confirm).

## BR-3: Backfill (US-1)
- A `'default'` plan named **"My Plan"** is created for every user that owns at least one row in any of the 11 tables (union of distinct `user_id`s).
- All existing rows get `plan_id = 'default'`; then `NOT NULL` is enforced.
- Settings = canonical defaults (PKR / none / comma-dot / DD/MM/YYYY) → rendering provably identical.
- Users with zero data get no plan — first-use flow (US-3) creates their first plan.

## BR-4: Idempotency (US-1 re-run AC, SECURITY-13)
- Plan insert: `ON CONFLICT (user_id, id) DO NOTHING`.
- Stamping: `UPDATE … SET plan_id = 'default' WHERE plan_id IS NULL` — second run matches zero rows.
- DDL: `IF NOT EXISTS` / guarded `DO $$` blocks for columns, constraints, indexes.
- The migration is a single transaction: partial application is impossible (SECURITY-13, NFR-1.2).

## BR-5: Settings validity (SECURITY-05, NFR-1.3)
CHECK constraints are the enforcement for placement/number/date keys and name non-emptiness/length; currency checked by shape (`^[A-Z]{3}$`). Client validation (U3 catalogues, U4 forms) is UX, not the boundary.

## BR-6: Per-plan uniqueness semantics
- Category names unique per (plan, type) — recreated index (domain-entities.md).
- One budget per category and one overall budget per plan — recreated unique.
- assignments/snapshots identities unchanged (parent entity already implies the plan).
- Cross-plan references are impossible for FK'd entities (transactions→categories etc. use `(user_id, *)` composite FKs; both rows must share the user, and stamping + fetch scoping keep them in one plan; the DB-level cross-plan guard is BR-1 on each row).

## BR-7: RLS for `plans`
Exact 0015 canonical four-policy form. No sharing/membership semantics (out of scope v1 — no "Add Member").

## BR-8: What the migration must NOT do
- No changes to `institutions` / `card_products` (Q1=A).
- No changes to money/date storage formats, no row rewrites beyond the `plan_id` stamp.
- No changes to existing RLS policies on the 11 tables (user_id boundary stays as-is).

## Error scenarios
| Scenario | Outcome |
|---|---|
| Migration fails mid-way | Transaction rollback — schema untouched |
| Insert with `plan_id` of another user's plan | FK violation (BR-1) |
| Insert with no `plan_id` | NOT NULL violation — client bug surfaces loudly, never silent misfiling |
| Invalid settings value | CHECK violation → sync `rejected:plans` status (existing terminal-error surfacing) |
| Delete last plan | UI-guarded (U2/U4); DB allows it (a user with zero plans equals the fresh-user state, handled by first-use) — documented residual risk, acceptable for v1 |
