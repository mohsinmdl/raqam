-- Legs of one split expense share a split_id (a group tag minted client-side).
-- Nullable, no FK: it references no table, and absent means "not a split".
alter table public.transactions add column split_id text;
