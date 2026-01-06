-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 10: DATA QUALITY & RECENT ACTIVITY
-- Sections 23-24: Null Analysis and Recent Data
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 23: NULL VALUE ANALYSIS - KEY TABLES
-- Checks for NULL values in critical fields
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
  COUNT(*) FILTER (WHERE email IS NULL) as null_emails,
  COUNT(*) FILTER (WHERE first_name IS NULL) as null_first_names,
  COUNT(*) FILTER (WHERE last_name IS NULL) as null_last_names,
  COUNT(*) as total_rows
FROM golf_players;

-- Golf Teams table null counts
SELECT
  'golf_teams' as table_name,
  COUNT(*) FILTER (WHERE name IS NULL) as null_names,
  COUNT(*) FILTER (WHERE organization_id IS NULL) as null_organization_ids,
  COUNT(*) as total_rows
FROM golf_teams;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 24: RECENT DATA ACTIVITY
-- Shows recently created records to verify system is working
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
  email,
  first_name,
  last_name,
  user_id,
  created_at
FROM golf_players
ORDER BY created_at DESC
LIMIT 10;

-- Recently created golf teams
SELECT
  id,
  name,
  organization_id,
  created_at
FROM golf_teams
ORDER BY created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- BONUS: Data quality score
-- ═══════════════════════════════════════════════════════════════════════════

-- Calculate completeness percentage for golf_players
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as user_id_completeness,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as email_completeness,
  ROUND(100.0 * COUNT(*) FILTER (WHERE first_name IS NOT NULL AND first_name != '') / NULLIF(COUNT(*), 0), 2) as first_name_completeness,
  ROUND(100.0 * COUNT(*) FILTER (WHERE last_name IS NOT NULL AND last_name != '') / NULLIF(COUNT(*), 0), 2) as last_name_completeness
FROM golf_players;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - NULL emails/user_ids should be 0
-- - NULL roles/sports in users should be 0
-- - Recent activity should show valid timestamps
-- - Data completeness should be >95% for critical fields
-- ═══════════════════════════════════════════════════════════════════════════
