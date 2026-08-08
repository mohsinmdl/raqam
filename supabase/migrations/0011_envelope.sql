-- Envelope budget phase 1: category groups + per-month assignments.

create table public.category_groups (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  sort_order int not null default 99,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.category_groups enable row level security;

alter table public.categories add column if not exists group_id text;
alter table public.categories
  add constraint categories_group_fk
  foreign key (user_id, group_id) references public.category_groups (user_id, id) on delete set null (group_id);

create table public.assignments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  category_id text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, category_id, month),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);
alter table public.assignments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['category_groups', 'assignments'] loop
    execute format('create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update using (auth.uid() = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.audit_log drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring','app','assignment','categoryGroup'));
