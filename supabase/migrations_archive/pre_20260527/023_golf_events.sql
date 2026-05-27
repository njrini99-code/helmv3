-- ============================================================================
-- Migration: 023_golf_events.sql
-- Purpose: Golf events and attendance tracking
-- Consolidated from: 016_create_golf_schema.sql (events section)
-- ============================================================================

-- Golf Events
CREATE TABLE IF NOT EXISTS golf_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type golf_event_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  course_name TEXT,
  description TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  cancellation_reason TEXT,
  requires_rsvp BOOLEAN DEFAULT FALSE,
  rsvp_deadline TIMESTAMPTZ,
  max_attendees INTEGER,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_events_team ON golf_events(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_date ON golf_events(start_date);
CREATE INDEX IF NOT EXISTS idx_golf_events_type ON golf_events(event_type);
CREATE INDEX IF NOT EXISTS idx_golf_events_created_by ON golf_events(created_by);

-- Golf Event Attendance
CREATE TABLE IF NOT EXISTS golf_event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  status golf_attendance_status DEFAULT 'pending',
  absence_reason TEXT,
  responded_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_attendance_event ON golf_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_attendance_player ON golf_event_attendance(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_attendance_status ON golf_event_attendance(status);

-- Recurring Events Master
CREATE TABLE IF NOT EXISTS golf_recurring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type golf_event_type NOT NULL,
  frequency golf_recurrence_frequency NOT NULL,
  day_of_week INTEGER, -- 0-6 for weekly
  start_time TIME,
  end_time TIME,
  location TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,
  effective_from DATE NOT NULL,
  effective_until DATE,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_recurring_team ON golf_recurring_events(team_id);

-- Triggers
CREATE TRIGGER update_golf_events_updated_at
  BEFORE UPDATE ON golf_events
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_event_attendance_updated_at
  BEFORE UPDATE ON golf_event_attendance
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_recurring_events_updated_at
  BEFORE UPDATE ON golf_recurring_events
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_events IS 'Golf team events (practices, tournaments, meetings)';
COMMENT ON TABLE golf_event_attendance IS 'Player attendance tracking for events';
COMMENT ON TABLE golf_recurring_events IS 'Master records for recurring events';
