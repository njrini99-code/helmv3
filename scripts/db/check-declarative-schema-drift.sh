#!/usr/bin/env bash
# Declarative schema drift gate (Database Plan D2).
#
# Proves that supabase/schemas/** (the declarative source of truth) describes
# exactly the end state that supabase/migrations/** produces — the two must
# never disagree. Run against a local Supabase stack that `supabase start`
# has already built from migrations (CI's existing "Supabase lint + RLS
# tests" job does this before calling this script).
#
# How it works:
#   1. Collect migration files that carry a `-- DECLARATIVE: exempt <reason>`
#      header as their first non-blank line — these are changes that cannot
#      be expressed declaratively (data backfills, cron.schedule, grants on
#      dynamic objects) and are allowed to leave a residue schema files don't
#      describe.
#   2. Build a second local Supabase stack from a copy of supabase/migrations
#      with exempt files removed, so its schema equals "what schema files
#      should fully describe".
#   3. Run `supabase db diff -f` there: it diffs the desired end state (built
#      from supabase/schemas/**) against that stack's live db (built from the
#      non-exempt migrations). Any non-empty result is drift: either a schema
#      file is wrong, or a migration changed something outside an exemption.
#
# Exit 0 = clean. Exit 1 = drift found (diff printed). Exit 2 = setup failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

SUPABASE_BIN="${SUPABASE_BIN:-./node_modules/.bin/supabase}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "== Declarative schema drift gate =="
echo "Scratch workdir: $WORKDIR"

# --- Step 1: find exempt migrations ---------------------------------------
EXEMPT_FILE="$WORKDIR/exempt.txt"
: > "$EXEMPT_FILE"
for f in supabase/migrations/*.sql; do
  [ -e "$f" ] || continue
  first_line="$(grep -m1 -v '^[[:space:]]*$' "$f" || true)"
  case "$first_line" in
    "-- DECLARATIVE: exempt"*)
      echo "$(basename "$f")" >> "$EXEMPT_FILE"
      echo "EXEMPT: $(basename "$f") — $first_line"
      ;;
  esac
done
exempt_count=$(wc -l < "$EXEMPT_FILE" | tr -d ' ')
echo "Exempt migrations: $exempt_count"

# --- Step 2: build a filtered migrations dir + scratch project -------------
mkdir -p "$WORKDIR/supabase/migrations"
for f in supabase/migrations/*.sql; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  grep -qxF "$base" "$EXEMPT_FILE" && continue
  cp "$f" "$WORKDIR/supabase/migrations/$base"
done
# HELD.md governs deliberately-unapplied migrations (see supabase/migrations/HELD.md);
# the CLI already skips non-timestamped files, but drop it explicitly for clarity.
rm -f "$WORKDIR/supabase/migrations/HELD.md"

cp -r supabase/schemas "$WORKDIR/supabase/schemas"
[ -f supabase/roles.sql ] && cp supabase/roles.sql "$WORKDIR/supabase/roles.sql"

# Reuse the real schema_paths order out of the real config.toml, pointed at
# a scratch project so this never touches the stack CI already started.
python3 - "$REPO_ROOT/supabase/config.toml" "$WORKDIR/supabase/config.toml" <<'PYEOF'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    main = f.read()
m = re.search(r"schema_paths = \[(.*?)\]", main, re.S)
paths_block = m.group(0)
import os
config = f'''project_id = "helmv3cigate{os.getpid()}"

[api]
enabled = true
port = 58321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 58322
shadow_port = 58320
major_version = 17

[db.migrations]
enabled = true
{paths_block}

[db.seed]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = false

[storage]
enabled = true

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"

[realtime]
enabled = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
'''
with open(dst, "w") as f:
    f.write(config)
PYEOF

# --- Step 3: start the scratch stack from the filtered migrations ---------
pushd "$WORKDIR" >/dev/null
"$REPO_ROOT/$SUPABASE_BIN" start --workdir . >"$WORKDIR/start.log" 2>&1 || {
  echo "FAILED to start scratch stack from non-exempt migrations:"
  cat "$WORKDIR/start.log"
  popd >/dev/null
  exit 2
}

set +e
"$REPO_ROOT/$SUPABASE_BIN" db diff --workdir . -f ci_check >"$WORKDIR/diff.log" 2>&1
diff_exit=$?
set -e
cat "$WORKDIR/diff.log"

"$REPO_ROOT/$SUPABASE_BIN" stop --workdir . >/dev/null 2>&1 || true
popd >/dev/null

if [ "$diff_exit" -ne 0 ]; then
  echo "FAILED: schema files did not apply cleanly against the migrations baseline (see log above)."
  exit 2
fi

generated="$(find "$WORKDIR/supabase/migrations" -newer "$EXEMPT_FILE" -name '*.sql' ! -name 'HELD.md' | sort | tail -1)"
if [ -z "${generated:-}" ]; then
  echo "FAILED: no diff migration was generated (unexpected)."
  exit 2
fi

# Strip blank lines/comment-only lines to check for real content.
content="$(grep -Ev '^\s*(--.*)?$' "$generated" || true)"
if [ -n "$content" ]; then
  echo ""
  echo "DRIFT FOUND: supabase/schemas/** does not match supabase/migrations/** (non-exempt)."
  echo "Generated corrective migration:"
  echo "---"
  cat "$generated"
  echo "---"
  echo "Fix the schema files (not migrations) unless this is a genuinely undeclarable"
  echo "change — in that case mark the migration with a"
  echo "'-- DECLARATIVE: exempt <reason>' header as its first line."
  exit 1
fi

echo "OK: declarative schema files match the migrations baseline exactly (empty diff)."
exit 0
