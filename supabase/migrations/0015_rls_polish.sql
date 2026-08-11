-- RLS polish: align the 0011 envelope-table policies with the 0001 pattern.
-- 0011 diverged in three ways: policies were not scoped `to authenticated`
-- (they also applied to anon, harmless but inconsistent), used bare
-- auth.uid() instead of the per-statement-cached (select auth.uid()) form,
-- and the update policy had no explicit `with check` (Postgres falls back to
-- `using` for the new row, so this was not exploitable — just implicit).
do $$
declare t text;
begin
  foreach t in array array['category_groups', 'assignments'] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
