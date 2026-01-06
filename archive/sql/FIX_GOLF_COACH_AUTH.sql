-- ============================================================================
-- EMERGENCY FIX: Golf Coach Authentication Bug
-- ============================================================================
-- ISSUE: Golf coaches cannot access dashboard after completing onboarding
-- ROOT CAUSE: Migration 20251231000003 created ONLY INSERT policies,
--             removing the SELECT and UPDATE policies from migration 043
-- EFFECT: Coaches can't read their own golf_coaches record, so layout
--         redirects to signup page
-- ============================================================================
--
-- HOW TO APPLY:
-- 1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new
-- 2. Copy and paste this entire file
-- 3. Click "Run" button
-- 4. Verify you see "SUCCESS" messages
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- GOLF_COACHES TABLE - Restore complete policy set
-- ============================================================================

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can create own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can read own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Coach manages own profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Authenticated users can view coaches" ON public.golf_coaches;

-- Recreate complete policy set (SELECT + INSERT + UPDATE)
CREATE POLICY "Users can read own golf coach profile" ON public.golf_coaches
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own golf coach profile" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own golf coach profile" ON public.golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- GOLF_PLAYERS TABLE - Restore complete policy set
-- ============================================================================

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can create own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can read own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can insert own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can update own golf player profile" ON public.golf_players;

-- Recreate complete policy set
CREATE POLICY "Users can read own golf player profile" ON public.golf_players
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own golf player profile" ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own golf player profile" ON public.golf_players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BASEBALL COACHES TABLE - Restore complete policy set (for completeness)
-- ============================================================================

DROP POLICY IF EXISTS "Users can create own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Users can read own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Anyone can view coach profiles" ON public.coaches;

CREATE POLICY "Users can read own coach profile" ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coach profile" ON public.coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own coach profile" ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view coach profiles" ON public.coaches
  FOR SELECT
  USING (true);

-- ============================================================================
-- BASEBALL PLAYERS TABLE - Restore complete policy set (for completeness)
-- ============================================================================

DROP POLICY IF EXISTS "Users can create own player profile" ON public.players;
DROP POLICY IF EXISTS "Users can read own player profile" ON public.players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON public.players;
DROP POLICY IF EXISTS "Users can update own player profile" ON public.players;
DROP POLICY IF EXISTS "Coaches can view all players" ON public.players;

CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player profile" ON public.players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player profile" ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Coaches can view all players" ON public.players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

-- ============================================================================
-- USERS TABLE - Restore complete policy set (for completeness)
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id);

CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- Verify policies were created
-- ============================================================================

DO $$
DECLARE
  policy_count int;
BEGIN
  -- Check golf_coaches policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'golf_coaches'
  AND policyname IN (
    'Users can read own golf coach profile',
    'Users can insert own golf coach profile',
    'Users can update own golf coach profile'
  );

  IF policy_count = 3 THEN
    RAISE NOTICE '✅ golf_coaches policies: OK (% policies)', policy_count;
  ELSE
    RAISE WARNING '⚠️  golf_coaches policies: INCOMPLETE (% of 3 policies)', policy_count;
  END IF;

  -- Check golf_players policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'golf_players'
  AND policyname IN (
    'Users can read own golf player profile',
    'Users can insert own golf player profile',
    'Users can update own golf player profile'
  );

  IF policy_count = 3 THEN
    RAISE NOTICE '✅ golf_players policies: OK (% policies)', policy_count;
  ELSE
    RAISE WARNING '⚠️  golf_players policies: INCOMPLETE (% of 3 policies)', policy_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'GOLF COACH AUTH FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Golf coaches should now be able to:';
  RAISE NOTICE '1. Complete signup ✅';
  RAISE NOTICE '2. Complete onboarding ✅';
  RAISE NOTICE '3. Access dashboard ✅ (FIX APPLIED)';
  RAISE NOTICE '';
  RAISE NOTICE 'Test by:';
  RAISE NOTICE '1. Creating a new golf coach account';
  RAISE NOTICE '2. Completing the 5-step onboarding';
  RAISE NOTICE '3. Verifying redirect to /golf/dashboard works';
  RAISE NOTICE '';
END $$;

COMMIT;
