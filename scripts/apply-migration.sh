#!/bin/bash

# Helper script to regenerate types after a migration has been applied.
# Usage: ./scripts/apply-migration.sh path/to/migration.sql [--yes]
#
# This script does NOT apply the migration. Apply it first with
# `npm run db:apply -- <file>` (docs/operations/APPLY_PATH.md) or the project
# Supabase MCP, then run this with --yes to confirm that has happened and
# regenerate src/lib/types/database.ts. Without --yes it only prints the
# instructions and exits, so it never blocks waiting on a keypress.

set -e

YES=0
MIGRATION_FILE=""
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      sed -n '2,/^set -e/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --yes|-y) YES=1 ;;
    -*) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
    *) MIGRATION_FILE="$arg" ;;
  esac
done

if [ -z "$MIGRATION_FILE" ]; then
  echo "❌ Error: Migration file path required"
  echo "Usage: ./scripts/apply-migration.sh path/to/migration.sql [--yes]"
  exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Check if SUPABASE_PROJECT_ID is set
if [ -z "$SUPABASE_PROJECT_ID" ]; then
  # Try to get it from .env.local
  if [ -f .env.local ]; then
    SUPABASE_PROJECT_ID=$(grep -E "^SUPABASE_PROJECT_ID=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
    export SUPABASE_PROJECT_ID
    
    # If still not set, try to extract from NEXT_PUBLIC_SUPABASE_URL
    if [ -z "$SUPABASE_PROJECT_ID" ]; then
      SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
      if [ -n "$SUPABASE_URL" ]; then
        SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -n 's/.*https:\/\/\([^.]*\)\.supabase\.co.*/\1/p')
      fi
    fi
  fi
  
  if [ -z "$SUPABASE_PROJECT_ID" ]; then
    echo "❌ Error: SUPABASE_PROJECT_ID not found"
    echo "Set it in .env.local or export it before running this script"
    exit 1
  fi
fi

echo "📦 Applying migration: $MIGRATION_FILE"
echo "🔑 Using project ID: ${SUPABASE_PROJECT_ID:0:10}..."

# Apply migration using Supabase MCP or psql
# Note: This assumes you have the Supabase CLI or MCP tools available
# For direct database connection:
# PGPASSWORD='your-password' psql "postgresql://postgres:password@db.$SUPABASE_PROJECT_ID.supabase.co:5432/postgres" -f "$MIGRATION_FILE"

# For now, we'll just apply via Supabase dashboard or MCP tools
echo "⚠️  Note: this script does not apply the migration. Apply it via:"
echo "   1. npm run db:apply -- $MIGRATION_FILE, OR"
echo "   2. Supabase MCP tools, OR"
echo "   3. Direct psql connection"
echo ""
if [ "$YES" -ne 1 ]; then
  echo "Once it is applied, re-run with --yes to regenerate types:"
  echo "   ./scripts/apply-migration.sh $MIGRATION_FILE --yes"
  exit 0
fi

echo "🔄 Regenerating database types..."
export SUPABASE_PROJECT_ID
npm run db:types

echo "✅ Migration applied and types regenerated!"
