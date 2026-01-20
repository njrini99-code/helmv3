-- Migration 066: Restrict golf_team_members SELECT policy
--
-- SECURITY FIX: The previous policy allowed ANY authenticated user to view
-- ALL team memberships. This migration restricts visibility to:
-- 1. Players who are members of the same team
-- 2. Coaches who manage the team (via organization)

-- ============================================================================
-- 1. Drop the overly permissive policy
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can view golf team members" ON golf_team_members;

-- ============================================================================
-- 2. Create restricted SELECT policies
-- ============================================================================

-- Players can view members of their own team(s)
CREATE POLICY "golf_team_members_select_own_team" ON golf_team_members
FOR SELECT TO authenticated
USING (
  -- User is a member of this team
  team_id IN (
    SELECT gtm.team_id
    FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gp.user_id = auth.uid()
      AND gtm.status = 'active'
  )
);

-- Coaches can view members of teams in their organization
CREATE POLICY "golf_team_members_select_coach" ON golf_team_members
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM golf_coaches gc
    JOIN golf_teams gt ON gt.organization_id = gc.organization_id
    WHERE gc.user_id = auth.uid()
      AND gt.id = golf_team_members.team_id
  )
);

-- ============================================================================
-- 3. Add comment documenting the policy
-- ============================================================================

COMMENT ON POLICY "golf_team_members_select_own_team" ON golf_team_members IS
  'Players can view roster of teams they belong to';

COMMENT ON POLICY "golf_team_members_select_coach" ON golf_team_members IS
  'Coaches can view roster of teams in their organization';
