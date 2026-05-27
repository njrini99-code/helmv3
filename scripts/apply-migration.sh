#!/bin/bash

# Helper script to apply a migration and regenerate types
# Usage: ./scripts/apply-migration.sh path/to/migration.sql

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Migration file path required"
  echo "Usage: ./scripts/apply-migration.sh path/to/migration.sql"
  exit 1
fi

MIGRATION_FILE="$1"

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
      if [ ! -z "$SUPABASE_URL" ]; then
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
echo "⚠️  Note: Migration must be applied manually via:"
echo "   1. Supabase Dashboard > SQL Editor, OR"
echo "   2. Supabase MCP tools, OR"
echo "   3. Direct psql connection"
echo ""
echo "After applying the migration, press Enter to regenerate types..."
read -r

echo "🔄 Regenerating database types..."
export SUPABASE_PROJECT_ID
npm run db:types

echo "✅ Migration applied and types regenerated!"
