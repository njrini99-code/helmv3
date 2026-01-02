-- ============================================================================
-- Fix: Restore complete RLS policies that were overwritten by migration 20251231000003
-- Issue: Migration 20251231000003 created ONLY INSERT policies, removing SELECT/UPDATE
-- This migration restores the full policy set for all auth tables
-- ============================================================================

-- GOLF_COACHES TABLE - Complete policy set (restore what was in 043)
ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can read own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON public.golf_coaches;

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

-- GOLF_PLAYERS TABLE - Complete policy set
ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can read own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can insert own golf player profile" ON public.golf_players;
DROP POLICY IF EXISTS "Users can update own golf player profile" ON public.golf_players;

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

-- COACHES TABLE (Baseball) - Complete policy set
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

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

-- PLAYERS TABLE (Baseball) - Complete policy set
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

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

-- USERS TABLE - Complete policy set
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

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

-- Add helpful comments
COMMENT ON POLICY "Users can read own golf coach profile" ON public.golf_coaches IS
  'Allows golf coaches to read their own profile - CRITICAL for dashboard access';

COMMENT ON POLICY "Users can update own golf coach profile" ON public.golf_coaches IS
  'Allows golf coaches to update their profile during onboarding and settings';

COMMENT ON POLICY "Users can read own golf player profile" ON public.golf_players IS
  'Allows golf players to read their own profile - CRITICAL for dashboard access';
