-- ============================================================================
-- CONSOLIDATED SECURITY MIGRATIONS
-- All RLS policies and security improvements from today
-- Safe to run multiple times (uses DROP POLICY IF EXISTS)
-- ============================================================================

-- ============================================================================
-- MIGRATION 020: Profile Creation Security
-- ============================================================================

-- Enable RLS
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coaches ENABLE ROW LEVEL SECURITY;

-- Coaches Table
DROP POLICY IF EXISTS "Users can read own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON coaches;

CREATE POLICY "Users can read own coach profile" ON coaches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coach profile" ON coaches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own coach profile" ON coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Players Table
DROP POLICY IF EXISTS "Users can read own player profile" ON players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON players;
DROP POLICY IF EXISTS "Users can update own player profile" ON players;

CREATE POLICY "Users can read own player profile" ON players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player profile" ON players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player profile" ON players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Golf Coaches Table
DROP POLICY IF EXISTS "Users can read own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON golf_coaches;

CREATE POLICY "Users can read own golf coach profile" ON golf_coaches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own golf coach profile" ON golf_coaches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own golf coach profile" ON golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- MIGRATION 024: Golf Teams Security
-- ============================================================================

ALTER TABLE golf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_organizations ENABLE ROW LEVEL SECURITY;

-- Golf Teams
DROP POLICY IF EXISTS "Authenticated users can view teams" ON golf_teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON golf_teams;
DROP POLICY IF EXISTS "Coaches can update their team" ON golf_teams;
DROP POLICY IF EXISTS "Coaches can delete their team" ON golf_teams;

CREATE POLICY "Authenticated users can view teams"
  ON golf_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create teams"
  ON golf_teams FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Coaches can update their team"
  ON golf_teams FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

CREATE POLICY "Coaches can delete their team"
  ON golf_teams FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.team_id = golf_teams.id
    )
  );

-- Golf Coaches (additional policies)
DROP POLICY IF EXISTS "Coach manages own profile" ON golf_coaches;
DROP POLICY IF EXISTS "View team coaches" ON golf_coaches;

CREATE POLICY "Coach manages own profile"
  ON golf_coaches FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "View team coaches"
  ON golf_coaches FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (
      team_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM golf_coaches gc
          WHERE gc.user_id = auth.uid()
          AND gc.team_id = golf_coaches.team_id
        )
        OR
        EXISTS (
          SELECT 1 FROM golf_players gp
          WHERE gp.user_id = auth.uid()
          AND gp.team_id = golf_coaches.team_id
        )
      )
    )
  );

-- Golf Organizations
DROP POLICY IF EXISTS "View organizations" ON golf_organizations;
DROP POLICY IF EXISTS "Create organizations" ON golf_organizations;
DROP POLICY IF EXISTS "Update own organization" ON golf_organizations;

CREATE POLICY "View organizations"
  ON golf_organizations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Create organizations"
  ON golf_organizations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Update own organization"
  ON golf_organizations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );

-- ============================================================================
-- MIGRATION 033: Fix Overly Permissive RLS
-- ============================================================================

ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Profile Views
DROP POLICY IF EXISTS "Anyone can create views" ON profile_views;
DROP POLICY IF EXISTS "Authenticated users can create profile views" ON profile_views;

CREATE POLICY "Authenticated users can create profile views"
  ON profile_views FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      viewer_id = auth.uid()
      OR viewer_id IS NULL
    )
  );

-- Player Engagement Events
DROP POLICY IF EXISTS "Anyone can record engagement events" ON player_engagement_events;
DROP POLICY IF EXISTS "Authenticated users can record engagement events" ON player_engagement_events;

CREATE POLICY "Authenticated users can record engagement events"
  ON player_engagement_events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
      OR coach_id IS NULL
    )
  );

-- Conversation Participants
DROP POLICY IF EXISTS "Users can join conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can be added to conversations by participants" ON conversation_participants;

CREATE POLICY "Users can be added to conversations by participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
      OR
      user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
    )
  );

-- Conversations
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- MIGRATION 036: Messaging Matrix
-- ============================================================================

-- Add columns to conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS sport VARCHAR(20) CHECK (sport IN ('baseball', 'golf')),
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS golf_team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_sport ON conversations(sport);
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_golf_team ON conversations(golf_team_id) WHERE golf_team_id IS NOT NULL;

-- Helper functions
CREATE OR REPLACE FUNCTION get_user_coach_type(user_uuid UUID)
RETURNS coach_type AS $$
  SELECT coach_type FROM coaches WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_player_type(user_uuid UUID)
