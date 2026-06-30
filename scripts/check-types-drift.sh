#!/usr/bin/env bash
# Detect drift between src/lib/types/database.ts and generated Supabase types.
# CI uses the remote project when SUPABASE_ACCESS_TOKEN is configured; otherwise
# it falls back to the local stack started by the workflow.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-qmnssrrolpinvwjjnufo}"
TMP="$(mktemp -t helmv3-types.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  npx --no-install supabase gen types typescript --project-id "$PROJECT_REF" > "$TMP" 2>/dev/null \
    || { echo "::error::supabase gen types failed for project $PROJECT_REF"; exit 1; }
  SOURCE_LABEL="production schema (project: $PROJECT_REF)"
else
  npx --no-install supabase gen types typescript --local > "$TMP" 2>/dev/null \
    || { echo "::error::supabase gen types failed for local stack"; exit 1; }
  SOURCE_LABEL="local Supabase schema"
fi

if diff -q src/lib/types/database.ts "$TMP" >/dev/null 2>&1; then
  echo "Generated types match $SOURCE_LABEL."
  exit 0
fi

echo "::error::Generated types drifted from $SOURCE_LABEL"
diff -u src/lib/types/database.ts "$TMP" | head -80
exit 1
