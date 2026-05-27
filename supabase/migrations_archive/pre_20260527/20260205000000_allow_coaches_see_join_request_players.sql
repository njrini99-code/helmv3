-- ============================================================================
-- Migration: allow_coaches_see_join_request_players
-- Allow coaches to see player details for pending join requests
-- ============================================================================

-- Create a SECURITY DEFINER function to check if a player has a pending join request
-- to the coach's team
CREATE OR REPLACE FUNCTION user_has_pending_join_request_to_coach_team(check_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_join_requests jr
    JOIN golf_teams gt ON gt.id = jr.team_id
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE jr.player_id = check_player_id
    AND jr.status = 'pending'
    AND gc.user_id = auth.uid()
  )
$$;

-- Drop and recreate the golf_players_select policy to include pending join requests
DROP POLICY IF EXISTS golf_players_select ON golf_players;

CREATE POLICY golf_players_select ON golf_players
  FOR SELECT TO authenticated
  USING (
    -- Players can always see their own record
    user_id = auth.uid()
    -- Coaches can see players on their team
    OR user_is_coach_of_golf_player(id)
    -- Coaches can see players with pending join requests to their team
    OR user_has_pending_join_request_to_coach_team(id)
  );
