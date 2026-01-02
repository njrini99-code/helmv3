-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 8: SCHEMA ANALYSIS
-- Sections 16-19: Enums and Table Structure Details
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 16: ENUM TYPES
-- Shows all custom enum types and their allowed values
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
-- Complete structure of the users table
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
-- Complete structure of the golf_players table
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
-- Complete structure of the golf_teams table
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
-- BONUS: All golf-related table schemas
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name LIKE 'golf_%'
ORDER BY table_name, ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - Should see golf_player_year, golf_player_type enums
-- - users.sport should have default value
-- - user_id columns should be uuid type with NOT NULL constraints
-- ═══════════════════════════════════════════════════════════════════════════
