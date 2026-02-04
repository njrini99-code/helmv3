-- ============================================================================
-- Migration: fix_golf_rls_recursion_final
-- Completely fix RLS infinite recursion between golf_players and golf_team_members
--
-- Strategy:
-- 1. Create SECURITY DEFINER helper functions that bypass RLS
-- 2. Simplify golf_players_select to only check user_id for self-access
-- 3. Use SECURITY DEFINER functions for cross-table checks
-- ============================================================================

-- Step 1: Create a SECURITY DEFINER function to get the current user's player_id
-- This bypasses RLS and can be used safely in policies
CREATE OR REPLACE FUNCTION get_current_golf_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM golf_players WHERE user_id = auth.uid() LIMIT 1
$$;

-- Step 2: Create a SECURITY DEFINER function to check if user is a player on a team
CREATE OR REPLACE FUNCTION user_is_golf_team_member(check_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_team_members gtm
    WHERE gtm.team_id = check_team_id
    AND gtm.player_id = get_current_golf_player_id()
    AND gtm.status = 'active'
  )
$$;

-- Step 3: Create a SECURITY DEFINER function to check if user is a coach for a player
CREATE OR REPLACE FUNCTION user_is_coach_of_golf_player(check_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_coaches gc
    JOIN golf_teams gt ON gt.organization_id = gc.organization_id
    JOIN golf_team_members gtm ON gtm.team_id = gt.id
    WHERE gc.user_id = auth.uid()
    AND gtm.player_id = check_player_id
  )
$$;

-- Step 4: Drop ALL problematic SELECT policies on golf_team_members
DROP POLICY IF EXISTS "Players can view team membership" ON golf_team_members;
DROP POLICY IF EXISTS "Players can view their own membership" ON golf_team_members;
DROP POLICY IF EXISTS "golf_team_members_select" ON golf_team_members;
DROP POLICY IF EXISTS "golf_team_members_select_own_team" ON golf_team_members;

-- Step 5: Drop and recreate golf_players_select with a simple non-recursive policy
DROP POLICY IF EXISTS golf_players_select ON golf_players;

-- Simple policy: users can see their own record (no cross-table joins in the policy itself)
-- Coaches use SECURITY DEFINER function that bypasses RLS
CREATE POLICY golf_players_select ON golf_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR user_is_coach_of_golf_player(id)
  );

-- Step 6: Create a simple SELECT policy on golf_team_members using SECURITY DEFINER functions
CREATE POLICY golf_team_members_select_v3 ON golf_team_members
  FOR SELECT TO authenticated
  USING (
    -- Coaches can view via existing is_golf_team_coach function
    is_golf_team_coach(team_id)
    -- Players can view their team membership
    OR user_is_golf_team_member(team_id)
  );

-- Step 7: Fix the "Players can leave teams" DELETE policy to use SECURITY DEFINER
DROP POLICY IF EXISTS "Players can leave teams" ON golf_team_members;

CREATE POLICY "Players can leave teams" ON golf_team_members
  FOR DELETE TO authenticated
  USING (player_id = get_current_golf_player_id());
