# U1 db-plans — Business Logic Model (Backfill Algorithm)

Migration file: `supabase/migrations/0017_plans.sql` (next number after 0016), single transaction.

## Phase order

```
BEGIN
1. CREATE TABLE plans (…)                       -- + RLS enable + 4 policies
2. INSERT default plans:
     INSERT INTO plans (user_id, id, name, currency, currency_placement, number_format, date_format)
     SELECT DISTINCT user_id, 'default', 'My Plan', 'PKR', 'none', 'comma-dot', 'DD/MM/YYYY'
     FROM ( UNION ALL of user_id from the 11 tables ) u
     ON CONFLICT (user_id, id) DO NOTHING
3. For each of the 11 tables:
     ALTER TABLE t ADD COLUMN IF NOT EXISTS plan_id text
     UPDATE t SET plan_id = 'default' WHERE plan_id IS NULL
     ALTER TABLE t ALTER COLUMN plan_id SET NOT NULL          -- guarded
     ALTER TABLE t ADD CONSTRAINT t_plan_fk FOREIGN KEY (user_id, plan_id)
         REFERENCES plans (user_id, id) ON DELETE CASCADE     -- guarded (IF NOT EXISTS pattern)
     CREATE INDEX IF NOT EXISTS t_user_plan_idx ON t (user_id, plan_id)
4. Recreate semantic uniques:
     DROP INDEX categories name-unique; CREATE UNIQUE INDEX … (user_id, plan_id, type, normalized name)
     ALTER TABLE budgets DROP CONSTRAINT old unique; ADD UNIQUE NULLS NOT DISTINCT (user_id, plan_id, category_id)
COMMIT
```

Step 3 ordering note: parents before children is not required (FKs are to `plans` only), but tables are processed in COLLECTIONS order for readability.

## Verification queries (run after apply — included in migration header comment)

```sql
-- 1. every data-owning user has the default plan
select count(*) from plans where id = 'default';
-- 2. zero unstamped rows anywhere (should all return 0)
select count(*) from transactions where plan_id is null;  -- … repeat per table
-- 3. per-table row counts unchanged vs pre-migration snapshot
select 'transactions', count(*) from transactions;         -- … compare with before
-- 4. ownership integrity spot check (0 rows)
select count(*) from transactions t left join plans p
  on (t.user_id, t.plan_id) = (p.user_id, p.id) where p.id is null;
```

## Rollback (documented in header; reverse order)

```sql
BEGIN;
-- restore original uniques (budgets unique, categories name index without plan_id)
-- per table: DROP INDEX t_user_plan_idx; ALTER TABLE t DROP CONSTRAINT t_plan_fk;
--            ALTER TABLE t DROP COLUMN plan_id;
DROP TABLE plans;
COMMIT;
```
Safe because `plan_id` is purely additive — no existing column or row content is modified.

## Production application procedure (Q3=A)
1. Take a Supabase backup (dashboard → Database → Backups, or `pg_dump`).
2. Apply `0017_plans.sql` via SQL editor / `supabase db push` after PR merge.
3. Run the verification queries; compare counts with pre-apply snapshot.
4. Deploy the app build that understands plans (already live on Pages after merge — the migration MUST be applied before or immediately with the merge; the ordering requirement is called out in Build & Test instructions: **older clients keep working** because `plan_id` has a DB-side backfill only for existing rows — new writes from an old client would fail NOT NULL, so the apply window must be coordinated with the deploy: apply migration, then merge/deploy within the same sitting).

## Testable properties (for U1 tests, executed in Code Generation)
- Idempotency: applying steps 2–3 twice = same state (oracle: row counts + checksums).
- Equivalence: for every table, `count(pre) = count(post)` and non-plan columns byte-identical.
- Integrity: constructed cross-user `plan_id` insert fails; unstamped insert fails.
- Uniqueness: same category name in two plans OK; duplicate within one plan rejected; two overall budgets in one plan rejected, one per plan OK.
