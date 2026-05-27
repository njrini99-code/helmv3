-- ============================================================================
-- Migration: 042_sport_specific_messaging_tables.sql
-- Purpose: Create sport-specific messaging and missing tables
-- This creates baseball_* and golf_* specific tables for better separation
-- ============================================================================

-- ============================================================================
-- PART 1: BASEBALL MESSAGING TABLES
-- ============================================================================

-- Baseball Conversations
-- created_by was originally declared TEXT here but prod was dashboard-
-- altered to UUID (REFERENCES users(id)) so RLS policies in 044 can do
-- created_by = auth.uid(). Declare it as UUID upfront so a fresh stack
-- matches prod and 044's policies apply cleanly. IF NOT EXISTS means
-- this is a no-op on prod where the table already exists with UUID.
CREATE TABLE IF NOT EXISTS baseball_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  title TEXT,
  is_team_chat BOOLEAN DEFAULT FALSE,
  team_id UUID REFERENCES baseball_teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_conversations_team ON baseball_conversations(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_baseball_conversations_created ON baseball_conversations(created_at DESC);

-- Baseball Conversation Participants
CREATE TABLE IF NOT EXISTS baseball_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES baseball_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_conv_participants_conv ON baseball_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_baseball_conv_participants_user ON baseball_conversation_participants(user_id);

-- Baseball Messages
CREATE TABLE IF NOT EXISTS baseball_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES baseball_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_messages_conversation ON baseball_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_baseball_messages_sender ON baseball_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_baseball_messages_unread ON baseball_messages(conversation_id, read) WHERE read = FALSE;

-- Triggers for baseball messaging
CREATE TRIGGER update_baseball_conversations_updated_at
  BEFORE UPDATE ON baseball_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 2: BASEBALL RLS POLICIES FOR MESSAGING
-- ============================================================================

ALTER TABLE baseball_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can see conversations they're part of
CREATE POLICY "Users can view their baseball conversations" ON baseball_conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_conversation_participants cp
      WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
    )
  );

-- Conversations: Authenticated users can create conversations
CREATE POLICY "Users can create baseball conversations" ON baseball_conversations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Participants: Users can view participants of their conversations
CREATE POLICY "Users can view baseball conversation participants" ON baseball_conversation_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_conversation_participants my_part
      WHERE my_part.conversation_id = conversation_id AND my_part.user_id = auth.uid()
    )
  );

-- Participants: Users can add participants to conversations they created
CREATE POLICY "Users can add baseball conversation participants" ON baseball_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Participants: Users can update their own read status
CREATE POLICY "Users can update their baseball participant record" ON baseball_conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Messages: Users can view messages in their conversations
CREATE POLICY "Users can view baseball messages" ON baseball_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_conversation_participants cp
      WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    )
  );

-- Messages: Users can send messages to conversations they're part of
CREATE POLICY "Users can send baseball messages" ON baseball_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM baseball_conversation_participants cp
      WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    )
  );

-- Messages: Users can update read status of messages in their conversations
CREATE POLICY "Users can update baseball message read status" ON baseball_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_conversation_participants cp
      WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3: GOLF TEAM MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'player' CHECK (role IN ('player', 'captain', 'assistant_captain')),
  jersey_number TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'injured', 'redshirt')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_team_members_team ON golf_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_team_members_player ON golf_team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_team_members_status ON golf_team_members(status);

-- Trigger for golf_team_members
CREATE TRIGGER update_golf_team_members_updated_at
  BEFORE UPDATE ON golf_team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for golf_team_members
ALTER TABLE golf_team_members ENABLE ROW LEVEL SECURITY;

-- Team members are viewable by authenticated users
CREATE POLICY "Authenticated users can view golf team members" ON golf_team_members
  FOR SELECT TO authenticated
  USING (true);

-- Coaches can manage team members
CREATE POLICY "Golf coaches can manage team members" ON golf_team_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.id = golf_team_members.team_id
      WHERE gc.user_id = auth.uid() AND gc.organization_id = gt.organization_id
    )
  );

-- ============================================================================
-- PART 4: GOLF CALENDAR NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_calendar_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('reminder', 'update', 'cancellation', 'rsvp_request')),
  message TEXT,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_golf_calendar_notifications_event ON golf_calendar_notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_notifications_user ON golf_calendar_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_notifications_unread ON golf_calendar_notifications(user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE golf_calendar_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their golf calendar notifications" ON golf_calendar_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can create golf calendar notifications" ON golf_calendar_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their golf notifications" ON golf_calendar_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- PART 5: GOLF PLAYER ATTENDANCE STATS
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_player_attendance_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_events INTEGER DEFAULT 0,
  attended_events INTEGER DEFAULT 0,
  excused_absences INTEGER DEFAULT 0,
  unexcused_absences INTEGER DEFAULT 0,
  attendance_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, team_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_golf_player_attendance_stats_player ON golf_player_attendance_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_attendance_stats_team ON golf_player_attendance_stats(team_id);

ALTER TABLE golf_player_attendance_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view golf attendance stats" ON golf_player_attendance_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.id = golf_player_attendance_stats.team_id
      WHERE gc.user_id = auth.uid() AND gc.organization_id = gt.organization_id
    )
  );

