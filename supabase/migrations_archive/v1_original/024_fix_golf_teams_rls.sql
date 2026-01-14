-- ============================================================================
-- FIX GOLF TEAMS RLS POLICIES
-- Migration: 024_fix_golf_teams_rls.sql
-- ============================================================================

-- Drop existing team policies
DROP POLICY IF EXISTS "Team members can view their team" ON golf_teams;
DROP POLICY IF EXISTS "Coaches can create teams" ON golf_teams;
DROP POLICY IF EXISTS "Coaches can update their team" ON golf_teams;
DROP POLICY IF EXISTS "Anyone can view team by invite code" ON golf_teams;

-- Create more permissive policies

-- Anyone authenticated can view teams (needed for onboarding and joining)
CREATE POLICY "Authenticated users can view teams"
  ON golf_teams FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can create a team (coaches create during onboarding)
CREATE POLICY "Authenticated users can create teams"
  ON golf_teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Coaches can update their own team
CREATE POLICY "Coaches can update their team"
  ON golf_teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

-- Coaches can delete their own team
CREATE POLICY "Coaches can delete their team"
  ON golf_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

-- ============================================================================
-- FIX GOLF COACHES RLS POLICIES  
-- ============================================================================

-- Drop existing coach policies
DROP POLICY IF EXISTS "Coaches can manage own profile" ON golf_coaches;
DROP POLICY IF EXISTS "Team members can view their coach" ON golf_coaches;

-- Coach can manage their own profile
CREATE POLICY "Coach manages own profile"
  ON golf_coaches FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Team members can view coaches on their team
CREATE POLICY "View team coaches"
  ON golf_coaches FOR SELECT
  TO authenticated
  USING (
    -- Can always see yourself
    user_id = auth.uid()
    OR
    -- Can see coaches on your team
    (
      team_id IS NOT NULL
      AND (
        -- You're a coach on the same team
        EXISTS (
          SELECT 1 FROM golf_coaches gc
          WHERE gc.user_id = auth.uid()
          AND gc.team_id = golf_coaches.team_id
        )
        OR
        -- You're a player on the team
        EXISTS (
          SELECT 1 FROM golf_players gp
          WHERE gp.user_id = auth.uid()
          AND gp.team_id = golf_coaches.team_id
        )
      )
    )
  );

-- ============================================================================
-- FIX GOLF ORGANIZATIONS RLS POLICIES
-- ============================================================================

-- Drop existing org policies
DROP POLICY IF EXISTS "Golf organizations viewable by authenticated users" ON golf_organizations;
DROP POLICY IF EXISTS "Coaches can create organizations" ON golf_organizations;
DROP POLICY IF EXISTS "Coaches can update own organization" ON golf_organizations;

-- Anyone authenticated can view organizations
CREATE POLICY "View organizations"
  ON golf_organizations FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can create organizations (during onboarding)
CREATE POLICY "Create organizations"
  ON golf_organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Coaches can update their organization
CREATE POLICY "Update own organization"
  ON golf_organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );
