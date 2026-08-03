-- Design iteration 002: Budgets screen.
-- A budget is one standing monthly amount; rollover is an opt-in flag (the
-- carried amount is DERIVED from transaction history, never stored per month).

alter table public.budgets
  add column rollover   boolean not null default false,
  add column edited_at  text check (edited_at is null or edited_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  add column edit_count int not null default 0;

-- Budgets are now first-class audited entities.
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget'));
