-- PRE-APPLY companion to supabase/migrations/0017_plans.sql.
-- Run this file BEFORE applying the migration and KEEP THE OUTPUT.
-- (Kept separate from the post-apply checks because the SQL editor runs a
-- whole file as one batch — the post-apply queries reference public.plans,
-- which does not exist yet, and would abort everything.)
-- Run as an admin role (RLS bypass) so counts cover all users.

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

