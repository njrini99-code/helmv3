-- ============================================================================
-- Migration: 20260204000000_fix_golf_team_join_rls.sql
-- Purpose: Fix RLS policy to allow players to join teams
--
-- ISSUE: The existing policy "Golf coaches can manage team members" only allows
-- coaches to INSERT into golf_team_members. Players trying to join a team via
-- the join code cannot insert their own membership record.
--
-- SOLUTION: Add an INSERT policy that allows authenticated players to join teams
-- when they have a valid golf_players record.
-- ============================================================================

-- Drop existing policy if we need to recreate it
-- (The existing "Golf coaches can manage team members" is FOR ALL, so it handles
-- coaches but not players)

-- Add policy allowing players to insert themselves into teams
CREATE POLICY "Players can join teams" ON golf_team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Player can only insert a record for themselves
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = player_id
        AND gp.user_id = auth.uid()
    )
    -- Additional check: team must exist and have a valid join_code
    AND EXISTS (
      SELECT 1 FROM golf_teams gt
      WHERE gt.id = team_id
        AND gt.join_code IS NOT NULL
    )
  );

-- Add policy allowing players to view their own team membership
-- (This supplements the coach SELECT policy)
CREATE POLICY "Players can view their own membership" ON golf_team_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = player_id
        AND gp.user_id = auth.uid()
    )
  );

-- Add policy allowing players to leave teams (delete their own membership)
CREATE POLICY "Players can leave teams" ON golf_team_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = player_id
        AND gp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Players can join teams" ON golf_team_members IS
  'Allows authenticated players to insert their own membership record when joining a team via join code';

COMMENT ON POLICY "Players can view their own membership" ON golf_team_members IS
  'Allows players to see their own team membership record';

COMMENT ON POLICY "Players can leave teams" ON golf_team_members IS
  'Allows players to delete their own membership record when leaving a team';
