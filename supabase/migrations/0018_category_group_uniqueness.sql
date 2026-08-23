-- 0018 — category name uniqueness becomes per-GROUP, not per-plan.
--
-- 0017 made category names unique per (user_id, plan_id, type, name). But the
-- app organizes categories into groups (category_groups, added earlier), and a
-- name that repeats across groups is legitimate — e.g. a wedding plan with a
-- "Travelling" line under both a "Barat" and a "Honey Moon" group. The old
-- index rejected the second one with 23505, which wedged the sync push loop
-- (the differ re-attempts the insert on every store change).
--
-- Widen the index to include group_id. NULLS NOT DISTINCT (PG15+, same as the
-- 0017 budgets_user_plan_category_key constraint) keeps the ungrouped "Other"
-- bucket unique: two ungrouped "Travelling" are still rejected, because a null
-- group_id is treated as one bucket rather than as many distinct values.
--
-- Safe swap: the old index was STRICTER (plan-wide), so no existing row can
-- violate the new, more permissive one. Idempotent — re-running is a no-op.

drop index if exists categories_user_plan_type_normname_key;

create unique index if not exists categories_user_plan_type_group_normname_key
  on public.categories
     (user_id, plan_id, type, group_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))))
  nulls not distinct;
