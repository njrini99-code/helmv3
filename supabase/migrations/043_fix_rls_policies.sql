-- ============================================================================
-- Fix: Ensure all auth-related tables have complete and correct RLS policies
-- This migration adds missing policies and ensures consistency across all tables
-- ============================================================================

-- USERS TABLE
-- Ensure basic policies exist (most should already exist from earlier migrations)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can read own data'
  ) THEN
    CREATE POLICY "Users can read own data" ON public.users
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Allow users to update their own data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can update own data'
  ) THEN
    CREATE POLICY "Users can update own data" ON public.users
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- COACHES TABLE - Complete policy set
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own coach profile" ON public.coaches;
CREATE POLICY "Users can read own coach profile" ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own coach profile" ON public.coaches;
CREATE POLICY "Users can insert own coach profile" ON public.coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own coach profile" ON public.coaches;
CREATE POLICY "Users can update own coach profile" ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow anyone to view coach profiles (for discovery)
DROP POLICY IF EXISTS "Anyone can view coach profiles" ON public.coaches;
CREATE POLICY "Anyone can view coach profiles" ON public.coaches
  FOR SELECT
  USING (true);

-- PLAYERS TABLE - Complete policy set
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own player profile" ON public.players;
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own player profile" ON public.players;
CREATE POLICY "Users can insert own player profile" ON public.players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own player profile" ON public.players;
CREATE POLICY "Users can update own player profile" ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow coaches to view players (for discovery)
DROP POLICY IF EXISTS "Coaches can view all players" ON public.players;
CREATE POLICY "Coaches can view all players" ON public.players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

-- GOLF_COACHES TABLE - Complete policy set
ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own golf coach profile" ON public.golf_coaches;
CREATE POLICY "Users can read own golf coach profile" ON public.golf_coaches
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON public.golf_coaches;
CREATE POLICY "Users can insert own golf coach profile" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own golf coach profile" ON public.golf_coaches;
CREATE POLICY "Users can update own golf coach profile" ON public.golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- GOLF_PLAYERS TABLE - Complete policy set
ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own golf player profile" ON public.golf_players;
CREATE POLICY "Users can read own golf player profile" ON public.golf_players
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own golf player profile" ON public.golf_players;
CREATE POLICY "Users can insert own golf player profile" ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own golf player profile" ON public.golf_players;
CREATE POLICY "Users can update own golf player profile" ON public.golf_players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ORGANIZATIONS TABLE - Allow coaches to create, everyone to read
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can create organizations" ON public.organizations;
CREATE POLICY "Coaches can create organizations" ON public.organizations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read organizations" ON public.organizations;
CREATE POLICY "Authenticated users can read organizations" ON public.organizations
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Coaches can update own organization" ON public.organizations;
CREATE POLICY "Coaches can update own organization" ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches
      WHERE coaches.user_id = auth.uid()
      AND coaches.organization_id = organizations.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coaches
      WHERE coaches.user_id = auth.uid()
      AND coaches.organization_id = organizations.id
    )
  );

-- GOLF_ORGANIZATIONS TABLE - Same pattern as organizations
ALTER TABLE public.golf_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Golf coaches can create organizations" ON public.golf_organizations;
CREATE POLICY "Golf coaches can create organizations" ON public.golf_organizations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read golf organizations" ON public.golf_organizations;
CREATE POLICY "Authenticated users can read golf organizations" ON public.golf_organizations
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Golf coaches can update own organization" ON public.golf_organizations;
CREATE POLICY "Golf coaches can update own organization" ON public.golf_organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );

-- TEAMS TABLE - Coaches can manage their team, players can view their team
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own teams" ON public.teams;
CREATE POLICY "Users can view their own teams" ON public.teams
  FOR SELECT
  USING (
    -- Player can see teams they're on
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = teams.id
      AND team_members.player_id IN (
        SELECT id FROM public.players WHERE user_id = auth.uid()
      )
    )
    OR
    -- Coach can see teams in their organization
    EXISTS (
      SELECT 1 FROM public.coaches
      WHERE coaches.user_id = auth.uid()
      AND coaches.organization_id = teams.organization_id
    )
  );

-- GOLF_TEAMS TABLE - Same pattern
ALTER TABLE public.golf_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their golf teams" ON public.golf_teams;
CREATE POLICY "Users can view their golf teams" ON public.golf_teams
  FOR SELECT
  USING (
    -- Golf coach can see their team
    EXISTS (
      SELECT 1 FROM public.golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
    OR
    -- Golf player can see their team
    EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.user_id = auth.uid()
      AND golf_players.team_id = golf_teams.id
    )
  );

DROP POLICY IF EXISTS "Golf coaches can insert teams" ON public.golf_teams;
CREATE POLICY "Golf coaches can insert teams" ON public.golf_teams
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

DROP POLICY IF EXISTS "Golf coaches can update their team" ON public.golf_teams;
CREATE POLICY "Golf coaches can update their team" ON public.golf_teams
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

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.players TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_players TO authenticated;
GRANT SELECT, INSERT ON public.organizations TO authenticated;
GRANT SELECT, INSERT ON public.golf_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_teams TO authenticated;

-- Add comments
COMMENT ON POLICY "Users can read own data" ON public.users IS
  'Allows users to read their own user record';

COMMENT ON POLICY "Anyone can view coach profiles" ON public.coaches IS
  'Public visibility for coach discovery features';

COMMENT ON POLICY "Coaches can view all players" ON public.players IS
  'Allows coaches to discover and recruit players';
