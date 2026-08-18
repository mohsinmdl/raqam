#!/usr/bin/env bash
# backup-db.sh — snapshot Raqam's Supabase Postgres to ~/backups/raqam/ and verify it.
#
# Usage:
#   RAQAM_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' scripts/backup-db.sh
# or store the URL once (outside the repo, never commit it):
#   mkdir -p ~/.config/raqam && chmod 700 ~/.config/raqam
#   echo 'postgresql://...' > ~/.config/raqam/db-url && chmod 600 ~/.config/raqam/db-url
#
# Produces three date-stamped files per run:
#   raqam-public-<stamp>.dump  app data, compressed custom format (pg_restore)
#   raqam-public-<stamp>.sql   app data, readable SQL
#   raqam-auth-<stamp>.sql     auth schema data (user accounts)
# Exits non-zero unless dumped row counts match the live database exactly.

set -euo pipefail

BACKUP_DIR="${RAQAM_BACKUP_DIR:-$HOME/backups/raqam}"
URL_FILE="$HOME/.config/raqam/db-url"
STAMP="$(date +%Y-%m-%d-%H%M)"

# Homebrew's keg-only libpq isn't on PATH by default; prefer it because the
# system/PATH pg_dump may be older than the Supabase server (needs >= server major).
PG_BIN="/opt/homebrew/opt/libpq/bin"
[ -x "$PG_BIN/pg_dump" ] || PG_BIN="$(dirname "$(command -v pg_dump || true)")"
[ -n "$PG_BIN" ] && [ -x "$PG_BIN/pg_dump" ] || {
  echo "error: pg_dump not found — install with: brew install libpq" >&2; exit 1;
}

DB_URL="${RAQAM_DB_URL:-}"
if [ -z "$DB_URL" ] && [ -f "$URL_FILE" ]; then
  DB_URL="$(cat "$URL_FILE")"
fi
[ -n "$DB_URL" ] || {
  echo "error: no connection string. Set RAQAM_DB_URL or write it to $URL_FILE (chmod 600)." >&2
  echo "Get it from: Supabase dashboard -> Connect -> Session pooler URI." >&2
  exit 1
}

# Retention: decides which old backups to delete after a successful run.
# Runs last, only after verification passed, so it can never trade a good
# backup for a bad one. Currently a no-op: every snapshot is kept forever.
# TODO(mohsin): pick a retention policy and implement it here. Options:
#   - keep the newest N runs (ls -t | tail +N... — simple, size-bounded)
#   - keep everything younger than N days (find -mtime +N — time-bounded)
#   - tiered: all from last week + one per older month (safest, more code)
# Note: one "run" is three files sharing a $STAMP — delete by stamp, not by file.
prune_old_backups() {
  :
}

mkdir -p "$BACKUP_DIR"
PUBLIC_DUMP="$BACKUP_DIR/raqam-public-$STAMP.dump"
PUBLIC_SQL="$BACKUP_DIR/raqam-public-$STAMP.sql"
AUTH_SQL="$BACKUP_DIR/raqam-auth-$STAMP.sql"

echo "Dumping public schema (custom format) ..."
"$PG_BIN/pg_dump" "$DB_URL" -n public -Fc --no-owner --no-privileges -f "$PUBLIC_DUMP"
echo "Dumping public schema (plain SQL) ..."
"$PG_BIN/pg_dump" "$DB_URL" -n public --no-owner --no-privileges -f "$PUBLIC_SQL"
echo "Dumping auth schema data (user accounts) ..."
"$PG_BIN/pg_dump" "$DB_URL" -n auth --data-only -f "$AUTH_SQL"

echo "Verifying ..."
# Live row counts, as "table: n" lines. n_live_tup is an estimate but exact
# enough here: autovacuum keeps it current at this database's write volume.
LIVE_COUNTS="$("$PG_BIN/psql" "$DB_URL" -tAc \
  "select relname || ': ' || n_live_tup from pg_stat_user_tables where schemaname='public' order by relname;")"

# Rows actually present in the SQL dump: count lines inside each COPY block.
DUMP_COUNTS="$(awk '
  /^COPY public\./ { table=$2; sub(/^public\./, "", table); count=0; next }
  /^\\\.$/         { if (table != "") { print table ": " count; table="" }; next }
  table != ""      { count++ }
' "$PUBLIC_SQL" | sort)"

if [ "$LIVE_COUNTS" != "$DUMP_COUNTS" ]; then
  echo "error: dump row counts do not match the live database:" >&2
  diff <(echo "$LIVE_COUNTS") <(echo "$DUMP_COUNTS") >&2 || true
  exit 1
fi

TABLES="$("$PG_BIN/pg_restore" --list "$PUBLIC_DUMP" | grep -c 'TABLE DATA')"
AUTH_USERS="$(awk '
  /^COPY auth\.users/ { c=0; on=1; next }
  /^\\\.$/            { if (on) { print c; on=0 }; next }
  on                  { c++ }
' "$AUTH_SQL")"

echo "$LIVE_COUNTS" | sed 's/^/  /'
echo "OK: $TABLES tables verified, ${AUTH_USERS:-0} auth users, files in $BACKUP_DIR:"
ls -lh "$PUBLIC_DUMP" "$PUBLIC_SQL" "$AUTH_SQL" | awk '{print "  " $5 "\t" $9}'

prune_old_backups
