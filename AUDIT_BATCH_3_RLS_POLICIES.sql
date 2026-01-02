-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 3: RLS POLICIES ANALYSIS
-- Sections 4-5: RLS Policies Summary and Details
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: RLS POLICIES SUMMARY
-- Shows how many policies each table has
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
-- Complete details of every RLS policy
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
-- EXPECTED RESULTS:
-- - Each table should have policies for SELECT, INSERT, UPDATE, DELETE
-- - Golf tables should have policies checking user_id or team membership
-- - Policies should use auth.uid() to verify user identity
-- ═══════════════════════════════════════════════════════════════════════════
