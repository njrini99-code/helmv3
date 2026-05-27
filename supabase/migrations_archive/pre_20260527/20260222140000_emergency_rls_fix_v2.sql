-- ============================================================================
-- Migration: 20260222140000_emergency_rls_fix_v2.sql
-- Purpose: Fix all remaining HTTP 500 errors on baseball tables
-- Root causes found:
--   1. baseball_conversation_participants: "baseball_participants_select_in_conversation"
--      policy (from 044_fix_messaging_rls.sql) is RECURSIVE (queries same table without
--      SECURITY DEFINER bypass). Was not dropped by the previous fix migration.
--   2. baseball_players: "baseball_players_select" policy references get_my_player_id()
--      and get_my_coach_id() which were never applied to production.
--      (defined only in 20260125000000_fix_baseball_rls_comprehensive.sql which is pending)
--   3. baseball_watchlists: 500s cascade from baseball_players join failing
-- ============================================================================

-- ============================================================================
-- PART 1: Define missing helper functions (SECURITY DEFINER = bypass RLS)
-- ============================================================================

-- get_my_coach_id(): returns the baseball_coaches.id for the current user
CREATE OR REPLACE FUNCTION get_my_coach_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- get_my_player_id(): returns the baseball_players.id for the current user
CREATE OR REPLACE FUNCTION get_my_player_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- PART 2: Fix baseball_conversation_participants
--   Drop ALL SELECT policies and recreate ONE clean non-recursive policy
-- ============================================================================

-- Drop the recursive policy from 044_fix_messaging_rls.sql
DROP POLICY IF EXISTS "baseball_participants_select_in_conversation" ON baseball_conversation_participants;

-- Also drop any legacy policies that might conflict
DROP POLICY IF EXISTS "Users can view baseball conversation participants" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_participants_select_own" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_conversation_participants_select" ON baseball_conversation_participants;

-- Recreate: simple non-recursive policy. User sees their own rows, plus rows in
-- conversations they participate in (via SECURITY DEFINER function to break recursion).
CREATE POLICY "baseball_conversation_participants_select" ON baseball_conversation_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR conversation_id IN (SELECT get_my_baseball_conversation_ids())
);

-- ============================================================================
-- PART 3: Fix baseball_players_select
--   The policy references get_my_player_id() and get_my_coach_id() which now exist.
--   Drop and recreate to ensure clean state.
-- ============================================================================

DROP POLICY IF EXISTS "baseball_players_select" ON baseball_players;
CREATE POLICY "baseball_players_select" ON baseball_players
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()           -- Own profile always visible
  OR recruiting_activated = true  -- Recruiting-activated profiles visible to coaches
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
-- PART 4: Fix baseball_watchlists if needed
--   The watchlist query was 500ing because it joins baseball_players(*) which was broken.
--   After fixing baseball_players_select, watchlists should work.
--   But ensure the watchlists policy itself is sane too.
-- ============================================================================

DROP POLICY IF EXISTS "baseball_watchlists_select" ON baseball_watchlists;
CREATE POLICY "baseball_watchlists_select" ON baseball_watchlists
FOR SELECT TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- Done. All three 500-causing issues resolved.
-- ============================================================================
