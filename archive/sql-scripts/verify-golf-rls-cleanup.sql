-- VERIFICATION SCRIPT FOR GOLF RLS CLEANUP
-- Run this in Supabase Dashboard SQL Editor to verify RLS is completely removed

-- ============================================
-- CHECK 1: List all golf tables and their RLS status
-- ============================================
SELECT
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
ORDER BY tablename;

-- Expected: All tables should show rls_enabled = false

-- ============================================
-- CHECK 2: Count policies per golf table
-- ============================================
SELECT
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
GROUP BY tablename
ORDER BY tablename;

-- Expected: Should return 0 rows (no policies exist)

-- ============================================
-- CHECK 3: List any remaining policies (detailed)
-- ============================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd AS operation,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
ORDER BY tablename, policyname;

-- Expected: Should return 0 rows (no policies exist)

-- ============================================
-- CHECK 4: Verify table comments
-- ============================================
SELECT
    c.relname AS tablename,
    pg_catalog.obj_description(c.oid, 'pg_class') AS comment
FROM pg_catalog.pg_class c
WHERE c.relname LIKE 'golf_%'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Expected: Should show "RLS completely disabled - will be reconfigured"
