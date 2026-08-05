-- Design iteration 003: the Recurring module for real.
--
-- `freq` was a display string ("Monthly · 5th") that nothing could compute
-- from, and `done_this_month` a single boolean that could not represent
-- history or any non-monthly schedule. Both are replaced:
--
--   schedule    jsonb  { every, unit, days[], ends }  — see src/lib/schedule.js
--   occurrences jsonb  [{ due, outcome, amount, txId, at }]
--
-- `days` is a list so one rule can fire more than once per period, and `ends`
-- rides inside the schedule rather than taking columns of its own — it is part
-- of describing when the rule fires.
--
-- Occurrences are jsonb rather than a child table on purpose: the sync engine
-- diffs whole rows per collection, so a child table would mean a new
-- collection, composite delete keys and FK ordering, all for a small per-rule
-- append log (~12-52 entries a year). This follows snapshots.history and
-- cards.opening_outstanding. The cost is no server-side FK from an
-- occurrence's txId to transactions; the detail screen resolves it client-side
-- and says so when the transaction is gone.
--
-- NOT BACKWARD-COMPATIBLE: the columns dropped below are still written by
-- pre-iteration-003 clients, whose recurring pushes will fail until they
-- reload. Ship this migration and the client together.

alter table public.recurring
  add column if not exists schedule    jsonb   not null default '{}'::jsonb,
  add column if not exists occurrences jsonb   not null default '[]'::jsonb,
  add column if not exists auto_post   boolean not null default false,
  add column if not exists edited_at   text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column if not exists edit_count  int     not null default 0;

-- Backfill: the old `freq` strings are free text and not reliably parseable,
-- so every existing rule becomes monthly on the day its next_date already
-- falls on — which is what all of them actually were.
update public.recurring
   set schedule = jsonb_build_object(
         'every', 1,
         'unit',  'month',
         'days',  jsonb_build_array(coalesce(nullif(substring(next_date from 9 for 2), '')::int, 1)),
         'ends',  jsonb_build_object('kind', 'never'))
 where schedule = '{}'::jsonb
   and next_date is not null;

alter table public.recurring
  drop column if exists freq,
  drop column if exists behaviour,
  drop column if exists done_this_month;

-- Recurring rules are now first-class audited entities.
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring'));
