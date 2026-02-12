-- ============================================================================
-- Migration: Fix Security / RLS Issues (4 Fixes)
-- Date: 2026-02-12
-- ============================================================================
-- This migration addresses four security issues found during a database audit:
--   1. Conversation privacy leak: DMs visible to all authenticated users
--   2. Conversation participants: users cannot see other members in their conversations
--   3. user_is_coach_of_golf_player() missing active status filter
--   4. Coach UPDATE policies on golf_rounds/golf_holes/golf_shots missing WITH CHECK
-- ============================================================================


-- ============================================================================
-- FIX 1: Conversation Privacy Leak — All DMs Visible to Every Authenticated User
-- ============================================================================
-- SECURITY ISSUE: The golf_conversations_select_accessible policy ends with
-- `OR (team_id IS NULL)`, which allows ANY authenticated user to SELECT all
-- non-team conversations (DMs) — even if they are not a participant.
--
-- FIX: Remove the blanket `team_id IS NULL` clause. Instead, rely solely on:
--   1. User is a participant in the conversation
--   2. User is a coach on the conversation's team
--   3. User is a player on the conversation's team
-- DMs (team_id IS NULL) are now only visible to actual participants.
-- ============================================================================

DROP POLICY IF EXISTS "golf_conversations_select_accessible" ON golf_conversations;

CREATE POLICY "golf_conversations_select_accessible" ON golf_conversations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
    OR is_golf_team_coach(team_id)
    OR is_golf_team_player(team_id)
  );

COMMENT ON POLICY "golf_conversations_select_accessible" ON golf_conversations IS
  'Users can view conversations they participate in or that belong to their team. DMs require participation.';


-- ============================================================================
-- FIX 2: Conversation Participants RLS Prevents Seeing Other Members
-- ============================================================================
-- SECURITY ISSUE: The golf_participants_select_in_conversation policy (from
-- migration 044) uses:
--   USING (conversation_id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()))
--
-- We replace it with a clearer policy that explicitly covers both cases:
--   1. The row is the user's own participation record, OR
--   2. The row belongs to a conversation the user is also a participant in
--
-- This also drops the old policy name from 034 if it somehow still exists.
-- ============================================================================

DROP POLICY IF EXISTS "golf_participants_select" ON golf_conversation_participants;
DROP POLICY IF EXISTS "golf_participants_select_own" ON golf_conversation_participants;
DROP POLICY IF EXISTS "golf_participants_select_in_conversation" ON golf_conversation_participants;

CREATE POLICY "golf_participants_select" ON golf_conversation_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR conversation_id IN (
      SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "golf_participants_select" ON golf_conversation_participants IS
  'Users can see their own participation and all other participants in conversations they belong to.';


-- ============================================================================
-- FIX 3: user_is_coach_of_golf_player() Missing Status Filter
-- ============================================================================
-- SECURITY ISSUE: The function joins golf_team_members without checking
-- `gtm.status = 'active'`. After removing a player from a team, the coach
-- can still see that player's data because the membership row persists with
-- a non-active status.
--
-- FIX: Add `AND gtm.status = 'active'` to the WHERE clause so only current
-- active team memberships grant coach access to player data.
-- ============================================================================

CREATE OR REPLACE FUNCTION user_is_coach_of_golf_player(check_player_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_coaches gc
    JOIN golf_teams gt ON gt.organization_id = gc.organization_id
    JOIN golf_team_members gtm ON gtm.team_id = gt.id
    WHERE gc.user_id = auth.uid()
      AND gtm.player_id = check_player_id
      AND gtm.status = 'active'
  )
$$;

COMMENT ON FUNCTION user_is_coach_of_golf_player(uuid) IS
  'Check if the current user is a coach for the given player (active membership only).';


-- ============================================================================
-- FIX 4: Add Coach UPDATE Policies with WITH CHECK on golf_rounds,
--         golf_holes, and golf_shots
-- ============================================================================
-- SECURITY ISSUE: Coaches currently have SELECT access to their team's rounds,
-- holes, and shots (via *_select_team policies), but there are no coach UPDATE
-- policies with WITH CHECK constraints. Without WITH CHECK, a coach could
-- potentially reassign data to a different player (changing player_id to a
-- player not on their team).
--
-- FIX: Create coach UPDATE policies for all three tables with:
--   - USING: verifies the coach has access to the existing row (player is on
--     their team with active membership)
--   - WITH CHECK: verifies the player_id in the updated row still belongs to
--     an active member of the coach's team, preventing player_id reassignment
-- ============================================================================

-- --------------------------------------------------------------------------
-- 4a. golf_rounds — Coach UPDATE policy
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "golf_rounds_update_team" ON golf_rounds;

CREATE POLICY "golf_rounds_update_team" ON golf_rounds
  FOR UPDATE TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  );

COMMENT ON POLICY "golf_rounds_update_team" ON golf_rounds IS
  'Coaches can update rounds for active team members. WITH CHECK prevents player_id reassignment.';

-- --------------------------------------------------------------------------
-- 4b. golf_holes — Coach UPDATE policy
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "golf_holes_update_team" ON golf_holes;

CREATE POLICY "golf_holes_update_team" ON golf_holes
  FOR UPDATE TO authenticated
  USING (
    round_id IN (
      SELECT gr.id FROM golf_rounds gr
      JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  )
  WITH CHECK (
    round_id IN (
      SELECT gr.id FROM golf_rounds gr
      JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  );

COMMENT ON POLICY "golf_holes_update_team" ON golf_holes IS
  'Coaches can update holes for active team members rounds. WITH CHECK prevents round_id reassignment.';

-- --------------------------------------------------------------------------
-- 4c. golf_shots — Coach UPDATE policy
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "golf_shots_update_team" ON golf_shots;

CREATE POLICY "golf_shots_update_team" ON golf_shots
  FOR UPDATE TO authenticated
  USING (
    hole_id IN (
      SELECT gh.id FROM golf_holes gh
      JOIN golf_rounds gr ON gr.id = gh.round_id
      JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  )
  WITH CHECK (
    hole_id IN (
      SELECT gh.id FROM golf_holes gh
      JOIN golf_rounds gr ON gr.id = gh.round_id
      JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
      JOIN golf_teams gt ON gt.id = gtm.team_id
      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
      WHERE gc.user_id = auth.uid() AND gtm.status = 'active'
    )
  );

COMMENT ON POLICY "golf_shots_update_team" ON golf_shots IS
  'Coaches can update shots for active team members. WITH CHECK prevents hole_id reassignment.';
