-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 6: DATA DISTRIBUTION & USER ANALYSIS
-- Sections 11-13: Row Counts and User Distribution
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11: TABLE ROW COUNTS
-- Shows how many rows are in each table (live and dead)
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
-- Lists all golf-related tables
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
-- Distribution of users by role and sport
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  role,
  sport,
  COUNT(*) as count
FROM users
GROUP BY ROLLUP(role, sport)
ORDER BY role NULLS LAST, sport NULLS LAST;

-- ═══════════════════════════════════════════════════════════════════════════
-- BONUS: Detailed user distribution
-- ═══════════════════════════════════════════════════════════════════════════

-- Users by sport
SELECT
  sport,
  COUNT(*) as count
FROM users
GROUP BY sport
ORDER BY count DESC;

-- Users by role
SELECT
  role,
  COUNT(*) as count
FROM users
GROUP BY role
ORDER BY count DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - Dead rows should be minimal (indicates vacuum is working)
-- - User distribution should match expected signup patterns
-- - Golf sport should have users in both player and coach roles
-- ═══════════════════════════════════════════════════════════════════════════