RETURNS player_type AS $$
  SELECT player_type FROM players WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_player_recruiting_active(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(recruiting_activated, FALSE) FROM players WHERE user_id = user_uuid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION are_users_on_same_roster(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user1_coach_id UUID;
  user2_coach_id UUID;
  user1_player_id UUID;
  user2_player_id UUID;
BEGIN
  SELECT id INTO user1_coach_id FROM coaches WHERE user_id = user1;
  SELECT id INTO user2_coach_id FROM coaches WHERE user_id = user2;
  SELECT id INTO user1_player_id FROM players WHERE user_id = user1;
  SELECT id INTO user2_player_id FROM players WHERE user_id = user2;

  RETURN EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.player_id = user1_player_id
    AND tm2.player_id = user2_player_id
    AND tm1.status = 'active'
    AND tm2.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE (t.head_coach_id = user1_coach_id OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = user1_coach_id
    ))
    AND tm.player_id = user2_player_id
    AND tm.status = 'active'
  )
  OR EXISTS (
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

CREATE OR REPLACE FUNCTION are_users_on_same_golf_team(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user1_team_id UUID;
  user2_team_id UUID;
BEGIN
  SELECT COALESCE(
    (SELECT team_id FROM golf_coaches WHERE user_id = user1),
    (SELECT team_id FROM golf_players WHERE user_id = user1)
  ) INTO user1_team_id;

  SELECT COALESCE(
    (SELECT team_id FROM golf_coaches WHERE user_id = user2),
    (SELECT team_id FROM golf_players WHERE user_id = user2)
  ) INTO user2_team_id;

  RETURN user1_team_id IS NOT NULL
    AND user2_team_id IS NOT NULL
    AND user1_team_id = user2_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

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
  sender_coach_type := get_user_coach_type(sender_uuid);
  sender_player_type := get_user_player_type(sender_uuid);
  sender_is_coach := sender_coach_type IS NOT NULL;
  sender_is_player := sender_player_type IS NOT NULL;

  recipient_coach_type := get_user_coach_type(recipient_uuid);
  recipient_player_type := get_user_player_type(recipient_uuid);
  recipient_is_coach := recipient_coach_type IS NOT NULL;
  recipient_is_player := recipient_player_type IS NOT NULL;
  recipient_recruiting_active := is_player_recruiting_active(recipient_uuid);

  -- Golf: Team-scoped only
  IF EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = recipient_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = recipient_uuid)
  THEN
    RETURN are_users_on_same_golf_team(sender_uuid, recipient_uuid);
  END IF;

  -- Baseball: Complex matrix
  IF sender_is_coach AND recipient_is_coach THEN
    RETURN TRUE;
  END IF;

  IF sender_is_coach AND sender_coach_type = 'college' AND recipient_is_player THEN
    IF recipient_player_type = 'college' THEN
      RETURN TRUE;
    ELSE
      RETURN recipient_recruiting_active;
    END IF;
  END IF;

  IF sender_is_coach AND sender_coach_type = 'juco' AND recipient_is_player THEN
    IF recipient_player_type IN ('high_school', 'showcase') THEN
      RETURN recipient_recruiting_active;
    ELSIF recipient_player_type = 'juco' THEN
      RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  IF sender_is_coach AND sender_coach_type = 'high_school' AND recipient_is_player THEN
    RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
  END IF;

  IF sender_is_coach AND sender_coach_type = 'showcase' AND recipient_is_player THEN
    RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
  END IF;

  IF sender_is_player AND recipient_is_coach THEN
    IF NOT is_player_recruiting_active(sender_uuid) THEN
      RETURN FALSE;
    END IF;

    IF sender_player_type IN ('high_school', 'showcase') THEN
      RETURN recipient_coach_type IN ('college', 'juco', 'showcase')
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;

    IF sender_player_type = 'juco' THEN
      RETURN recipient_coach_type = 'college'
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;

    IF sender_player_type = 'college' THEN
      RETURN are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;
  END IF;

  IF sender_is_player AND recipient_is_player THEN
    RETURN FALSE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update policies
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;

CREATE POLICY "Users can be added to valid conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (
        user_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
        )
      )
      OR
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
        AND can_users_message(cp.user_id, conversation_participants.user_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Users can send messages to valid conversations" ON messages;

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

-- ============================================================================
-- MIGRATION 040: Login Security
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip TEXT,
  last_user_agent TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_attempt ON login_attempts(last_attempt);

CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM login_attempts
  WHERE last_attempt < NOW() - INTERVAL '7 days'
  AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON login_attempts;

CREATE POLICY "Service role only" ON login_attempts
  FOR ALL USING (false);

-- ============================================================================
-- MIGRATION 041: Batch 9 RLS Policies
-- ============================================================================

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Watchlists
DROP POLICY IF EXISTS "Coaches can view their own watchlist" ON watchlists;
DROP POLICY IF EXISTS "Coaches can create watchlist entries" ON watchlists;
DROP POLICY IF EXISTS "Coaches can update their watchlist" ON watchlists;
DROP POLICY IF EXISTS "Coaches can delete from watchlist" ON watchlists;

CREATE POLICY "Coaches can view their own watchlist"
  ON watchlists FOR SELECT TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can create watchlist entries"
  ON watchlists FOR INSERT TO authenticated
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can update their watchlist"
  ON watchlists FOR UPDATE TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  )
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can delete from watchlist"
  ON watchlists FOR DELETE TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Player Metrics
