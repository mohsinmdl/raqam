-- Editing, category CRUD, and audit trail (design revision v2).
--
-- 1. Edit stamps + new fields. App-datetime stamps use the same naive-local text
--    contract as every other date column. All additions are nullable/defaulted so
--    existing rows are untouched.

alter table public.transactions
  add column edited_at         text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column edit_count        int not null default 0,
  add column adjustment_reason text;

alter table public.accounts
  add column edited_at   text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column edit_count  int not null default 0,
  add column archived_at text;

alter table public.cards
  add column edited_at  text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column edit_count int not null default 0,
  add column closed_at  text;

alter table public.categories
  add column edited_at   text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column edit_count  int not null default 0,
  add column archived_at text,
  add column icon        text not null default 'square' check (icon in ('square','circle','diamond','ring','bar','triangle')),
  add column sort_order  int not null default 99,
  add column is_system   boolean not null default false,
  add column status      text not null default 'active' check (status in ('active','archived')),
  add column description text not null default '';

-- 2. Enum widening / narrowing. Constraint names are the deterministic
--    auto-generated ones from 0001 (<table>_<column>_check; the table-level
--    signed-amount check got <table>_check). Widened sets cannot fail on existing
--    rows; the narrowed cards check is preceded by a defensive UPDATE (the UI
--    never wrote 'archived' for cards, but belt and braces).

alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('expense','income','transfer','refund','adjustment','cardAdjustment'));

alter table public.transactions drop constraint transactions_check;
alter table public.transactions add constraint transactions_amount_signed_check
  check (type in ('adjustment','cardAdjustment') or amount >= 0);

alter table public.accounts drop constraint accounts_status_check;
alter table public.accounts add constraint accounts_status_check
  check (status in ('active','archived','closed'));

update public.cards set status = 'closed' where status = 'archived';
alter table public.cards drop constraint cards_status_check;
alter table public.cards add constraint cards_status_check
  check (status in ('active','closed'));

-- 3. Case-insensitive category-name uniqueness per user and type, matching the
--    client's normalizeName (trim, collapse whitespace, lowercase).
create unique index categories_user_type_normname_key
  on public.categories (user_id, type, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

-- 4. Backfill the 17 canonical seed categories (identical ids for every user).
--    Values mirror src/store/seed.js — keep the two in sync.
update public.categories c set is_system = true, icon = v.icon, sort_order = v.so
from (values
  ('groceries','square',1),('dining','circle',2),('transport','triangle',3),('fuel','bar',4),
  ('utilities','diamond',5),('mobile','ring',6),('rent','square',7),('healthcare','circle',8),
  ('education','triangle',9),('shopping','bar',10),('entertainment','diamond',11),('family','ring',12),
  ('charity','square',13),('fees','circle',14),('salary','square',1),('freelance','circle',2),('otherinc','diamond',3)
) as v(id, icon, so)
where c.id = v.id;

-- 5. Audit log — append-only from the client (insert + select-own policies ONLY).
--    Deliberately no FKs to the entity tables: audit must survive entity deletion.
create table public.audit_log (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null,
  entity_type text not null check (entity_type in ('transaction','account','card','category')),
  entity_id   text not null,
  action      text not null check (action in ('create','update','delete','archive','restore','adjust-balance','adjust-outstanding','reassign-delete')),
  summary     text not null default '',
  before      jsonb,
  after       jsonb,
  at          text not null check (at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index audit_log_entity_idx on public.audit_log (user_id, entity_type, entity_id, created_at);

alter table public.audit_log enable row level security;
create policy "own insert" on public.audit_log
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own select" on public.audit_log
  for select to authenticated using ((select auth.uid()) = user_id);
-- no update/delete policies: default-deny keeps the log append-only for clients
