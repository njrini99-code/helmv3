-- ═══════════════════════════════════════════════════════════════════════════
-- GOLFHELM DATABASE COMPREHENSIVE AUDIT
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- INSTRUCTIONS:
-- 1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new
-- 2. Copy and paste each section below
-- 3. Run each query and save the results
-- 4. Review the results for issues marked as 🔴 CRITICAL or 🟠 HIGH

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: DATABASE EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  extname as extension_name,
  extversion as version,
  nspname as schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
ORDER BY extname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: ALL PUBLIC TABLES
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  tableowner,
  hasindexes,
  hastriggers
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: 🔴 CRITICAL - TABLES WITHOUT RLS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.tablename,
  c.relrowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
AND c.relrowsecurity = false
ORDER BY t.tablename;

-- ⚠️  ANY TABLES LISTED ABOVE ARE SECURITY RISKS - THEY SHOULD HAVE RLS ENABLED!

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: RLS POLICIES SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC, tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: ALL RLS POLICIES DETAILS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  qual::text as using_expression,
  with_check::text as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: FOREIGN KEY RELATIONSHIPS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: INDEXES SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY index_count DESC, tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8: ALL INDEXES DETAILS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9: CUSTOM FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END as volatility,
  CASE p.prosecdef
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10: TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11: TABLE ROW COUNTS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  relname as table_name,
  n_live_tup as row_count,
  n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 12: GOLF-SPECIFIC TABLES
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'golf_%'
ORDER BY tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 13: USER ACCOUNTS BY ROLE & SPORT
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  role,
  sport,
  COUNT(*) as count
FROM users
GROUP BY ROLLUP(role, sport)
ORDER BY role NULLS LAST, sport NULLS LAST;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14: 🟠 HIGH - ORPHANED GOLF PLAYERS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  full_name,
  email,
  user_id
FROM golf_players
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM users)
LIMIT 50;

-- ⚠️  THESE GOLF PLAYERS HAVE NO ASSOCIATED USER ACCOUNT

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 15: ORPHANED GOLF TEAMS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  name,
  organization_id
FROM golf_teams
WHERE organization_id IS NULL
   OR organization_id NOT IN (SELECT id FROM golf_organizations)
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 16: ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 17: USERS TABLE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 18: GOLF_PLAYERS TABLE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'golf_players'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 19: GOLF_TEAMS TABLE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'golf_teams'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 20: DATABASE SIZE & TABLE SIZES
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  pg_size_pretty(pg_database_size(current_database())) as database_size;

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 21: CONSTRAINTS SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  constraint_type,
  COUNT(*) as count
FROM information_schema.table_constraints
WHERE table_schema = 'public'
GROUP BY constraint_type
ORDER BY count DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 22: CHECK CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 23: NULL VALUE ANALYSIS - KEY TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Users table null counts
SELECT
  'users' as table_name,
  COUNT(*) FILTER (WHERE email IS NULL) as null_emails,
  COUNT(*) FILTER (WHERE role IS NULL) as null_roles,
  COUNT(*) FILTER (WHERE sport IS NULL) as null_sports,
  COUNT(*) as total_rows
FROM users;

-- Golf Players table null counts
SELECT
  'golf_players' as table_name,
  COUNT(*) FILTER (WHERE user_id IS NULL) as null_user_ids,
  COUNT(*) FILTER (WHERE full_name IS NULL) as null_names,
  COUNT(*) FILTER (WHERE email IS NULL) as null_emails,
  COUNT(*) as total_rows
FROM golf_players;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 24: RECENT DATA ACTIVITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Recently created users
SELECT
  id,
  email,
  role,
  sport,
  created_at
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Recently created golf players
SELECT
  id,
  full_name,
  email,
  created_at
FROM golf_players
ORDER BY created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF AUDIT
-- ═══════════════════════════════════════════════════════════════════════════

-- SUMMARY OF CRITICAL CHECKS:
-- 1. Section 3: Tables without RLS (should be ZERO)
-- 2. Section 14: Orphaned golf players (should be addressed)
-- 3. Section 15: Orphaned golf teams (should be addressed)
-- 4. Section 23: Null values in required fields (should be minimal)
