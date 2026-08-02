-- Fix: client inserts of Custom institutions omit user_id (the sync engine never
-- sends user_id anywhere; every other table defaults it to auth.uid()).
-- institutions lacked that default, so custom-institution inserts arrived with
-- user_id NULL and failed the RLS WITH CHECK. Global catalogue rows are unaffected:
-- migrations insert them with an explicit NULL, which overrides the default.
alter table public.institutions alter column user_id set default auth.uid();
