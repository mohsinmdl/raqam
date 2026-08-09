-- Monthly category targets. Additive & nullable (mirrors 0006_exclude_from_budget.sql).
alter table public.categories add column if not exists target_amount  bigint;
alter table public.categories add column if not exists target_mode    text
  check (target_mode is null or target_mode in ('setaside','refill'));
alter table public.categories add column if not exists target_due_day smallint
  check (target_due_day is null or (target_due_day between 1 and 28));
