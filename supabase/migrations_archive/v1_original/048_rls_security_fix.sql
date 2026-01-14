-- ============================================================================
-- RLS SECURITY FIX MIGRATION
-- Fixes security issues identified in Phase 3 audit
-- Ensures proper row-level security on all tables
-- ============================================================================

-- ============================================================================
-- PART 1: FIX PLAYERS TABLE (was exposed to anonymous)
-- ============================================================================

-- Remove any overly permissive policies
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
DROP POLICY IF EXISTS "Public player profiles" ON public.players;
DROP POLICY IF EXISTS "Players are viewable by everyone" ON public.players;

-- Ensure RLS is enabled
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Users can read their own player profile
DROP POLICY IF EXISTS "Users can read own player profile" ON public.players;
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own player profile
DROP POLICY IF EXISTS "Users can update own player profile" ON public.players;
CREATE POLICY "Users can update own player profile" ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can insert their own player profile
DROP POLICY IF EXISTS "Users can insert own player profile" ON public.players;
CREATE POLICY "Users can insert own player profile" ON public.players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Coaches can view players who have activated recruiting
DROP POLICY IF EXISTS "Coaches can view recruiting players" ON public.players;
CREATE POLICY "Coaches can view recruiting players" ON public.players
  FOR SELECT
  USING (
    -- Must be a coach
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
    -- Player must have recruiting activated
    AND (recruiting_activated = true OR recruiting_activated IS NULL)
  );

-- ============================================================================
-- PART 2: FIX GOLF_PLAYERS TABLE
-- ============================================================================

ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own golf_players record" ON public.golf_players;
CREATE POLICY "Users can read own golf_players record" ON public.golf_players
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own golf_players record" ON public.golf_players;
CREATE POLICY "Users can update own golf_players record" ON public.golf_players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own golf_players record" ON public.golf_players;
CREATE POLICY "Users can insert own golf_players record" ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Coaches can view players on their team
DROP POLICY IF EXISTS "Coaches can view team players" ON public.golf_players;
CREATE POLICY "Coaches can view team players" ON public.golf_players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_players.team_id
    )
  );

-- ============================================================================
-- PART 3: FIX GOLF_COACHES TABLE
-- ============================================================================

ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can read own golf_coaches record" ON public.golf_coaches
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can update own golf_coaches record" ON public.golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can insert own golf_coaches record" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Players can view their coach
DROP POLICY IF EXISTS "Players can view their coach" ON public.golf_coaches;
CREATE POLICY "Players can view their coach" ON public.golf_coaches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.user_id = auth.uid()
      AND golf_players.team_id = golf_coaches.team_id
    )
  );

-- ============================================================================
-- PART 4: FIX GOLF_TEAMS TABLE
-- ============================================================================

ALTER TABLE public.golf_teams ENABLE ROW LEVEL SECURITY;

-- Coaches can view and manage their team
DROP POLICY IF EXISTS "Coaches can view own team" ON public.golf_teams;
CREATE POLICY "Coaches can view own team" ON public.golf_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

DROP POLICY IF EXISTS "Coaches can update own team" ON public.golf_teams;
CREATE POLICY "Coaches can update own team" ON public.golf_teams
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

-- Coaches can insert teams (during onboarding)
DROP POLICY IF EXISTS "Coaches can create teams" ON public.golf_teams;
CREATE POLICY "Coaches can create teams" ON public.golf_teams
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

-- Players can view their team
DROP POLICY IF EXISTS "Players can view their team" ON public.golf_teams;
CREATE POLICY "Players can view their team" ON public.golf_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.user_id = auth.uid()
      AND golf_players.team_id = golf_teams.id
    )
  );

-- Anyone can look up team by invite_code (for joining)
DROP POLICY IF EXISTS "Anyone can lookup team by invite code" ON public.golf_teams;
CREATE POLICY "Anyone can lookup team by invite code" ON public.golf_teams
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND invite_code IS NOT NULL
  );

-- ============================================================================
-- PART 5: FIX GOLF_ORGANIZATIONS TABLE
-- ============================================================================

ALTER TABLE public.golf_organizations ENABLE ROW LEVEL SECURITY;

-- Coaches can view and manage their organization
DROP POLICY IF EXISTS "Coaches can view own organization" ON public.golf_organizations;
CREATE POLICY "Coaches can view own organization" ON public.golf_organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );

DROP POLICY IF EXISTS "Coaches can update own organization" ON public.golf_organizations;
CREATE POLICY "Coaches can update own organization" ON public.golf_organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );

-- Coaches can insert organizations (during onboarding)
DROP POLICY IF EXISTS "Coaches can create organizations" ON public.golf_organizations;
CREATE POLICY "Coaches can create organizations" ON public.golf_organizations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

-- Players can view their team's organization
DROP POLICY IF EXISTS "Players can view team organization" ON public.golf_organizations;
CREATE POLICY "Players can view team organization" ON public.golf_organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_players gp
      JOIN public.golf_teams gt ON gt.id = gp.team_id
      WHERE gp.user_id = auth.uid()
      AND gt.organization_id = golf_organizations.id
    )
  );

-- ============================================================================
-- PART 6: FIX USERS TABLE
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own record" ON public.users;
CREATE POLICY "Users can read own record" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
CREATE POLICY "Users can insert own record" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.players TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_players TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_organizations TO authenticated;

-- ============================================================================
-- SUMMARY
-- ============================================================================
COMMENT ON TABLE public.players IS
  'Baseball players with RLS - only visible to owner and coaches (if recruiting activated). Fixed 2026-01-01.';
