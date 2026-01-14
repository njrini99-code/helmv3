#!/bin/bash

# GolfHelm Database Audit Runner using psql
# This script runs database audit queries via psql command

PGPASSWORD='EHl4yASa9zM1sb1k'
DB_HOST='aws-0-us-west-1.pooler.supabase.com'
DB_PORT='6543'
DB_NAME='postgres'
DB_USER='postgres.dgvlnelygibgrrjehbyc'

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="audit-report-${TIMESTAMP}.txt"
JSON_FILE="audit-report-${TIMESTAMP}.json"

echo "═══════════════════════════════════════════════════════════════"
echo "           GOLFHELM DATABASE AUDIT"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Generated: $(date)"
echo ""

# Function to run SQL query
run_query() {
  local query_name="$1"
  local sql="$2"

  echo ""
  echo "━━━ $query_name ━━━"
  echo "$sql" | PGPASSWORD="$PGPASSWORD" psql \
    "postgresql://${DB_USER}:${PGPASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
    -t -A -F"," 2>&1

  if [ $? -eq 0 ]; then
    echo "✅ Success"
  else
    echo "❌ Failed"
  fi
}

# Start report
{
  echo "═══════════════════════════════════════════════════════════════"
  echo "           GOLFHELM DATABASE AUDIT REPORT"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "Generated: $(date)"
  echo ""

  # 1. Database Extensions
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "1. INSTALLED EXTENSIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Installed Extensions" "
    SELECT extname, extversion, nspname as schema
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    ORDER BY extname;
  "

  # 2. All Tables
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "2. ALL PUBLIC TABLES"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Public Tables" "
    SELECT tablename, tableowner
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  "

  # 3. Tables WITHOUT RLS (CRITICAL!)
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "3. 🔴 CRITICAL: TABLES WITHOUT RLS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Tables Without RLS" "
    SELECT tablename
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public'
    AND c.relrowsecurity = false
    ORDER BY tablename;
  "

  # 4. RLS Policies Count
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "4. RLS POLICIES SUMMARY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "RLS Policies by Table" "
    SELECT tablename, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY tablename;
  "

  # 5. Foreign Keys
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "5. FOREIGN KEY RELATIONSHIPS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Foreign Keys" "
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  "

  # 6. Indexes Count
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "6. INDEXES SUMMARY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Indexes by Table" "
    SELECT tablename, COUNT(*) as index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY tablename;
  "

  # 7. Functions
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "7. CUSTOM FUNCTIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Public Functions" "
    SELECT
      p.proname as function_name,
      CASE p.prosecdef
        WHEN true THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
      END as security
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  "

  # 8. Triggers
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "8. TRIGGERS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "All Triggers" "
    SELECT
      event_object_table as table_name,
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  "

  # 9. Table Row Counts
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "9. TABLE ROW COUNTS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Row Counts" "
    SELECT
      relname as table_name,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC;
  "

  # 10. Golf Tables
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "10. GOLF-SPECIFIC TABLES"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Golf Tables" "
    SELECT tablename, tableowner
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'golf_%'
    ORDER BY tablename;
  "

  # 11. User Counts
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "11. USER ACCOUNTS BY ROLE & SPORT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "User Counts" "
    SELECT role, sport, COUNT(*) as count
    FROM users
    GROUP BY role, sport
    ORDER BY role, sport;
  "

  # 12. Enum Types
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "12. ENUM TYPES"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Enum Types" "
    SELECT
      t.typname as enum_name,
      string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  "

  # 13. Users table schema
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "13. USERS TABLE SCHEMA"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Users Columns" "
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'users'
    ORDER BY ordinal_position;
  "

  # 14. Golf Players schema
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "14. GOLF_PLAYERS TABLE SCHEMA"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  run_query "Golf Players Columns" "
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'golf_players'
    ORDER BY ordinal_position;
  "

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "                    END OF AUDIT REPORT"
  echo "═══════════════════════════════════════════════════════════════"

} | tee "$REPORT_FILE"

echo ""
echo "✅ Report saved to: $REPORT_FILE"
echo ""
echo "Audit complete!"