DROP POLICY IF EXISTS "Players can view their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Players can create their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Players can update their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can view player metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can create player metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can update player metrics" ON player_metrics;

CREATE POLICY "Players can view their own metrics"
  ON player_metrics FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can create their own metrics"
  ON player_metrics FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can update their own metrics"
  ON player_metrics FOR UPDATE TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view player metrics"
  ON player_metrics FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT w.player_id
      FROM watchlists w
      JOIN coaches c ON c.id = w.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can create player metrics"
  ON player_metrics FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update player metrics"
  ON player_metrics FOR UPDATE TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Players (additional policies)
DROP POLICY IF EXISTS "Players can view other recruiting-activated players" ON players;
DROP POLICY IF EXISTS "Coaches can view recruiting-activated players" ON players;

CREATE POLICY "Players can view other recruiting-activated players"
  ON players FOR SELECT TO authenticated
  USING (
    recruiting_activated = true
    OR user_id = auth.uid()
  );

CREATE POLICY "Coaches can view recruiting-activated players"
  ON players FOR SELECT TO authenticated
  USING (
    recruiting_activated = true
    OR
    id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Organizations
DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;
DROP POLICY IF EXISTS "Coaches can create organizations" ON organizations;
DROP POLICY IF EXISTS "Coaches can update their organization" ON organizations;

CREATE POLICY "Anyone can view organizations"
  ON organizations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coaches can create organizations"
  ON organizations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Coaches can update their organization"
  ON organizations FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM coaches
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id
      FROM coaches
      WHERE user_id = auth.uid()
    )
  );

-- Videos
DROP POLICY IF EXISTS "Players can view their own videos" ON videos;
DROP POLICY IF EXISTS "Players can create videos" ON videos;
DROP POLICY IF EXISTS "Players can update their videos" ON videos;
DROP POLICY IF EXISTS "Players can delete their videos" ON videos;
DROP POLICY IF EXISTS "Coaches can view videos for recruiting" ON videos;

CREATE POLICY "Players can view their own videos"
  ON videos FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can create videos"
  ON videos FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can update their videos"
  ON videos FOR UPDATE TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can delete their videos"
  ON videos FOR DELETE TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view videos for recruiting"
  ON videos FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT w.player_id
      FROM watchlists w
      JOIN coaches c ON c.id = w.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    player_id IN (
      SELECT id FROM players WHERE recruiting_activated = true
    )
  );

-- Coaches (additional policies)
DROP POLICY IF EXISTS "Coaches can view their own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update their own profile" ON coaches;
DROP POLICY IF EXISTS "Anyone can view coach profiles" ON coaches;

CREATE POLICY "Coaches can view their own profile"
  ON coaches FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Coaches can update their own profile"
  ON coaches FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can view coach profiles"
  ON coaches FOR SELECT TO authenticated USING (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_watchlists_coach_id ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player_id ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_pipeline_stage ON watchlists(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_player_metrics_player_id ON player_metrics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_metrics_metric_label ON player_metrics(metric_label);
CREATE INDEX IF NOT EXISTS idx_videos_player_id ON videos(player_id);
CREATE INDEX IF NOT EXISTS idx_players_recruiting_activated ON players(recruiting_activated);
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_primary_position ON players(primary_position);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON player_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON videos TO authenticated;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Success message (as a comment since we can't RAISE NOTICE in transactions)
-- All security policies applied successfully!
