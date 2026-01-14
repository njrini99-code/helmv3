-- Migration: Fix RLS policies for coaches and players tables
-- Allows users to create their own coach/player profiles during signup

-- ============================================
-- COACHES TABLE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON public.coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON public.coaches;

-- Users can read their own coach profile
CREATE POLICY "Users can read own coach profile" ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own coach profile (needed for signup)
CREATE POLICY "Users can insert own coach profile" ON public.coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own coach profile
CREATE POLICY "Users can update own coach profile" ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on coaches table if not already enabled
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PLAYERS TABLE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own player profile" ON public.players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON public.players;
DROP POLICY IF EXISTS "Users can update own player profile" ON public.players;

-- Users can read their own player profile
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own player profile (needed for signup)
CREATE POLICY "Users can insert own player profile" ON public.players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own player profile
CREATE POLICY "Users can update own player profile" ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on players table if not already enabled
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ============================================
-- GOLF_COACHES TABLE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON public.golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON public.golf_coaches;

-- Users can read their own golf coach profile
CREATE POLICY "Users can read own golf coach profile" ON public.golf_coaches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own golf coach profile (needed for signup)
CREATE POLICY "Users can insert own golf coach profile" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own golf coach profile
CREATE POLICY "Users can update own golf coach profile" ON public.golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on golf_coaches table if not already enabled
ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

-- Comment explaining the policies
COMMENT ON TABLE public.coaches IS
  'RLS policies allow users to create and manage their own coach profiles. Users can only INSERT their own profile (user_id = auth.uid()).';

COMMENT ON TABLE public.players IS
  'RLS policies allow users to create and manage their own player profiles. Users can only INSERT their own profile (user_id = auth.uid()).';

COMMENT ON TABLE public.golf_coaches IS
  'RLS policies allow users to create and manage their own golf coach profiles. Users can only INSERT their own profile (user_id = auth.uid()).';
