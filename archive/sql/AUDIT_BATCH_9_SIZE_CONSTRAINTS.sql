-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 9: DATABASE SIZE & CONSTRAINTS
-- Sections 20-22: Size Analysis and Constraints
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 20: DATABASE SIZE & TABLE SIZES
-- Shows total database size and size breakdown by table
-- ═══════════════════════════════════════════════════════════════════════════

-- Total database size
SELECT
  pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Top 20 tables by size
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
-- Count of different constraint types
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
-- Shows all CHECK constraints and their validation rules
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
-- EXPECTED RESULTS:
-- - Database should be under reasonable size for current usage
-- - Constraints should include PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK
-- - Check constraints should validate enum-like fields (sport, role, etc.)
-- ═══════════════════════════════════════════════════════════════════════════
