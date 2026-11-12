#!/bin/sh
# Railway pre-deploy step: apply new files in supabase/migrations to the live
# database before the new app version starts. If this fails, Railway does not
# deploy the new version. Works with any Postgres URL (Supabase or Railway).
set -eu
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "db:migrate: SUPABASE_DB_URL is not set; refusing to run." >&2
  exit 1
fi
exec npx --no-install supabase db push --remote="$SUPABASE_DB_URL" --yes --skip-vault
