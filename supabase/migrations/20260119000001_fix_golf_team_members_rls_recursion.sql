-- ============================================================================
-- Migration: Fix golf_team_members RLS infinite recursion
-- The previous migration created policies that query golf_team_members
-- from within policies on golf_team_members, causing infinite recursion.
-- ============================================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "golf_team_members_select_own_team" ON golf_team_members;
DROP POLICY IF EXISTS "golf_team_members_select_coach" ON golf_team_members;

-- ============================================================================
-- Create SECURITY DEFINER helper functions to bypass RLS
-- ============================================================================

-- Function to get team IDs for the current user (as a player)
CREATE OR REPLACE FUNCTION get_user_golf_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT gtm.team_id
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
    AND gtm.status = 'active';
$$;

-- Function to get organization ID for the current user (as a coach)
CREATE OR REPLACE FUNCTION get_user_golf_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT gc.organization_id
  FROM golf_coaches gc
  WHERE gc.user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================================
-- Create safe RLS policies using the helper functions
-- ============================================================================

-- Players can view members of their own team(s)
CREATE POLICY "golf_team_members_select_own_team" ON golf_team_members
FOR SELECT TO authenticated
USING (
  team_id IN (SELECT get_user_golf_team_ids())
);

-- Coaches can view members of teams in their organization
CREATE POLICY "golf_team_members_select_coach" ON golf_team_members
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM golf_teams gt
    WHERE gt.id = golf_team_members.team_id
      AND gt.organization_id = get_user_golf_organization_id()
  )
);
