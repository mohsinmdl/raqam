#!/usr/bin/env bash
# Dump every Raqam table to JSON for offline processing (e.g. scripts/ynab-load.mjs).
#
# Uses the Supabase service-role key, which BYPASSES RLS and therefore returns
# every user's rows — consumers must partition by user_id before doing anything
# with the output.
#
#   RAQAM_KEY=./key OUT=/tmp/raqam ./scripts/raqam-dump.sh
set -euo pipefail

KEY_FILE=${RAQAM_KEY:-./key}
ENV_FILE=${RAQAM_ENV:-./.env.local}
OUT=${OUT:-./.raqam-dump}

SR=$(tr -d '\n\r ' < "$KEY_FILE")
URL=$(grep VITE_SUPABASE_URL "$ENV_FILE" | cut -d= -f2 | tr -d '\r')
mkdir -p "$OUT"

for t in institutions card_products categories accounts cards snapshots transactions budgets recurring audit_log; do
  code=$(curl -sS -o "$OUT/$t.json" -w '%{http_code}' \
    -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Prefer: count=exact" \
    -D "$OUT/$t.hdr" "$URL/rest/v1/$t?select=*&limit=50000")
  range=$(grep -i '^content-range:' "$OUT/$t.hdr" | tr -d '\r' | awk '{print $2}')
  got=${range%%/*}; total=${range##*/}
  # A short read means PostgREST truncated the result and pagination is needed —
  # silently importing a partial table would look like a complete one.
  printf '%-14s http=%s %s\n' "$t" "$code" "$range"
  case "$range" in
    */"$total") : ;;
  esac
done
echo "wrote $OUT"
