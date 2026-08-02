-- Raqam schema + Row Level Security.
--
-- Contracts preserved from the client (src/lib/calc.js string-compares everything):
--   money      -> bigint (integer PKR, never floats)
--   months     -> text 'YYYY-MM'          (lexicographic order == chronological)
--   datetimes  -> text 'YYYY-MM-DDTHH:mm' (naive local wall-clock, Asia/Karachi assumed;
--                 timestamptz would UTC-shift near-midnight rows into the wrong month)
--   ids        -> text, composite PK (user_id, id) so legacy ids ('a1', 'groceries')
--                 import verbatim without cross-user collisions
-- Every per-user table: user_id defaults to auth.uid() (client never sends it) and
-- cascades on user deletion. created_at is server audit metadata, not app data.

-- ============================================================
-- Catalogues
-- ============================================================

-- Single shared table: user_id NULL = global curated row; non-null = that user's
-- "Custom" institution. The CHECK ties the two notions together.
create table public.institutions (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('Conventional','Islamic','Foreign','Microfinance','Digital','Custom')),
  created_at timestamptz not null default now(),
  check ((user_id is null) = (kind <> 'Custom'))
);

create table public.card_products (
  id      text primary key,
  inst_id text not null references public.institutions(id),
  name    text not null,
  type    text not null check (type in ('debit','credit','prepaid','virtual')),
  network text not null,
  tier    text not null default ''
);

-- ============================================================
-- Per-user tables
-- ============================================================

create table public.categories (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null default gen_random_uuid()::text,
  name       text not null,
  type       text not null check (type in ('expense','income')),
  color      text not null default '#0F766E',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.accounts (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null default gen_random_uuid()::text,
  inst_id    text not null references public.institutions(id),
  nickname   text not null,
  type       text not null check (type in ('Current','Savings','Salary','Foreign currency','Mobile wallet')),
  islamic    boolean not null default false,
  currency   text not null default 'PKR',
  last4      text not null default '' check (last4 = '' or last4 ~ '^[0-9]{4}$'),
  status     text not null default 'active' check (status in ('active','archived')),
  notes      text not null default '',
  opened_on  text not null check (opened_on ~ '^\d{4}-\d{2}-\d{2}$'),  -- app's createdAt
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Monthly opening balances. Identity IS (user, account, month) — the client has no
-- surrogate id for these. history holds correction provenance:
-- [{"amount": int, "confirmedAt": "YYYY-MM-DDTHH:mm"}, ...]
create table public.snapshots (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id   text not null,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  amount       bigint not null,
  status       text not null default 'pending' check (status in ('pending','confirmed')),
  confirmed_at text check (confirmed_at is null or confirmed_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  corrected    boolean not null default false,
  history      jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  primary key (user_id, account_id, month),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

-- opening_outstanding: {"YYYY-MM": int} per-month credit opening liability —
-- kept jsonb because the client reads it whole ("limit" is reserved; hence credit_limit).
create table public.cards (
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                  text not null default gen_random_uuid()::text,
  inst_id             text not null references public.institutions(id),
  product_id          text references public.card_products(id),
  nickname            text not null,
  type                text not null check (type in ('debit','credit','prepaid','virtual')),
  network             text not null,
  tier                text not null default '',
  last4               text not null default '',
  linked_account_id   text,
  credit_limit        bigint,
  opening_outstanding jsonb not null default '{}'::jsonb,
  statement_day       int check (statement_day between 1 and 31),
  due_date            text check (due_date is null or due_date = '' or due_date ~ '^\d{4}-\d{2}-\d{2}$'),
  annual_fee_month    text,
  status              text not null default 'active' check (status in ('active','archived')),
  theme               text not null default 'teal',
  created_at          timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, linked_account_id) references public.accounts (user_id, id)
    on delete set null (linked_account_id)
);

create table public.transactions (
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id              text not null default gen_random_uuid()::text,
  date            text not null check (date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  type            text not null check (type in ('expense','income','transfer','refund','adjustment')),
  amount          bigint not null,
  account_id      text,
  to_account_id   text,
  card_id         text,
  to_card_id      text,
  is_card_payment boolean not null default false,
  fee             bigint check (fee is null or fee >= 0),
  category_id     text,
  merchant        text not null default '',
  notes           text not null default '',
  status          text not null default 'cleared' check (status in ('cleared','pending')),
  created_at      timestamptz not null default now(),
  primary key (user_id, id),
  check (type = 'adjustment' or amount >= 0),  -- only adjustments are signed
  foreign key (user_id, account_id)    references public.accounts   (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts   (user_id, id),
  foreign key (user_id, card_id)       references public.cards      (user_id, id),
  foreign key (user_id, to_card_id)    references public.cards      (user_id, id),
  foreign key (user_id, category_id)   references public.categories (user_id, id)
);

create table public.budgets (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null default gen_random_uuid()::text,
  category_id text,                              -- NULL = overall monthly budget
  amount      bigint not null check (amount >= 0),
  label       text,
  created_at  timestamptz not null default now(),
  primary key (user_id, id),
  unique nulls not distinct (user_id, category_id),  -- one per category + one overall
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);

create table public.recurring (
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id              text not null default gen_random_uuid()::text,
  name            text not null,
  type            text not null check (type in ('expense','income')),
  amount          bigint not null,
  estimated       boolean not null default false,
  freq            text not null default '',
  next_date       text check (next_date is null or next_date ~ '^\d{4}-\d{2}-\d{2}$'),
  account_id      text,
  card_id         text,
  category_id     text,
  behaviour       text not null default 'reminder',
  status          text not null default 'active',
  done_this_month boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, account_id)  references public.accounts   (user_id, id),
  foreign key (user_id, card_id)     references public.cards      (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id)
);

-- ============================================================
-- Row Level Security — default-deny; anon gets nothing anywhere.
-- (select auth.uid()) is the documented per-statement caching form.
-- ============================================================

alter table public.institutions  enable row level security;
alter table public.card_products enable row level security;
alter table public.categories    enable row level security;
alter table public.accounts      enable row level security;
alter table public.snapshots     enable row level security;
alter table public.cards         enable row level security;
alter table public.transactions  enable row level security;
alter table public.budgets       enable row level security;
alter table public.recurring     enable row level security;

-- Catalogues
create policy "read global and own institutions" on public.institutions
  for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "add own custom institution" on public.institutions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and kind = 'Custom');
create policy "delete own custom institution" on public.institutions
  for delete to authenticated
  using ((select auth.uid()) = user_id);
-- no update policy: catalogue rows and customs are immutable from the client

create policy "read card products" on public.card_products
  for select to authenticated using (true);
-- no write policies at all on card_products

-- Per-user tables: identical own-rows block
do $$
declare t text;
begin
  foreach t in array array['categories','accounts','snapshots','cards','transactions','budgets','recurring'] loop
    execute format('create policy "own select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
