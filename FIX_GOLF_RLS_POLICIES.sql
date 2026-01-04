-- =====================================================
-- FIX GOLF RLS POLICIES
-- Issue: Users getting 500 errors when trying to access their own profiles
-- Solution: Create proper RLS policies for golf_players and golf_coaches
-- =====================================================

-- Drop existing policies if any (to start fresh)
DROP POLICY IF EXISTS "Users can view their own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can update their own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can view their own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update their own golf coach profile" ON golf_coaches;

-- =====================================================
-- GOLF_PLAYERS POLICIES
-- =====================================================

-- Allow users to SELECT their own profile
CREATE POLICY "Users can view their own golf player profile"
ON golf_players
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to UPDATE their own profile
CREATE POLICY "Users can update their own golf player profile"
ON golf_players
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to INSERT their own profile (for onboarding)
CREATE POLICY "Users can create their own golf player profile"
ON golf_players
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- GOLF_COACHES POLICIES
-- =====================================================

-- Allow users to SELECT their own profile
CREATE POLICY "Users can view their own golf coach profile"
ON golf_coaches
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to UPDATE their own profile
CREATE POLICY "Users can update their own golf coach profile"
ON golf_coaches
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to INSERT their own profile (for onboarding)
CREATE POLICY "Users can create their own golf coach profile"
ON golf_coaches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- GOLF_TEAMS POLICIES (Optional - for team visibility)
-- =====================================================

-- Allow users to view teams they're members of
CREATE POLICY "Users can view their team"
ON golf_teams
FOR SELECT
TO authenticated
USING (
  -- User is a player on this team
  id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- User is a coach of this team
  id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- VERIFICATION QUERIES
-- Run these after applying the policies above
-- =====================================================

-- 1. Verify RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches', 'golf_teams')
ORDER BY tablename;

-- Expected: All should show rls_enabled = true

-- 2. Verify policies exist
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches', 'golf_teams')
ORDER BY tablename, policyname;

-- Expected: Should see SELECT, UPDATE, INSERT policies for each table

-- 3. Test with your user ID (replace with actual user_id)
SET SESSION "request.jwt.claims.sub" = 'aa6746b8-2d05-4101-9bde-63ada5f186cf';

SELECT id, first_name, last_name, email
FROM golf_players
WHERE user_id = 'aa6746b8-2d05-4101-9bde-63ada5f186cf';

-- Expected: Should return your player record without errors
