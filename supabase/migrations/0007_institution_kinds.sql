-- Editable bank institutions: a user's own bank can now be classified
-- (Conventional / Islamic / Foreign / Microfinance / Digital) instead of being
-- stuck under 'Custom', and can be renamed. The global catalogue stays read-only.
--
-- 0001 tied ownership to the kind: user_id was non-null IFF kind = 'Custom'.
-- Ownership is now expressed by user_id alone; kind is free metadata on own rows.

-- 1. Table CHECK (deterministic auto-name for the table-level check in 0001).
alter table public.institutions drop constraint institutions_check;
alter table public.institutions add constraint institutions_check
  check (user_id is not null or kind <> 'Custom');

-- 2. Inserts: own rows, any kind (was: own rows, kind = 'Custom' only).
drop policy "add own custom institution" on public.institutions;
create policy "add own institution" on public.institutions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- 3. Updates: 0001 had no update policy at all, so renaming or reclassifying an
--    own institution was impossible from the client. Catalogue rows (user_id
--    null) remain unreachable by this policy.
create policy "update own institution" on public.institutions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
