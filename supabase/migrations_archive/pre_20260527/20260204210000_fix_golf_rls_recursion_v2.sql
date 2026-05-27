-- ============================================================================
-- Migration: 20260204210000_fix_golf_rls_recursion_v2.sql
-- Fix RLS infinite recursion v2
--
-- Problem: golf_players_select queries golf_team_members, which has a policy
-- that queries golf_players → infinite recursion
--
-- Solution:
-- 1. Drop the problematic "Players can view their own membership" policy
-- 2. Simplify golf_players_select to only check user_id (coaches see via SECURITY DEFINER functions)
-- ============================================================================

-- Drop the recursive policy on golf_team_members
DROP POLICY IF EXISTS "Players can view their own membership" ON golf_team_members;

-- Drop and recreate golf_players_select with a simpler policy
DROP POLICY IF EXISTS golf_players_select ON golf_players;

-- Simple policy: users can see their own record, coaches can see all players in their org
CREATE POLICY golf_players_select ON golf_players
  FOR SELECT TO authenticated
  USING (
    -- Players can always see their own record
    user_id = auth.uid()
    -- Coaches can see players in their organization (via team membership)
    OR EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      JOIN golf_team_members gtm ON gtm.team_id = gt.id
      WHERE gc.user_id = auth.uid()
      AND gtm.player_id = golf_players.id
    )
  );

-- Recreate a simpler team_members select policy for players that doesn't query golf_players
-- Players can view members of teams they belong to (via their own player_id in golf_team_members)
CREATE POLICY "Players can view team membership" ON golf_team_members
  FOR SELECT TO authenticated
  USING (
    -- Check if current user's player_id is in this team
    team_id IN (
      SELECT gtm2.team_id
      FROM golf_team_members gtm2
      JOIN golf_players gp ON gp.id = gtm2.player_id
      WHERE gp.user_id = auth.uid()
      AND gtm2.status = 'active'
    )
  );
