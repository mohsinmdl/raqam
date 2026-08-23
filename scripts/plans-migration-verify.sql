-- Verification companion to supabase/migrations/0017_plans.sql.
-- Run the PRE-APPLY block before migrating (keep the output), the POST-APPLY
-- block after, and compare. Run as a service/admin role (RLS bypass) so counts
-- cover all users; from the SQL editor use the postgres role.

-- ========================== PRE-APPLY SNAPSHOT ==============================
-- Row counts per ledger table (compare 1:1 with post-apply).
select 'category_groups' as tbl, count(*) from public.category_groups
union all select 'categories',    count(*) from public.categories
union all select 'accounts',      count(*) from public.accounts
union all select 'snapshots',     count(*) from public.snapshots
union all select 'cards',         count(*) from public.cards
union all select 'transactions',  count(*) from public.transactions
union all select 'budgets',       count(*) from public.budgets
union all select 'assignments',   count(*) from public.assignments
union all select 'recurring',     count(*) from public.recurring
union all select 'payees',        count(*) from public.payees
union all select 'audit_log',     count(*) from public.audit_log
order by tbl;

-- Users owning ledger data (should equal post-apply default-plan count).
select count(distinct user_id) as data_owning_users from (
  select user_id from public.categories
  union select user_id from public.accounts
  union select user_id from public.transactions
  union select user_id from public.audit_log
  union select user_id from public.category_groups
  union select user_id from public.snapshots
  union select user_id from public.cards
  union select user_id from public.budgets
  union select user_id from public.assignments
  union select user_id from public.recurring
  union select user_id from public.payees
) o;

-- ========================== POST-APPLY CHECKS ===============================
-- 1. One 'default' plan per data-owning user (equals the pre-apply user count).
select count(*) as default_plans from public.plans where id = 'default';

-- 2. Zero unstamped rows anywhere (every row must be 0).
select 'category_groups' as tbl, count(*) as unstamped from public.category_groups where plan_id is null
union all select 'categories',   count(*) from public.categories   where plan_id is null
union all select 'accounts',     count(*) from public.accounts     where plan_id is null
union all select 'snapshots',    count(*) from public.snapshots    where plan_id is null
union all select 'cards',        count(*) from public.cards        where plan_id is null
union all select 'transactions', count(*) from public.transactions where plan_id is null
union all select 'budgets',      count(*) from public.budgets      where plan_id is null
union all select 'assignments',  count(*) from public.assignments  where plan_id is null
union all select 'recurring',    count(*) from public.recurring    where plan_id is null
union all select 'payees',       count(*) from public.payees       where plan_id is null
union all select 'audit_log',    count(*) from public.audit_log    where plan_id is null
order by tbl;

-- 3. Row counts unchanged (compare with the pre-apply snapshot).
select 'category_groups' as tbl, count(*) from public.category_groups
union all select 'categories',    count(*) from public.categories
union all select 'accounts',      count(*) from public.accounts
union all select 'snapshots',     count(*) from public.snapshots
union all select 'transactions',  count(*) from public.transactions
union all select 'cards',         count(*) from public.cards
union all select 'budgets',       count(*) from public.budgets
union all select 'assignments',   count(*) from public.assignments
union all select 'recurring',     count(*) from public.recurring
union all select 'payees',        count(*) from public.payees
union all select 'audit_log',     count(*) from public.audit_log
order by tbl;

-- 4. Ownership integrity: every row's (user_id, plan_id) resolves to a plan
--    of the same user (0 = pass). Spot-checks the heaviest tables.
select count(*) as orphan_transactions from public.transactions t
  left join public.plans p on t.user_id = p.user_id and t.plan_id = p.id
  where p.id is null;
select count(*) as orphan_categories from public.categories c
  left join public.plans p on c.user_id = p.user_id and c.plan_id = p.id
  where p.id is null;

-- 5. Constraint shape: the recreated uniques exist, the old ones are gone.
select indexname from pg_indexes where schemaname = 'public'
  and indexname in ('categories_user_type_normname_key','categories_user_plan_type_normname_key');
select conname from pg_constraint
  where conname in ('budgets_user_id_category_id_key','budgets_user_plan_category_key');

-- 6. Idempotency probe: re-running 0017 must change nothing. After a re-run,
--    repeat checks 1-3 and expect identical output.
