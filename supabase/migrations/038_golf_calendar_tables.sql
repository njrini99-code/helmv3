-- Migration 038: Golf Calendar Tables
-- Creates golf calendar, availability, and team management tables

-- ============================================================================
-- 1. golf_organizations - Golf program organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  city TEXT,
  state TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for golf_organizations
ALTER TABLE golf_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view organizations" ON golf_organizations
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- 2. golf_team_settings - Team configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_team_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  scoring_format TEXT DEFAULT 'stroke_play',
  handicap_system TEXT DEFAULT 'usga',
  default_tees TEXT DEFAULT 'blue',
  timezone TEXT DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id)
);

-- RLS for golf_team_settings
ALTER TABLE golf_team_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view settings" ON golf_team_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c WHERE c.user_id = auth.uid() AND c.team_id = golf_team_settings.team_id
    ) OR EXISTS (
      SELECT 1 FROM golf_players p WHERE p.user_id = auth.uid() AND p.team_id = golf_team_settings.team_id
    )
  );

CREATE POLICY "Coaches can manage settings" ON golf_team_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_team_settings.team_id
    )
  );

-- ============================================================================
-- 3. golf_announcements - Team announcements
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  requires_acknowledgement BOOLEAN DEFAULT FALSE,
  send_push BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_announcements_team ON golf_announcements(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_published ON golf_announcements(published_at DESC);

-- RLS for golf_announcements
ALTER TABLE golf_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view announcements" ON golf_announcements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c WHERE c.user_id = auth.uid() AND c.team_id = golf_announcements.team_id
    ) OR EXISTS (
      SELECT 1 FROM golf_players p WHERE p.user_id = auth.uid() AND p.team_id = golf_announcements.team_id
    )
  );

CREATE POLICY "Coaches can manage announcements" ON golf_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_announcements.team_id
    )
  );

-- ============================================================================
-- 4. golf_travel_itineraries - Tournament travel plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_travel_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  event_id UUID REFERENCES golf_events(id) ON DELETE SET NULL,
  event_name TEXT,
  destination TEXT,
  transportation_type TEXT CHECK (transportation_type IN ('bus', 'van', 'flight', 'carpool', 'other')),
  departure_date DATE,
  departure_time TIME,
  departure_location TEXT,
  return_date DATE,
  return_time TIME,
  flight_info JSONB,
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_phone TEXT,
  hotel_confirmation TEXT,
  room_assignments JSONB,
  uniform_requirements TEXT,
  gear_list TEXT[],
  notes TEXT,
  created_by UUID REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_travel_team ON golf_travel_itineraries(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_departure ON golf_travel_itineraries(departure_date);

-- RLS for golf_travel_itineraries
ALTER TABLE golf_travel_itineraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view travel" ON golf_travel_itineraries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c WHERE c.user_id = auth.uid() AND c.team_id = golf_travel_itineraries.team_id
    ) OR EXISTS (
      SELECT 1 FROM golf_players p WHERE p.user_id = auth.uid() AND p.team_id = golf_travel_itineraries.team_id
    )
  );

CREATE POLICY "Coaches can manage travel" ON golf_travel_itineraries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_travel_itineraries.team_id
    )
  );

-- ============================================================================
-- 5. golf_calendar_feeds - iCal feed tokens for external calendar sync
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_calendar_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  feed_type TEXT DEFAULT 'all_events' CHECK (feed_type IN ('all_events', 'practices', 'tournaments', 'qualifying')),
  feed_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_user ON golf_calendar_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_token ON golf_calendar_feeds(feed_token);

-- RLS for golf_calendar_feeds
ALTER TABLE golf_calendar_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own feeds" ON golf_calendar_feeds
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- 6. golf_external_calendars - External calendar integrations (Google, Apple)
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_external_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'other')),
  provider_calendar_id TEXT,
  calendar_name TEXT,
  is_synced BOOLEAN DEFAULT TRUE,
  sync_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_external_calendars_player ON golf_external_calendars(player_id);

-- RLS for golf_external_calendars
ALTER TABLE golf_external_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own calendars" ON golf_external_calendars
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_external_calendars.player_id
    )
  );

