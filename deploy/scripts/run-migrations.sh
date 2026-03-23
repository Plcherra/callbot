#!/bin/bash
# Run Supabase migrations 030, 031, 032 required for appointment review and call recordings.
# Skip with SKIP_MIGRATIONS=1.
#
# Uses (in order):
#   1. supabase db push (if supabase CLI linked)
#   2. psql with DATABASE_URL / SUPABASE_DB_URL
#
# Run from project root.

set -e

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "=== Skipping migrations (SKIP_MIGRATIONS=1) ==="
  exit 0
fi

# Load env (same pattern as validate-infra-before-start.sh)
load_env() {
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    [ -f "$f" ] || continue
    while IFS= read -r line || [ -n "$line" ]; do
      [[ "$line" =~ ^#.*$ ]] && continue
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
      fi
    done < "$f" 2>/dev/null || true
  done
}
load_env

DB_URL="${DATABASE_URL:-$SUPABASE_DB_URL}"

if command -v supabase &>/dev/null && [ -f "$ROOT/supabase/config.toml" ]; then
  echo "=== Running migrations via supabase db push ==="
  if (cd "$ROOT" && supabase db push); then
    echo "Migrations applied successfully"
    exit 0
  else
    echo "WARNING: supabase db push failed. Falling back to psql if DATABASE_URL is set."
  fi
fi

if [ -n "$DB_URL" ]; then
  echo "=== Running migrations via psql (030, 031, 032) ==="
  for f in 030_appointment_review.sql 031_call_logs_recording_fields.sql 032_call_logs_outcome.sql 033_sms_message_delivery.sql; do
    path="$ROOT/supabase/migrations/$f"
    if [ -f "$path" ]; then
      echo "Applying $f..."
      psql "$DB_URL" -f "$path" -v ON_ERROR_STOP=1 || {
        echo "WARNING: $f failed (column may already exist). Continuing..."
      }
    fi
  done
  echo "Migrations complete"
  exit 0
fi

echo "WARNING: No migration method available. Set DATABASE_URL or SUPABASE_DB_URL, or run supabase db push manually."
echo "  Required migrations: 030_appointment_review.sql, 031_call_logs_recording_fields.sql, 032_call_logs_outcome.sql"
exit 0
