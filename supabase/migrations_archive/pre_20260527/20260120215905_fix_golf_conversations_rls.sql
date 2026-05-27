-- ============================================================================
-- Migration: Fix Golf Conversations RLS Policies
-- ============================================================================
-- Problem: The existing RLS policies reference non-existent columns:
--   - golf_coaches.team_id (doesn't exist - coaches have organization_id)
--   - golf_players.team_id (doesn't exist - players link via golf_team_members)
-- ============================================================================

-- ============================================================================
-- PART 1: DROP BROKEN POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_conversations_select_team" ON golf_conversations;
DROP POLICY IF EXISTS "golf_conversations_insert_team" ON golf_conversations;

-- ============================================================================
-- PART 2: CREATE CORRECTED SELECT POLICY
-- ============================================================================
-- Users can view conversations where:
-- 1. They are a participant in the conversation, OR
-- 2. The conversation's team_id matches their team (coach via org, player via team_members)

CREATE POLICY "golf_conversations_select_accessible"
ON golf_conversations FOR SELECT TO authenticated
USING (
  -- User is a participant in this conversation
  id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
  OR
  -- Conversation belongs to user's team
  team_id IN (
    -- Coach's team (via organization)
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
    UNION
    -- Player's team (via team_members)
    SELECT gtm.team_id FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gp.user_id = auth.uid() AND gtm.status = 'active'
  )
  OR
  -- Null team_id (DM conversations without team context)
  team_id IS NULL
);

-- ============================================================================
-- PART 3: CREATE CORRECTED INSERT POLICY
-- ============================================================================
-- Users can create conversations if:
-- 1. team_id is null (1:1 conversations), OR
-- 2. team_id matches their team

CREATE POLICY "golf_conversations_insert_accessible"
ON golf_conversations FOR INSERT TO authenticated
WITH CHECK (
  -- Allow null team_id for direct messages
  team_id IS NULL
  OR
  -- Team conversation - user must be on that team
  team_id IN (
    -- Coach's team (via organization)
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
    UNION
    -- Player's team (via team_members)
    SELECT gtm.team_id FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gp.user_id = auth.uid() AND gtm.status = 'active'
  )
);

-- ============================================================================
-- PART 4: ADD UPDATE POLICY (for updated_at)
-- ============================================================================

DROP POLICY IF EXISTS "golf_conversations_update_participant" ON golf_conversations;

CREATE POLICY "golf_conversations_update_participant"
ON golf_conversations FOR UPDATE TO authenticated
USING (
  id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
)
WITH CHECK (
  id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON POLICY "golf_conversations_select_accessible" ON golf_conversations IS
  'Users can view conversations they participate in or that belong to their team';
COMMENT ON POLICY "golf_conversations_insert_accessible" ON golf_conversations IS
  'Users can create conversations without team_id or with their team_id';
COMMENT ON POLICY "golf_conversations_update_participant" ON golf_conversations IS
  'Participants can update conversations (e.g., updated_at timestamp)';
