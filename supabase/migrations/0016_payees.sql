-- Payees: an OVERLAY collection for payee customizations (Spec 2). A row
-- exists only once a payee has customizations; the payee LIST is derived
-- client-side from distinct transaction merchants ∪ these rows (name matched
-- case-insensitively against transactions.merchant). transfer_ref set = the
-- row customizes a synthesized transfer payee (visibility only).
--
-- auto_category_id carries NO foreign key, unlike budgets.category_id (which
-- has a composite (user_id, category_id) FK). Integrity here is owned by the
-- app-level sweep in reassignDeleteCategory/deleteCategory, which has to run
-- regardless: the payee↔transaction link is name-keyed, so a category delete
-- already needs a client pass over the overlay. A composite user-scoped FK on
-- top of that would buy no invariant the sweep doesn't already hold, while
-- costing the ordering ergonomics the differ would then have to respect
-- (payee rows pushed after categories, deletes before category deletes).
create table public.payees (
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                text not null default gen_random_uuid()::text,
  name              text not null default '',
  transfer_ref      text,
  auto_categorize   boolean not null default false,
  auto_category_id  text,
  auto_category_rta boolean not null default false,
  rename_rules      jsonb not null default '[]'::jsonb,
  hidden            boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.payees enable row level security;
create policy "own select" on public.payees for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.payees for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.payees for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.payees for delete to authenticated using ((select auth.uid()) = user_id);

-- Payee operations are audited entities now.
alter table public.audit_log drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring','app','assignment','categoryGroup','payee'));
