-- =====================================================
-- CLEANUP ALL RLS POLICIES
-- Remove ALL existing policies and create clean ones
-- =====================================================

-- Drop ALL existing policies on golf_coaches
DROP POLICY IF EXISTS "Authenticated users can view coaches" ON golf_coaches;
DROP POLICY IF EXISTS "Coach manages own profile" ON golf_coaches;
DROP POLICY IF EXISTS "Players can view their coach" ON golf_coaches;
DROP POLICY IF EXISTS "Users can create own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can create their own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf_coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Users can read own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can read own golf_coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf_coaches record" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update their own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can view their own golf coach profile" ON golf_coaches;

-- Drop ALL existing policies on golf_players
DROP POLICY IF EXISTS "Coaches can view team players" ON golf_players;
DROP POLICY IF EXISTS "Users can create own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can create their own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can insert own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can insert own golf_players record" ON golf_players;
DROP POLICY IF EXISTS "Users can read own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can read own golf_players record" ON golf_players;
DROP POLICY IF EXISTS "Users can update own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can update own golf_players record" ON golf_players;
DROP POLICY IF EXISTS "Users can update their own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can view their own golf player profile" ON golf_players;

-- =====================================================
-- CREATE CLEAN POLICIES - GOLF_PLAYERS
-- Only 3 policies needed: SELECT, UPDATE, INSERT
-- =====================================================

CREATE POLICY "golf_players_select_own"
ON golf_players FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "golf_players_update_own"
ON golf_players FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "golf_players_insert_own"
ON golf_players FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- CREATE CLEAN POLICIES - GOLF_COACHES
-- Only 3 policies needed: SELECT, UPDATE, INSERT
-- =====================================================

CREATE POLICY "golf_coaches_select_own"
ON golf_coaches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "golf_coaches_update_own"
ON golf_coaches FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "golf_coaches_insert_own"
ON golf_coaches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN cmd = 'SELECT' THEN '✅ View own data'
    WHEN cmd = 'UPDATE' THEN '✅ Update own data'
    WHEN cmd = 'INSERT' THEN '✅ Create own data'
  END as description
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches')
ORDER BY tablename, cmd;

-- Expected: 3 policies per table (6 total)
