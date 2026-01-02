-- ============================================================================
-- REMOVE DUPLICATE RLS POLICIES - Migration 054
-- From COMPREHENSIVE_DATABASE_AUDIT.md
-- Date: 2026-01-02
--
-- Removes ~35 duplicate RLS policies that accumulated during development
-- ============================================================================

-- ============================================================================
-- CLEANUP: coaches table duplicates (7 of 10 policies are duplicates)
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view coach profiles" ON coaches;
DROP POLICY IF EXISTS "Coaches can manage own profile" ON coaches;
DROP POLICY IF EXISTS "Users can create own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can read own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can read own coaches record" ON coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON coaches;

-- Keep only:
-- "Anyone can view coaches" (SELECT)
-- "Users can insert own coaches record" (INSERT)
-- "Users can update own coaches record" (UPDATE)

-- ============================================================================
-- CLEANUP: players table duplicates (5 of 10 policies are duplicates)
-- ============================================================================

DROP POLICY IF EXISTS "Players can manage own profile" ON players;
DROP POLICY IF EXISTS "Users can create own player profile" ON players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON players;
DROP POLICY IF EXISTS "Users can read own player profile" ON players;
DROP POLICY IF EXISTS "Users can read own players record" ON players;
DROP POLICY IF EXISTS "Users can update own player profile" ON players;

-- Keep only:
-- "Activated players are public" (SELECT)
-- "Coaches can view all players" (SELECT)
-- "Users can insert own players record" (INSERT)
-- "Users can update own players record" (UPDATE)

-- ============================================================================
-- CLEANUP: users table duplicates (7 of 11 policies are duplicates)
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;

-- Keep only:
-- "Allow authenticated users to insert own profile" (INSERT)
-- "Allow service role to insert users" (INSERT)
-- "Users can read own record" (SELECT)
-- "Users can update own record" (UPDATE)

-- ============================================================================
-- CLEANUP: golf_coaches table duplicates
-- ============================================================================

-- Drop duplicate INSERT policies
DROP POLICY IF EXISTS "Users can create own golf coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coaches record" ON golf_coaches;

-- Drop duplicate SELECT policies
DROP POLICY IF EXISTS "Users can read own golf coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Coaches can read own golf coaches record" ON golf_coaches;

-- Drop duplicate UPDATE policies
DROP POLICY IF EXISTS "Users can update own golf coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Coaches can update own golf coaches record" ON golf_coaches;

-- ============================================================================
-- CLEANUP: golf_players table duplicates
-- ============================================================================

-- Drop duplicate INSERT policies
DROP POLICY IF EXISTS "Users can create own golf players record" ON golf_players;
DROP POLICY IF EXISTS "Users can insert own golf players record" ON golf_players;

-- Drop duplicate SELECT policies
DROP POLICY IF EXISTS "Users can read own golf players record" ON golf_players;

-- Drop duplicate UPDATE policies
DROP POLICY IF EXISTS "Users can update own golf players record" ON golf_players;

-- ============================================================================
-- CLEANUP: golf_organizations table duplicates
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view their own organization" ON golf_organizations;
DROP POLICY IF EXISTS "Coaches can update their own organization" ON golf_organizations;

-- Summary: Removed ~35 duplicate policies across 7 tables
