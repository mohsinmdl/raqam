-- POST-APPLY companion to supabase/migrations/0018_category_group_uniqueness.sql.
-- Run this file AFTER applying the migration; compare with the pre-apply output.
-- Then re-apply 0018 (idempotency) and run this file again — output must be
-- identical. Run as an admin role (RLS bypass).

-- 1. The old index is gone, the new one exists (exactly these two rows: old=0,
--    new=1).
select 'old_index_present' as check, count(*) as n
from pg_indexes
where schemaname = 'public' and tablename = 'categories'
  and indexname = 'categories_user_plan_type_normname_key'
union all
select 'new_index_present', count(*)
from pg_indexes
where schemaname = 'public' and tablename = 'categories'
  and indexname = 'categories_user_plan_type_group_normname_key'
order by check;

-- 2. The new index really includes group_id AND is nulls-not-distinct. Both
--    columns below must be true.
select
  i.indisunique                                             as is_unique,
  (i.indnullsnotdistinct is true)                           as nulls_not_distinct,
  pg_get_indexdef(i.indexrelid)                             as definition
from pg_index i
join pg_class c on c.oid = i.indexrelid
where c.relname = 'categories_user_plan_type_group_normname_key';

-- 3. Row count unchanged (compare with pre-apply — the swap touches no data).
select count(*) as categories from public.categories;

-- 4. Sanity: the new index still forbids a duplicate within one group.
--    Every (user, plan, type, group, name) key must be unique (0 = pass).
select count(*) as in_group_duplicates from (
  select 1
  from public.categories
  group by user_id, plan_id, type, coalesce(group_id, ''),
           lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
  having count(*) > 1
) s;
