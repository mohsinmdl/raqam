-- Harness seed — runs after migrations on every `supabase db reset` (local only).
-- SYNTHETIC data only: safe to commit, contains no real user data and no secrets.
-- Gives a deterministic harness login + a non-empty app so UI probes render real state.
--
-- Fixed identity (used by the out-of-tree harness auto-login):
--   uuid  00000000-0000-0000-0000-000000000001
--   email harness@raqam.test   password harness-password
--
-- Every per-user row sets user_id explicitly: the seed runs as a superuser where
-- auth.uid() is NULL, so the column default cannot supply it. Idempotent via
-- `on conflict do nothing` so it is safe to re-run without a full reset.

begin;

-- ── Auth user (password login) ─────────────────────────────────────────────
-- Column set verified against the running local GoTrue (see plan's execution
-- checks). crypt()/gen_salt() come from pgcrypto (pre-installed on Supabase).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'harness@raqam.test',
  crypt('harness-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false
) on conflict (id) do nothing;

-- Email identity — GoTrue needs this row for password sign-in.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"harness@raqam.test","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now(), now()
) on conflict do nothing;

-- ── App data (user_id = the fixed harness uuid) ────────────────────────────
-- Categories (ids mirror src/store/seed.js CATEGORIES; keep in sync).
insert into public.categories (user_id, id, name, type, color) values
  ('00000000-0000-0000-0000-000000000001','groceries','Groceries','expense','#0F766E'),
  ('00000000-0000-0000-0000-000000000001','dining','Dining out','expense','#B7791F'),
  ('00000000-0000-0000-0000-000000000001','transport','Transport','expense','#2563EB'),
  ('00000000-0000-0000-0000-000000000001','utilities','Utilities','expense','#7C3AED'),
  ('00000000-0000-0000-0000-000000000001','salary','Salary','income','#15803D')
on conflict do nothing;

-- Accounts (inst_id → global catalogue from migration 0002; no `islamic` col — dropped in 0008).
insert into public.accounts (user_id, id, inst_id, nickname, type, opened_on) values
  ('00000000-0000-0000-0000-000000000001','a1','hbl','HBL Current','Current','2024-01-05'),
  ('00000000-0000-0000-0000-000000000001','a2','meezan','Meezan Savings','Savings','2024-03-10')
on conflict do nothing;

-- Opening snapshots (identity = user+account+month; amounts are integer paisa).
insert into public.snapshots (user_id, account_id, month, amount, status, confirmed_at) values
  ('00000000-0000-0000-0000-000000000001','a1','2025-08', 25000000, 'confirmed','2025-08-01T09:00'),
  ('00000000-0000-0000-0000-000000000001','a2','2025-08',  8000000, 'confirmed','2025-08-01T09:00')
on conflict do nothing;

-- ~24 expense transactions (deterministic; amount is positive integer paisa).
insert into public.transactions (user_id, id, date, type, amount, account_id, category_id, merchant)
select
  '00000000-0000-0000-0000-000000000001',
  'tx'||g,
  to_char(date '2025-08-01' + (g % 24), 'YYYY-MM-DD')||'T12:00',
  'expense',
  (500 + (g * 137) % 9000) * 100,
  case when g % 2 = 0 then 'a1' else 'a2' end,
  (array['groceries','dining','transport','utilities'])[1 + g % 4],
  (array['Imtiaz','Foodpanda','Careem','K-Electric'])[1 + g % 4]
from generate_series(1, 24) g
on conflict do nothing;

-- One income row so income/budget screens are non-empty.
insert into public.transactions (user_id, id, date, type, amount, account_id, category_id, merchant)
values ('00000000-0000-0000-0000-000000000001','tx-income','2025-08-01T09:00','income', 30000000, 'a1', 'salary', 'Employer')
on conflict do nothing;

-- Budgets (one per category + one overall; unique nulls not distinct on category_id).
insert into public.budgets (user_id, id, category_id, amount) values
  ('00000000-0000-0000-0000-000000000001','b-groceries','groceries', 4000000),
  ('00000000-0000-0000-0000-000000000001','b-dining','dining',    2000000),
  ('00000000-0000-0000-0000-000000000001','b-overall', null,      15000000)
on conflict do nothing;

-- One payee overlay row (auto_category_id carries no FK — name-keyed).
insert into public.payees (user_id, id, name, auto_categorize, auto_category_id) values
  ('00000000-0000-0000-0000-000000000001','py-imtiaz','Imtiaz', true, 'groceries')
on conflict do nothing;

commit;
