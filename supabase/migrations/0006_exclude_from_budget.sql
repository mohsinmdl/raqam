-- Budget-excluded categories (recoverable spending MVP).
-- Advances paid on behalf of others keep full cash impact but zero budget impact.
-- Additive and non-destructive: existing rows default to false (= current behaviour).
alter table public.categories
  add column if not exists exclude_from_budget boolean not null default false;
