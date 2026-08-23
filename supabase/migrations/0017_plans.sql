-- Multi-Plan (YNAB-style budgets): the plan entity and the new scoping
-- dimension. A plan is an isolated ledger with its own display settings
-- (currency / placement / number format / date format — display-only: amounts
-- stay plain integers, no conversion). Every ledger table gains a NOT NULL
-- plan_id with a composite (user_id, plan_id) FK, so a row can never point at
-- another user's plan: the row's own user_id participates in the FK, making a
-- forged plan_id structurally unsatisfiable (RLS stays the read/write
-- boundary, unchanged). ON DELETE CASCADE makes plan deletion atomic and
-- server-side. institutions and card_products are deliberately NOT scoped:
-- banks are real-world reference data shared across plans.
--
-- Settings keys are the U1<->U3 contract (aidlc-docs/construction/db-plans/
-- functional-design/domain-entities.md): number_format in
-- (comma-dot, dot-comma, space-dot, apostrophe-dot, space-dash, space-comma,
--  comma-slash, lakh); date_format is the pattern itself; placement in
-- (before, after, none). Backfill defaults reproduce today's hardcoded
-- rendering exactly (PKR / none / comma-dot / DD/MM/YYYY).
--
-- Backfill: every user owning at least one ledger row gets plan 'default'
-- named "My Plan" and all their rows stamped onto it. The constant id makes
-- the whole file idempotent (re-run = no-op). Zero-data users get no plan;
-- the app's first-use flow creates their first one. The migrated plan's
-- placement is 'before' — today's UI always renders the 'Rs ' prefix, so
-- 'none' would visibly change every amount (US-1 zero-change guarantee).
-- 'none' remains the COLUMN default because the New Plan modal defaults to
-- "Don't show", matching YNAB.
--
-- APPLY (production): 1) take a DB backup; 2) run
-- scripts/plans-migration-verify-preapply.sql and keep the output; 3) apply
-- this file (SQL editor or `supabase db push` — runs in one transaction);
-- 4) run scripts/plans-migration-verify-postapply.sql; 5) deploy the plans-aware
-- app build in the same sitting (plan_id is NOT NULL, so an old client's
-- INSERTs fail loudly rather than misfile — do not leave the window open).
--
-- ROLLBACK (reverse order, safe: this file is purely additive):
--   alter table public.budgets drop constraint if exists budgets_user_plan_category_key;
--   alter table public.budgets add constraint budgets_user_id_category_id_key unique nulls not distinct (user_id, category_id);
--   drop index if exists categories_user_plan_type_normname_key;
--   create unique index categories_user_type_normname_key
--     on public.categories (user_id, type, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));
--   -- for each scoped table t:
--   --   drop index if exists t_user_plan_idx;
--   --   alter table public.t drop constraint if exists t_plan_fk;
--   --   alter table public.t drop column if exists plan_id;
--   drop table if exists public.plans;

-- 1. The plan entity.
create table if not exists public.plans (
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                 text not null default gen_random_uuid()::text,
  name               text not null check (btrim(name) <> '' and char_length(name) <= 80),
  currency           text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  currency_placement text not null default 'none' check (currency_placement in ('before','after','none')),
  number_format      text not null default 'comma-dot' check (number_format in
                       ('comma-dot','dot-comma','space-dot','apostrophe-dot','space-dash','space-comma','comma-slash','lakh')),
  date_format        text not null default 'DD/MM/YYYY' check (date_format in
                       ('YYYY/MM/DD','YYYY-MM-DD','DD-MM-YYYY','DD/MM/YYYY','DD.MM.YYYY','MM/DD/YYYY','YYYY.MM.DD')),
  created_at         timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.plans enable row level security;
drop policy if exists "own select" on public.plans;
drop policy if exists "own insert" on public.plans;
drop policy if exists "own update" on public.plans;
drop policy if exists "own delete" on public.plans;
create policy "own select" on public.plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.plans for delete to authenticated using ((select auth.uid()) = user_id);

-- 2. Backfill: one 'default' plan per user that owns any ledger data.
insert into public.plans (user_id, id, name, currency, currency_placement, number_format, date_format)
select distinct user_id, 'default', 'My Plan', 'PKR', 'before', 'comma-dot', 'DD/MM/YYYY'
from (
  select user_id from public.category_groups
  union select user_id from public.categories
  union select user_id from public.accounts
  union select user_id from public.snapshots
  union select user_id from public.cards
  union select user_id from public.transactions
  union select user_id from public.budgets
  union select user_id from public.assignments
  union select user_id from public.recurring
  union select user_id from public.payees
  union select user_id from public.audit_log
) owners
on conflict (user_id, id) do nothing;

-- 3. Scope the 11 ledger tables: add plan_id, stamp existing rows, enforce,
--    fence with the composite FK, and index the scoped-fetch path.
do $$
declare t text;
begin
  foreach t in array array['category_groups','categories','accounts','snapshots','cards',
                           'transactions','budgets','assignments','recurring','payees','audit_log'] loop
    execute format('alter table public.%I add column if not exists plan_id text', t);
    execute format('update public.%I set plan_id = ''default'' where plan_id is null', t);
    execute format('alter table public.%I alter column plan_id set not null', t);
    if not exists (select 1 from pg_constraint where conname = t || '_plan_fk') then
      execute format('alter table public.%I add constraint %I foreign key (user_id, plan_id)
                      references public.plans (user_id, id) on delete cascade', t, t || '_plan_fk');
    end if;
    execute format('create index if not exists %I on public.%I (user_id, plan_id)', t || '_user_plan_idx', t);
  end loop;
end $$;

-- 4. Uniques whose meaning changes under plans.
-- Category names: unique per (plan, type), no longer per user — two plans may
-- each have "Groceries".
drop index if exists categories_user_type_normname_key;
create unique index if not exists categories_user_plan_type_normname_key
  on public.categories (user_id, plan_id, type, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

-- Budgets: one budget per category plus one overall PER PLAN.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_user_plan_category_key') then
    alter table public.budgets drop constraint if exists budgets_user_id_category_id_key;
    alter table public.budgets add constraint budgets_user_plan_category_key
      unique nulls not distinct (user_id, plan_id, category_id);
  end if;
end $$;
