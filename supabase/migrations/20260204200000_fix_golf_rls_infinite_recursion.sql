-- ============================================================================
-- Migration: 20260204200000_fix_golf_rls_infinite_recursion.sql
-- Purpose: Fix infinite recursion in golf_players and golf_team_members RLS
--
-- ISSUE: The RLS policies create a circular dependency:
--   1. golf_players SELECT → checks golf_team_members via is_golf_team_player()
--   2. golf_team_members SELECT → queries golf_players
--   3. is_golf_team_player() → queries golf_team_members JOIN golf_players
--   Result: Infinite recursion causing queries to fail
--
-- SOLUTION: Make helper functions use SECURITY DEFINER to bypass RLS
-- ============================================================================

-- Recreate is_golf_team_player with SECURITY DEFINER (same signature)
CREATE OR REPLACE FUNCTION is_golf_team_player(team_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
    AND gp.user_id = auth.uid()
    AND gtm.status = 'active'
  );
END;
$$;

-- Recreate is_golf_team_coach with SECURITY DEFINER (same signature)
CREATE OR REPLACE FUNCTION is_golf_team_coach(team_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
    AND gc.user_id = auth.uid()
  );
END;
$$;

-- Recreate get_user_golf_team_ids with SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_golf_team_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT gtm.team_id
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
    AND gtm.status = 'active';
END;
$$;

-- Recreate get_user_golf_organization_id with SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_golf_organization_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  SELECT gc.organization_id INTO org_id
  FROM golf_coaches gc
  WHERE gc.user_id = auth.uid()
  LIMIT 1;
  RETURN org_id;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION is_golf_team_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_golf_team_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_golf_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_golf_organization_id() TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION is_golf_team_player(uuid) IS
  'Check if current user is a player on the specified team. Uses SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON FUNCTION is_golf_team_coach(uuid) IS
  'Check if current user is a coach of the specified team. Uses SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON FUNCTION get_user_golf_team_ids() IS
  'Get all team IDs for the current user (as player). Uses SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON FUNCTION get_user_golf_organization_id() IS
  'Get the organization ID for the current user (as coach). Uses SECURITY DEFINER to avoid RLS recursion.';
