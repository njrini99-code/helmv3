-- ============================================================================
-- Migration: 025_golf_communication.sql
-- Purpose: Golf announcements and messaging
-- Consolidated from: 016_create_golf_schema.sql (communication section)
-- ============================================================================

-- Golf Announcements
CREATE TABLE IF NOT EXISTS golf_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  urgency golf_urgency_level DEFAULT 'normal',
  requires_acknowledgement BOOLEAN DEFAULT FALSE,
  send_push BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_announcements_team ON golf_announcements(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_published ON golf_announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_urgency ON golf_announcements(urgency);

-- Golf Announcement Acknowledgements
CREATE TABLE IF NOT EXISTS golf_announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_acknowledgements_announcement ON golf_announcement_acknowledgements(announcement_id);

-- Golf Conversations (team messaging)
CREATE TABLE IF NOT EXISTS golf_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT,
  is_group BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_conversations_team ON golf_conversations(team_id);

-- Golf Conversation Participants
CREATE TABLE IF NOT EXISTS golf_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES golf_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_participants_conversation ON golf_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_golf_participants_user ON golf_conversation_participants(user_id);

-- Golf Messages
CREATE TABLE IF NOT EXISTS golf_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES golf_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_messages_conversation ON golf_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_golf_messages_sender ON golf_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_golf_messages_created ON golf_messages(created_at DESC);

-- Triggers
CREATE TRIGGER update_golf_announcements_updated_at
  BEFORE UPDATE ON golf_announcements
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_conversations_updated_at
  BEFORE UPDATE ON golf_conversations
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_announcements IS 'Team announcements from coaches';
COMMENT ON TABLE golf_announcement_acknowledgements IS 'Player acknowledgements of announcements';
COMMENT ON TABLE golf_conversations IS 'Team messaging conversations';
COMMENT ON TABLE golf_messages IS 'Individual messages in conversations';
