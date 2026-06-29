#!/usr/bin/env bash
# Detect drift between src/lib/types/database.ts and production Supabase types.
# Run from repo root. Requires `supabase` CLI and SUPABASE_PROJECT_REF env var
# (defaults to qmnssrrolpinvwjjnufo).
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-qmnssrrolpinvwjjnufo}"
TMP="$(mktemp -t helmv3-types.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

if [ "${CI:-}" = "true" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ ! -f "${HOME:-}/.supabase/access-token" ]; then
  echo "::notice::Skipping remote database type drift check: SUPABASE_ACCESS_TOKEN is not configured in CI."
  echo "Set the repository secret to make this gate compare src/lib/types/database.ts against production."
  exit 0
fi

npx --no-install supabase gen types typescript --project-id "$PROJECT_REF" > "$TMP" 2>/dev/null \
  || { echo "::error::supabase gen types failed for project $PROJECT_REF"; exit 1; }

if diff -q src/lib/types/database.ts "$TMP" >/dev/null 2>&1; then
  echo "Generated types match production."
  exit 0
fi

echo "::error::Generated types drifted from production schema (project: $PROJECT_REF)"
diff -u src/lib/types/database.ts "$TMP" | head -80
exit 1
