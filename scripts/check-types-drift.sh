#!/usr/bin/env bash
# Detect drift between src/lib/types/database.ts and generated Supabase types.
# CI uses the remote project when SUPABASE_ACCESS_TOKEN is configured; otherwise
# it falls back to the local stack started by the workflow.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-qmnssrrolpinvwjjnufo}"
TMP="$(mktemp -t helmv3-types.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

if npx --no-install supabase gen types typescript --project-id "$PROJECT_REF" > "$TMP" 2>/dev/null; then
  SOURCE_LABEL="production schema (project: $PROJECT_REF)"
else
  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    echo "::error::supabase gen types failed for project $PROJECT_REF"
    exit 1
  fi
  npx --no-install supabase gen types typescript --local > "$TMP" 2>/dev/null \
    || { echo "::error::supabase gen types failed for local stack"; exit 1; }
  echo "::warning::SUPABASE_ACCESS_TOKEN is not configured; comparing against local Supabase stack types."
  SOURCE_LABEL="local schema"
fi

if diff -q src/lib/types/database.ts "$TMP" >/dev/null 2>&1; then
  echo "Generated types match $SOURCE_LABEL."
  exit 0
fi

echo "::error::Generated types drifted from $SOURCE_LABEL"
diff -u src/lib/types/database.ts "$TMP" | sed -n '1,80p'
exit 1
