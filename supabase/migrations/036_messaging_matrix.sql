-- ============================================================================
-- Messaging Matrix Implementation
-- Enforces who can message whom based on coach type, player type, and roster
-- ============================================================================

-- ============================================================================
-- Add columns to conversations for scoping
-- ============================================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS sport VARCHAR(20) CHECK (sport IN ('baseball', 'golf')),
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS golf_team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_sport ON conversations(sport);
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_golf_team ON conversations(golf_team_id) WHERE golf_team_id IS NOT NULL;

-- ============================================================================
-- Helper function: Check if user is coach
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_coach_type(user_uuid UUID)
RETURNS coach_type AS $$
  SELECT coach_type FROM coaches WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Helper function: Check if user is player
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_player_type(user_uuid UUID)
RETURNS player_type AS $$
  SELECT player_type FROM players WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Helper function: Check if player has recruiting activated
-- ============================================================================

CREATE OR REPLACE FUNCTION is_player_recruiting_active(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(recruiting_activated, FALSE) FROM players WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Helper function: Check if two users are on same roster (HS or Showcase team)
-- ============================================================================

CREATE OR REPLACE FUNCTION are_users_on_same_roster(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user1_is_coach BOOLEAN;
  user2_is_coach BOOLEAN;
  user1_coach_id UUID;
  user2_coach_id UUID;
  user1_player_id UUID;
  user2_player_id UUID;
BEGIN
  -- Get coach IDs
  SELECT id INTO user1_coach_id FROM coaches WHERE user_id = user1;
  SELECT id INTO user2_coach_id FROM coaches WHERE user_id = user2;

  -- Get player IDs
  SELECT id INTO user1_player_id FROM players WHERE user_id = user1;
  SELECT id INTO user2_player_id FROM players WHERE user_id = user2;

  -- Check if they share a team via team_members or team_coach_staff
  RETURN EXISTS (
    -- Both are players on same team
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.player_id = user1_player_id
    AND tm2.player_id = user2_player_id
    AND tm1.status = 'active'
    AND tm2.status = 'active'
  )
  OR EXISTS (
    -- User1 is coach, User2 is player on their team
    SELECT 1 FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE (t.head_coach_id = user1_coach_id OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = user1_coach_id
    ))
    AND tm.player_id = user2_player_id
    AND tm.status = 'active'
  )
  OR EXISTS (
    -- User2 is coach, User1 is player on their team
    SELECT 1 FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE (t.head_coach_id = user2_coach_id OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = user2_coach_id
    ))
    AND tm.player_id = user1_player_id
    AND tm.status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Helper function: Check if users on same golf team
-- ============================================================================

CREATE OR REPLACE FUNCTION are_users_on_same_golf_team(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user1_team_id UUID;
  user2_team_id UUID;
BEGIN
  -- Get golf team IDs for each user (could be coach or player)
  SELECT COALESCE(
    (SELECT team_id FROM golf_coaches WHERE user_id = user1),
    (SELECT team_id FROM golf_players WHERE user_id = user1)
  ) INTO user1_team_id;

  SELECT COALESCE(
    (SELECT team_id FROM golf_coaches WHERE user_id = user2),
    (SELECT team_id FROM golf_players WHERE user_id = user2)
  ) INTO user2_team_id;

  -- Same team and both have a team
  RETURN user1_team_id IS NOT NULL
    AND user2_team_id IS NOT NULL
    AND user1_team_id = user2_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Main function: Can user1 message user2?
-- ============================================================================

CREATE OR REPLACE FUNCTION can_users_message(sender_uuid UUID, recipient_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sender_coach_type coach_type;
  sender_player_type player_type;
  recipient_coach_type coach_type;
  recipient_player_type player_type;
  sender_is_coach BOOLEAN;
  sender_is_player BOOLEAN;
  recipient_is_coach BOOLEAN;
  recipient_is_player BOOLEAN;
  recipient_recruiting_active BOOLEAN;
BEGIN
  -- Get sender info
  sender_coach_type := get_user_coach_type(sender_uuid);
  sender_player_type := get_user_player_type(sender_uuid);
  sender_is_coach := sender_coach_type IS NOT NULL;
  sender_is_player := sender_player_type IS NOT NULL;

  -- Get recipient info
  recipient_coach_type := get_user_coach_type(recipient_uuid);
  recipient_player_type := get_user_player_type(recipient_uuid);
  recipient_is_coach := recipient_coach_type IS NOT NULL;
  recipient_is_player := recipient_player_type IS NOT NULL;
  recipient_recruiting_active := is_player_recruiting_active(recipient_uuid);

  -- ============================================
  -- GOLF: Team-scoped only
  -- ============================================
  -- If either user is in golf system, they must be on same team
  IF EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = recipient_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = recipient_uuid)
  THEN
    RETURN are_users_on_same_golf_team(sender_uuid, recipient_uuid);
  END IF;

  -- ============================================
  -- BASEBALL: Complex matrix
  -- ============================================

  -- RULE: All coaches can message each other (any type to any type)
  IF sender_is_coach AND recipient_is_coach THEN
    RETURN TRUE;
  END IF;

  -- RULE: College coaches can message any activated player (HS, JUCO, Showcase)
  IF sender_is_coach AND sender_coach_type = 'college' AND recipient_is_player THEN
    IF recipient_player_type = 'college' THEN
      -- College player requires subscription (handled at app layer, allow here)
      RETURN TRUE;
    ELSE
      -- HS, JUCO, Showcase players need recruiting active
      RETURN recipient_recruiting_active;
    END IF;
  END IF;

  -- RULE: JUCO coaches can message HS and Showcase players (activated), and their own roster
  IF sender_is_coach AND sender_coach_type = 'juco' AND recipient_is_player THEN
    IF recipient_player_type IN ('high_school', 'showcase') THEN
      RETURN recipient_recruiting_active;
    ELSIF recipient_player_type = 'juco' THEN
      -- Own roster only
      RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  -- RULE: HS coaches can only message their own roster
  IF sender_is_coach AND sender_coach_type = 'high_school' AND recipient_is_player THEN
    RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
  END IF;

  -- RULE: Showcase coaches can only message their own roster
  IF sender_is_coach AND sender_coach_type = 'showcase' AND recipient_is_player THEN
    RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
  END IF;

  -- RULE: Players can message coaches they're allowed to message (reverse of above)
  IF sender_is_player AND recipient_is_coach THEN
    -- Player must have recruiting activated to message any coach
    IF NOT is_player_recruiting_active(sender_uuid) THEN
      RETURN FALSE;
    END IF;

    -- HS/Showcase players can message college, juco, showcase coaches
    IF sender_player_type IN ('high_school', 'showcase') THEN
      RETURN recipient_coach_type IN ('college', 'juco', 'showcase')
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;

    -- JUCO players can message college coaches
    IF sender_player_type = 'juco' THEN
      RETURN recipient_coach_type = 'college'
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;

    -- College players can message their own coach (with subscription, handled at app layer)
    IF sender_player_type = 'college' THEN
      RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;
  END IF;

  -- Players cannot message other players
  IF sender_is_player AND recipient_is_player THEN
    RETURN FALSE;
  END IF;

  -- Default deny
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Update conversation_participants RLS to use messaging matrix
-- ============================================================================

DROP POLICY IF EXISTS "Users can be added to conversations by participants" ON conversation_participants;

CREATE POLICY "Users can be added to valid conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Adding yourself to a new conversation you're creating
      (
        user_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
        )
      )
      OR
      -- Being added by someone who can message you
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
        AND can_users_message(cp.user_id, conversation_participants.user_id)
      )
    )
  );

-- ============================================================================
-- Update messages RLS to validate sender can message all participants
-- ============================================================================

DROP POLICY IF EXISTS "Users can send messages" ON messages;

CREATE POLICY "Users can send messages to valid conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );
