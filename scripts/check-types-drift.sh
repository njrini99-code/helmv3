#!/usr/bin/env bash
# Detect drift between src/lib/types/database.ts and the production Supabase types.
#
# The committed types are generated from the production project (npm run db:types),
# so drift can only be verified authoritatively against that project, which requires
# SUPABASE_ACCESS_TOKEN. Without a token we cannot reproduce the production schema (a
# local stack emits a different header block and lags production migrations), so the
# gate is advisory in that case rather than failing on a comparison it cannot trust.
# Configure SUPABASE_ACCESS_TOKEN in CI to enforce it.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-qmnssrrolpinvwjjnufo}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "::warning::SUPABASE_ACCESS_TOKEN is not configured; skipping authoritative types-drift check against production. Set the secret to enforce this gate."
  exit 0
fi

TMP="$(mktemp -t helmv3-types.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

if ! npx --no-install supabase gen types typescript --project-id "$PROJECT_REF" > "$TMP" 2>/dev/null; then
  echo "::error::supabase gen types failed for project $PROJECT_REF"
  exit 1
fi

if diff -q src/lib/types/database.ts "$TMP" >/dev/null 2>&1; then
  echo "Generated types match production schema (project: $PROJECT_REF)."
  exit 0
fi

echo "::error::Generated types drifted from production schema (project: $PROJECT_REF)"
diff -u src/lib/types/database.ts "$TMP" | sed -n '1,80p'
exit 1
