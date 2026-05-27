-- ============================================================================
-- Migration: 20260222120000_fix_head_coach_id_rls.sql
-- Purpose: Fix all RLS policies and functions that reference baseball_teams.head_coach_id
-- Root cause: The baseball_teams table does NOT have a head_coach_id column.
--   Coach-team relationships are managed via baseball_team_coach_staff (coach_id, team_id, is_primary).
-- Impact: Fixes HTTP 500 on baseball_players, baseball_watchlists, and recursive RLS loops.
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (must be defined first; policies below reference them)
-- ============================================================================

-- Fix is_baseball_team_coach(): old version used t.head_coach_id which doesn't exist.
-- Keep original parameter name p_team_id from 20260125000000_fix_baseball_rls_comprehensive.sql
-- (postgres requires CREATE OR REPLACE FUNCTION to keep the same parameter name).
CREATE OR REPLACE FUNCTION is_baseball_team_coach(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = p_team_id
    AND tcs.coach_id = get_my_coach_id()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- New helper: checks if current coach is primary coach of a given team.
-- SECURITY DEFINER prevents recursive RLS when policies on baseball_team_coach_staff
-- query baseball_team_coach_staff themselves.
CREATE OR REPLACE FUNCTION is_baseball_primary_coach(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
    AND coach_id = get_my_coach_id()
    AND is_primary = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- New helper: get all conversation_ids the current user participates in.
-- SECURITY DEFINER breaks the recursive RLS on baseball_conversation_participants.
CREATE OR REPLACE FUNCTION get_my_baseball_conversation_ids()
RETURNS SETOF UUID AS $$
  SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- 1. Fix baseball_players_select policy
--    Old: included UNION branch "SELECT t.id FROM baseball_teams t WHERE t.head_coach_id = get_my_coach_id()"
--    This column doesn't exist → PostgreSQL error → HTTP 500 on every player query.
--    Fix: remove that branch; the coach-staff branch already covers the same teams.
-- ============================================================================
DROP POLICY IF EXISTS "baseball_players_select" ON baseball_players;
CREATE POLICY "baseball_players_select" ON baseball_players
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()           -- Own profile always visible
  OR recruiting_activated = true  -- Recruiting-activated profiles visible to all coaches
  OR id IN (                      -- Same team as viewer (player or coach)
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE tm.team_id IN (
      -- Teams where the viewer is a player
      SELECT tm2.team_id FROM baseball_team_members tm2 WHERE tm2.player_id = get_my_player_id()
      UNION
      -- Teams where the viewer is a coach (head or staff)
      SELECT tcs.team_id FROM baseball_team_coach_staff tcs WHERE tcs.coach_id = get_my_coach_id()
    )
  )
);

-- ============================================================================
-- 2. Fix baseball_teams UPDATE/DELETE policies
--    Old: USING (head_coach_id = get_my_coach_id()) — column doesn't exist.
--    New: use is_baseball_primary_coach() SECURITY DEFINER helper.
-- ============================================================================
DROP POLICY IF EXISTS "baseball_teams_update" ON baseball_teams;
CREATE POLICY "baseball_teams_update" ON baseball_teams
FOR UPDATE TO authenticated
USING (is_baseball_primary_coach(id))
WITH CHECK (is_baseball_primary_coach(id));

DROP POLICY IF EXISTS "baseball_teams_delete" ON baseball_teams;
CREATE POLICY "baseball_teams_delete" ON baseball_teams
FOR DELETE TO authenticated
USING (is_baseball_primary_coach(id));

-- ============================================================================
-- 3. Fix baseball_team_coach_staff INSERT/UPDATE/DELETE policies
--    Old: EXISTS (SELECT 1 FROM baseball_teams WHERE id = team_id AND head_coach_id = ...)
--    New: use is_baseball_primary_coach() — SECURITY DEFINER prevents recursive RLS.
-- ============================================================================
DROP POLICY IF EXISTS "baseball_team_coach_staff_insert" ON baseball_team_coach_staff;
CREATE POLICY "baseball_team_coach_staff_insert" ON baseball_team_coach_staff
FOR INSERT TO authenticated
WITH CHECK (is_baseball_primary_coach(team_id));

DROP POLICY IF EXISTS "baseball_team_coach_staff_update" ON baseball_team_coach_staff;
CREATE POLICY "baseball_team_coach_staff_update" ON baseball_team_coach_staff
FOR UPDATE TO authenticated
USING (is_baseball_primary_coach(team_id));

DROP POLICY IF EXISTS "baseball_team_coach_staff_delete" ON baseball_team_coach_staff;
CREATE POLICY "baseball_team_coach_staff_delete" ON baseball_team_coach_staff
FOR DELETE TO authenticated
USING (is_baseball_primary_coach(team_id));

-- ============================================================================
-- 4. Fix baseball_conversation_participants_select — recursive RLS causes HTTP 500
--    Old: USING (conversation_id IN (SELECT conversation_id FROM baseball_conversation_participants ...))
--    This is self-referential RLS → infinite recursion → 500 error on every call.
--    Fix: use get_my_baseball_conversation_ids() SECURITY DEFINER function.
-- ============================================================================
DROP POLICY IF EXISTS "baseball_conversation_participants_select" ON baseball_conversation_participants;
CREATE POLICY "baseball_conversation_participants_select" ON baseball_conversation_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR conversation_id IN (SELECT get_my_baseball_conversation_ids())
);

-- ============================================================================
-- 5. Add engagement_date column to baseball_player_engagement_events (if missing)
--    Code and older migrations reference this column but it may not exist in DB.
--    Add as GENERATED column aliasing created_at for full backward compatibility.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_player_engagement_events'
    AND column_name = 'engagement_date'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE baseball_player_engagement_events
      ADD COLUMN engagement_date TIMESTAMPTZ GENERATED ALWAYS AS (created_at) STORED;
  END IF;
END $$;

-- Indexes for engagement queries (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_date
  ON baseball_player_engagement_events(engagement_date DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_coach_type_date
  ON baseball_player_engagement_events(coach_id, engagement_type, engagement_date DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_player_type_date
  ON baseball_player_engagement_events(player_id, engagement_type, engagement_date DESC);
