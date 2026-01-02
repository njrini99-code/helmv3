-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 2: 🔴 CRITICAL SECURITY CHECKS
-- Section 3: Tables Without RLS (Row Level Security)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: 🔴 CRITICAL - TABLES WITHOUT RLS
-- ⚠️  ANY TABLES LISTED HERE ARE SECURITY VULNERABILITIES
-- ⚠️  ALL TABLES SHOULD HAVE RLS ENABLED IN PRODUCTION
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.tablename,
  c.relrowsecurity as rls_enabled,
  CASE
    WHEN c.relrowsecurity = false THEN '🔴 CRITICAL: RLS DISABLED'
    ELSE '✅ OK'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
AND c.relrowsecurity = false
ORDER BY t.tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULT:
-- - Should return ZERO rows (all tables should have RLS enabled)
-- - If any tables appear, they are security risks and need immediate attention
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- BONUS: List all tables WITH RLS enabled (should be all tables)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.tablename,
  c.relrowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
AND c.relrowsecurity = true
ORDER BY t.tablename;