-- ============================================================================
-- 7. golf_availability_polls - Group availability polling for scheduling
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_availability_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  date_options JSONB NOT NULL DEFAULT '[]',
  time_options JSONB DEFAULT '[]',
  duration_minutes INTEGER,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_availability_polls_team ON golf_availability_polls(team_id);

-- RLS for golf_availability_polls
ALTER TABLE golf_availability_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view polls" ON golf_availability_polls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c WHERE c.user_id = auth.uid() AND c.team_id = golf_availability_polls.team_id
    ) OR EXISTS (
      SELECT 1 FROM golf_players p WHERE p.user_id = auth.uid() AND p.team_id = golf_availability_polls.team_id
    )
  );

CREATE POLICY "Coaches can manage polls" ON golf_availability_polls
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_availability_polls.team_id
    )
  );

-- ============================================================================
-- 8. golf_poll_responses - Player responses to availability polls
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES golf_availability_polls(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  date_option TEXT NOT NULL,
  time_option TEXT,
  is_available BOOLEAN NOT NULL,
  preference_level INTEGER CHECK (preference_level BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, player_id, date_option)
);

CREATE INDEX IF NOT EXISTS idx_golf_poll_responses_poll ON golf_poll_responses(poll_id);

-- RLS for golf_poll_responses
ALTER TABLE golf_poll_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own responses" ON golf_poll_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_poll_responses.player_id
    )
  );

CREATE POLICY "Coaches can view all responses" ON golf_poll_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_availability_polls poll
      JOIN golf_coaches c ON c.team_id = poll.team_id
      WHERE poll.id = golf_poll_responses.poll_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 9. golf_player_availability_blocks - Player blocked time periods
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_player_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  recurrence_rule TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_player_availability_player ON golf_player_availability_blocks(player_id);

-- RLS for golf_player_availability_blocks
ALTER TABLE golf_player_availability_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own availability" ON golf_player_availability_blocks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_player_availability_blocks.player_id
    )
  );

CREATE POLICY "Coaches can view team availability" ON golf_player_availability_blocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_player_availability_blocks.player_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. golf_coach_blocked_time - Coach unavailable periods
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_coach_blocked_time (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coach_blocked_time_coach ON golf_coach_blocked_time(coach_id);

-- RLS for golf_coach_blocked_time
ALTER TABLE golf_coach_blocked_time ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own blocked time" ON golf_coach_blocked_time
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.id = golf_coach_blocked_time.coach_id
    )
  );

-- ============================================================================
-- Update triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_golf_organizations_updated_at ON golf_organizations;
CREATE TRIGGER update_golf_organizations_updated_at
    BEFORE UPDATE ON golf_organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_team_settings_updated_at ON golf_team_settings;
CREATE TRIGGER update_golf_team_settings_updated_at
    BEFORE UPDATE ON golf_team_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_announcements_updated_at ON golf_announcements;
CREATE TRIGGER update_golf_announcements_updated_at
    BEFORE UPDATE ON golf_announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_travel_itineraries_updated_at ON golf_travel_itineraries;
CREATE TRIGGER update_golf_travel_itineraries_updated_at
    BEFORE UPDATE ON golf_travel_itineraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_calendar_feeds_updated_at ON golf_calendar_feeds;
CREATE TRIGGER update_golf_calendar_feeds_updated_at
    BEFORE UPDATE ON golf_calendar_feeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_external_calendars_updated_at ON golf_external_calendars;
CREATE TRIGGER update_golf_external_calendars_updated_at
    BEFORE UPDATE ON golf_external_calendars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_availability_polls_updated_at ON golf_availability_polls;
CREATE TRIGGER update_golf_availability_polls_updated_at
    BEFORE UPDATE ON golf_availability_polls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_player_availability_blocks_updated_at ON golf_player_availability_blocks;
CREATE TRIGGER update_golf_player_availability_blocks_updated_at
    BEFORE UPDATE ON golf_player_availability_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_coach_blocked_time_updated_at ON golf_coach_blocked_time;
CREATE TRIGGER update_golf_coach_blocked_time_updated_at
    BEFORE UPDATE ON golf_coach_blocked_time
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
