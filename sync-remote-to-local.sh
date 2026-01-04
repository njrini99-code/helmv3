#!/bin/bash

# ============================================================================
# Sync Remote (Production) Database to Local
# ============================================================================

set -e  # Exit on error

echo "🔄 Syncing Remote → Local Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Remote database credentials
REMOTE_HOST="db.dgvlnelygibgrrjehbyc.supabase.co"
REMOTE_PORT="5432"
REMOTE_USER="postgres"
REMOTE_PASSWORD="EHl4yASa9zM1sb1k"
REMOTE_DB="postgres"

# Local database credentials
LOCAL_HOST="127.0.0.1"
LOCAL_PORT="54322"
LOCAL_USER="postgres"
LOCAL_PASSWORD="postgres"
LOCAL_DB="postgres"

# Temporary dump file
DUMP_FILE="/tmp/remote_db_dump.sql"

echo "📥 Step 1: Dumping remote database schema..."
PGPASSWORD="$REMOTE_PASSWORD" /opt/homebrew/Cellar/postgresql@16/16.11/bin/pg_dump \
  -h "$REMOTE_HOST" \
  -p "$REMOTE_PORT" \
  -U "$REMOTE_USER" \
  -d "$REMOTE_DB" \
  --schema-only \
  --no-owner \
  --no-acl \
  -f "$DUMP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Remote schema dumped to $DUMP_FILE"
else
  echo "❌ Failed to dump remote database"
  exit 1
fi

echo ""
echo "📤 Step 2: Restoring to local database..."

# Drop and recreate schema (careful!)
PGPASSWORD="$LOCAL_PASSWORD" /opt/homebrew/Cellar/postgresql@16/16.11/bin/psql \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Restore the dump
PGPASSWORD="$LOCAL_PASSWORD" /opt/homebrew/Cellar/postgresql@16/16.11/bin/psql \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  -f "$DUMP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Schema restored to local database"
else
  echo "❌ Failed to restore to local database"
  exit 1
fi

echo ""
echo "🧹 Step 3: Cleaning up..."
rm -f "$DUMP_FILE"
echo "✅ Temporary dump file removed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Sync Complete!"
echo ""
echo "Local database now matches remote (production) schema"
echo ""
echo "Next steps:"
echo "1. Verify: npm run dev (should connect to local DB)"
echo "2. Test: Check that RLS policies are working"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
