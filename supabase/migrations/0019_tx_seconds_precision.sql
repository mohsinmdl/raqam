-- 0019 — allow seconds precision on transaction timestamps.
--
-- Ordering on the transactions page IS the `date` string, descending: a new
-- entry is stamped with the current clock and drag-to-reorder rewrites the
-- dropped row's timestamp to a moment between its neighbors. Minute precision
-- (the 0001 CHECK) leaves no room to interpolate between two rows entered in the
-- same minute, and can't keep same-minute entries strictly ordered on top. This
-- widens the format to allow an OPTIONAL ':SS'.
--
-- Backward compatible: every existing 'YYYY-MM-DDTHH:mm' value still matches, so
-- no row needs rewriting. A bare-minute string is also a lexical prefix of its
-- seconds form, so mixed-precision rows keep sorting correctly.
--
-- The 0001 constraint was an unnamed inline column CHECK, which Postgres named
-- `transactions_date_check`. Drop it and re-add a named, relaxed one.
-- Idempotent — re-running is a no-op.

alter table public.transactions
  drop constraint if exists transactions_date_check;

alter table public.transactions
  add constraint transactions_date_check
  check (date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$');
