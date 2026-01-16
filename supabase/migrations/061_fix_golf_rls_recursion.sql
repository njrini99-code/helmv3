-- Migration: Fix Golf RLS Infinite Recursion
-- This migration fixes infinite recursion issues in golf RLS policies
-- that were caused by policies referencing tables with their own RLS

-- ============================================================================
-- 1. Make helper functions use SECURITY DEFINER to bypass RLS
-- ============================================================================

-- The is_golf_team_player function was causing infinite recursion because:
-- - golf_players_select policy calls is_golf_team_player()
-- - is_golf_team_player() queries golf_players
-- - This triggers golf_players_select policy again → infinite loop
--
-- SECURITY DEFINER makes the function run with owner privileges, bypassing RLS

ALTER FUNCTION is_golf_team_player(uuid) SECURITY DEFINER;
ALTER FUNCTION is_golf_team_player(uuid) SET search_path = public;

ALTER FUNCTION is_golf_team_coach(uuid) SECURITY DEFINER;
ALTER FUNCTION is_golf_team_coach(uuid) SET search_path = public;

-- ============================================================================
-- 2. Remove problematic policies that bypass SECURITY DEFINER functions
-- ============================================================================

-- This policy directly queried golf_players without using the SECURITY DEFINER
-- functions, causing recursion even after the function fix
DROP POLICY IF EXISTS "Team members view own roster" ON golf_team_members;

-- ============================================================================
-- 3. Add policy for team join flow
-- ============================================================================

-- Allow authenticated users to look up teams by join_code
-- This is needed because players need to see team info BEFORE joining
-- (when they're not yet a team member)
DROP POLICY IF EXISTS "golf_teams_select_by_join_code" ON golf_teams;

CREATE POLICY "golf_teams_select_by_join_code" ON golf_teams
FOR SELECT
TO authenticated
USING (join_code IS NOT NULL);