CREATE POLICY "Players can view their own attendance stats" ON golf_player_attendance_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.user_id = auth.uid() AND gp.id = golf_player_attendance_stats.player_id
    )
  );

-- ============================================================================
-- PART 6: GOLF CALENDAR SYNC TABLES
-- ============================================================================

-- Calendar Sync State
CREATE TABLE IF NOT EXISTS golf_calendar_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'caldav')),
  external_calendar_id TEXT,
  sync_token TEXT,
  last_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction TEXT DEFAULT 'both' CHECK (sync_direction IN ('import', 'export', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_golf_calendar_sync_state_user ON golf_calendar_sync_state(user_id);

ALTER TABLE golf_calendar_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their golf calendar sync state" ON golf_calendar_sync_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Calendar Sync Log
CREATE TABLE IF NOT EXISTS golf_calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_state_id UUID REFERENCES golf_calendar_sync_state(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'partial')),
  events_synced INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_calendar_sync_log_user ON golf_calendar_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_sync_log_state ON golf_calendar_sync_log(sync_state_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_sync_log_created ON golf_calendar_sync_log(created_at DESC);

ALTER TABLE golf_calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their golf sync logs" ON golf_calendar_sync_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can create golf sync logs" ON golf_calendar_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 7: GOLF PLAYER COURSES (Player's home/favorite courses)
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_player_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  course_id UUID REFERENCES golf_courses(id) ON DELETE SET NULL,
  course_name TEXT, -- Fallback if course not in our database
  relationship TEXT DEFAULT 'played' CHECK (relationship IN ('home', 'frequent', 'played', 'favorite')),
  rounds_played INTEGER DEFAULT 0,
  best_score INTEGER,
  average_score DECIMAL(5,2),
  last_played_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_player_courses_player ON golf_player_courses(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_courses_course ON golf_player_courses(course_id);

ALTER TABLE golf_player_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their golf courses" ON golf_player_courses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.user_id = auth.uid() AND gp.id = golf_player_courses.player_id
    )
  );

CREATE POLICY "Coaches can view player courses" ON golf_player_courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      WHERE gc.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8: RPC FUNCTION FOR BASEBALL CONVERSATIONS
-- ============================================================================

-- Function to get conversations with details for a user
CREATE OR REPLACE FUNCTION get_baseball_conversations_with_details(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  creator_id TEXT,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender_id UUID,
  unread_count BIGINT,
  participant_ids UUID[],
  participant_names TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by AS creator_id,
    (
      SELECT m.content FROM baseball_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_content,
    (
      SELECT m.created_at FROM baseball_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_at,
    (
      SELECT m.sender_id FROM baseball_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_sender_id,
    (
      SELECT COUNT(*) FROM baseball_messages m
      WHERE m.conversation_id = c.id
        AND m.read = FALSE
        AND m.sender_id != p_user_id
    ) AS unread_count,
    ARRAY(
      SELECT cp2.user_id FROM baseball_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_ids,
    ARRAY(
      SELECT COALESCE(u.email, 'Unknown')
      FROM baseball_conversation_participants cp2
      JOIN users u ON u.id = cp2.user_id
      WHERE cp2.conversation_id = c.id
    ) AS participant_names
  FROM baseball_conversations c
  JOIN baseball_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Done! Sport-specific tables created
-- ============================================================================

COMMENT ON TABLE baseball_conversations IS 'Baseball-specific conversations between coaches and players';
COMMENT ON TABLE baseball_messages IS 'Messages within baseball conversations';
COMMENT ON TABLE golf_team_members IS 'Golf team roster membership';
COMMENT ON TABLE golf_calendar_notifications IS 'Notifications for golf calendar events';
COMMENT ON TABLE golf_player_attendance_stats IS 'Aggregated attendance statistics for golf players';
COMMENT ON TABLE golf_calendar_sync_state IS 'External calendar sync configuration';
COMMENT ON TABLE golf_calendar_sync_log IS 'Log of calendar sync operations';
COMMENT ON TABLE golf_player_courses IS 'Player favorite/played golf courses';
