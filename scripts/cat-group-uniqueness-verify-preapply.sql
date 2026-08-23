-- PRE-APPLY companion to supabase/migrations/0018_category_group_uniqueness.sql.
-- Run this file BEFORE applying the migration and KEEP THE OUTPUT.
-- Run as an admin role (RLS bypass) so counts cover all users.

-- 1. The old index must still exist (proves we're pre-apply).
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'categories'
  and indexname = 'categories_user_plan_type_normname_key';

-- 2. Category row count (compare 1:1 with post-apply — the swap changes no rows).
select count(*) as categories from public.categories;

-- 3. Informational: how many (user, plan, type, name) keys currently span more
--    than one group. Under the OLD index this is always 0 (names were unique
--    plan-wide); after the app change these become creatable. Recorded so the
--    post-apply diff is interpretable, not as a gate.
select count(*) as name_keys_spanning_groups from (
  select user_id, plan_id, type,
         lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) as norm
  from public.categories
  group by 1, 2, 3, 4
  having count(distinct coalesce(group_id, '')) > 1
) s;
