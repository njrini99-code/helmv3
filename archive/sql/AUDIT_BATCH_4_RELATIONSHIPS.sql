-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 4: DATABASE RELATIONSHIPS & INDEXES
-- Sections 6-8: Foreign Keys and Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: FOREIGN KEY RELATIONSHIPS
-- Shows all table relationships and cascading rules
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
-- Count of indexes per table
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
-- Detailed view of every index
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - Foreign keys should all point to valid tables
-- - Delete rules should be appropriate (CASCADE, SET NULL, or RESTRICT)
-- - Each table should have indexes on frequently queried columns
-- - user_id, team_id, organization_id columns should be indexed
-- ═══════════════════════════════════════════════════════════════════════════
