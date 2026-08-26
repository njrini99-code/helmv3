#!/usr/bin/env bash
# Run every pgTAP contract without asking Supabase CLI to execute the shared
# `_helpers.sql` include as a standalone test file. CI uses the same assembly
# pattern so local and CI results stay equivalent.

set -euo pipefail

SUPABASE_CLI="${SUPABASE_CLI:-./node_modules/.bin/supabase}"
TEST_DIR="supabase/tests/rls"
HELPERS="$TEST_DIR/_helpers.sql"

if [ ! -x "$SUPABASE_CLI" ]; then
  echo "Repository Supabase CLI not found at $SUPABASE_CLI" >&2
  exit 1
fi

if [ ! -f "$HELPERS" ]; then
  echo "Shared pgTAP helpers not found at $HELPERS" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

for test_file in "$TEST_DIR"/*.sql; do
  [ "$(basename "$test_file")" = "_helpers.sql" ] && continue

  assembled_test="$tmp_dir/$(basename "$test_file")"
  {
    cat "$HELPERS"
    grep -Ev '^\\i(r)? .*_helpers\.sql$' "$test_file"
  } > "$assembled_test"

  "$SUPABASE_CLI" test db --local "$assembled_test"
done
