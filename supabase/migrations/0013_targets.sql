-- Monthly category targets. Additive & nullable (mirrors 0006_exclude_from_budget.sql).
alter table public.categories add column if not exists target_amount  bigint;
alter table public.categories add column if not exists target_mode    text
  check (target_mode is null or target_mode in ('setaside','refill'));
alter table public.categories add column if not exists target_due_day smallint
  check (target_due_day is null or (target_due_day between 1 and 28));

-- Mode must be present iff amount is, so an external/manual write can't leave
-- a half-target (amount set, mode null) that the client would silently treat
-- as refill. Postgres has no `add constraint if not exists`; guard with a
-- DO block instead.
do $$ begin
  alter table public.categories add constraint categories_target_mode_requires_amount
    check ((target_amount is null) = (target_mode is null));
exception when duplicate_object then null; end $$;
