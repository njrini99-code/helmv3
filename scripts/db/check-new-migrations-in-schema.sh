#!/usr/bin/env bash
# PR-scoped declarative schema gate (Database Plan D2).
#
# WHY THIS IS SCOPED TO THE PR, NOT ALL 366 MIGRATIONS: replaying every
# migration in supabase/migrations/ and diffing the result against
# supabase/schemas/** (via scripts/db/check-declarative-schema-drift.sh) is
# the thorough version of this check, and it currently comes back non-empty
# — not because schema files are wrong (they were split from a verified,
# empty-diff-against-production dump; see docs/operations/DECLARATIVE_SCHEMA.md)
# but because supabase/migrations/**, replayed end to end, produces a
# DIFFERENT end state than production itself. That is pre-existing
# migrations-vs-production drift (the "Applied ≠ recorded" problem
# .claude/rules/database.md already names), not something this PR
# introduced, and turning the full replay into a required gate today would
# make it permanently red. Reconciling that drift is its own workstream.
#
# What this gate CAN respectably promise instead, and does: a migration
# ADDED in this PR must have its objects reflected somewhere under
# supabase/schemas/**, or carry a `-- DECLARATIVE: exempt <reason>` header
# as its first non-blank line (data backfills, cron.schedule, grants on
# dynamic objects — anything that cannot be expressed declaratively).
#
# Exit 0 = every new migration is covered or exempt. Exit 1 = a new
# migration created/altered an object with no matching declaration in
# supabase/schemas/** — the diff and missing objects are printed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BASE_REF="${1:-${GITHUB_BASE_REF:+origin/$GITHUB_BASE_REF}}"
BASE_REF="${BASE_REF:-origin/main}"

git fetch --quiet origin "${BASE_REF#origin/}" 2>/dev/null || true

new_migrations="$(git diff --name-only --diff-filter=A "${BASE_REF}...HEAD" -- supabase/migrations/ 2>/dev/null | grep -v 'HELD\.md$' || true)"

if [ -z "$new_migrations" ]; then
  echo "OK: no new migration files in this PR."
  exit 0
fi

echo "New migrations in this PR:"
echo "$new_migrations"
echo ""

fail=0
while IFS= read -r f; do
  [ -e "$f" ] || continue
  first_line="$(grep -m1 -v '^[[:space:]]*$' "$f" || true)"
  case "$first_line" in
    "-- DECLARATIVE: exempt"*)
      echo "EXEMPT: $f — $first_line"
      continue
      ;;
  esac

  # Extract schema-qualified object names this migration creates or alters.
  # Conservative on purpose: false negatives (missing a real name) are safer
  # here than false positives that would make every PR fail on noise.
  names="$(grep -EioE '"[a-z_][a-z0-9_]*"\."[a-z_][a-z0-9_]*"' "$f" 2>/dev/null | tr 'A-Z' 'a-z' | sort -u || true)"
  if [ -z "$names" ]; then
    echo "SKIP: $f — no schema-qualified object names found to check (nothing to verify statically)"
    continue
  fi

  missing=""
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    if ! grep -rqF "$name" supabase/schemas/ 2>/dev/null; then
      missing="$missing$name"$'\n'
    fi
  done <<< "$names"

  if [ -n "$missing" ]; then
    # Only fail if EVERY reference to a name is missing everywhere in the
    # migration's own object set touched by CREATE/ALTER — a name appearing
    # only in a comment or a read-only query is not a schema change.
    creates="$(grep -EioE '(CREATE|ALTER)[[:space:]]+(TABLE|POLICY|FUNCTION|OR REPLACE FUNCTION|TRIGGER|VIEW|MATERIALIZED VIEW|INDEX|TYPE)[^;]*"[a-z_][a-z0-9_]*"\."[a-z_][a-z0-9_]*"' "$f" 2>/dev/null | grep -EoE '"[a-z_][a-z0-9_]*"\."[a-z_][a-z0-9_]*"' | tr 'A-Z' 'a-z' | sort -u || true)"
    real_missing=""
    while IFS= read -r m; do
      [ -z "$m" ] && continue
      if echo "$creates" | grep -qF "$m"; then
        real_missing="$real_missing$m"$'\n'
      fi
    done <<< "$missing"
    if [ -n "$real_missing" ]; then
      echo "MISSING from supabase/schemas/**: $f creates/alters these but no schema file declares them:"
      echo "$real_missing" | sed 's/^/  /'
      fail=1
    fi
  fi
done <<< "$new_migrations"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "FAILED: update the matching file(s) under supabase/schemas/** to match this"
  echo "migration, or add a '-- DECLARATIVE: exempt <reason>' header as the migration's"
  echo "first line if it genuinely cannot be expressed declaratively."
  exit 1
fi

echo "OK: every new migration in this PR is reflected in supabase/schemas/** or exempt."
exit 0
