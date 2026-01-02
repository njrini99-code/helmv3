-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 1: DATABASE INVENTORY
-- Sections 1-2: Extensions and Tables Overview
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: DATABASE EXTENSIONS
-- Shows what PostgreSQL extensions are enabled
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
-- Lists all tables in the public schema with metadata
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
-- EXPECTED RESULTS:
-- - Extensions: Should include uuid-ossp, pgcrypto, etc.
-- - Tables: Should see users, golf_players, golf_teams, golf_organizations, etc.
-- ═══════════════════════════════════════════════════════════════════════════
