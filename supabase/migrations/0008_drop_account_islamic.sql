-- One Conventional/Islamic control: an account now takes its bank's category
-- (institutions.kind), so the per-account flag is gone from the client and this
-- column would only ever hold stale data — a bank reclassified later could not
-- update the accounts pointing at it.
--
-- NOT backward-compatible with pre-PR#6 clients, whose accounts mapper still
-- sends `islamic`: run this only with the code that ships alongside it.
alter table public.accounts drop column islamic;
