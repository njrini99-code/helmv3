-- Migration: Create coach feature tables
-- Tables: coach_notes, coach_calendar_events

-- ==============================================
-- COACH NOTES TABLE (Private notes on players)
-- ==============================================

CREATE TABLE IF NOT EXISTS coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  note_content TEXT NOT NULL,
  is_private BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for coach_notes
CREATE INDEX idx_coach_notes_coach ON coach_notes(coach_id);
CREATE INDEX idx_coach_notes_player ON coach_notes(player_id);
CREATE INDEX idx_coach_notes_coach_player ON coach_notes(coach_id, player_id);
CREATE INDEX idx_coach_notes_created ON coach_notes(coach_id, created_at DESC);
CREATE INDEX idx_coach_notes_tags ON coach_notes USING gin(tags) WHERE array_length(tags, 1) > 0;

-- ==============================================
-- COACH CALENDAR EVENTS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS coach_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT,

  event_type VARCHAR(50) CHECK (event_type IN (
    'camp',
    'evaluation',
    'visit',
    'game',
    'practice',
    'meeting',
    'other'
  )),

  -- Date/time details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  is_all_day BOOLEAN DEFAULT FALSE,

  -- Location
  location VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),

  -- Recurrence (for repeating events)
  recurrence_rule TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for coach_calendar_events
CREATE INDEX idx_calendar_coach ON coach_calendar_events(coach_id);
CREATE INDEX idx_calendar_start ON coach_calendar_events(start_time);
CREATE INDEX idx_calendar_coach_range ON coach_calendar_events(coach_id, start_time, end_time);
CREATE INDEX idx_calendar_type ON coach_calendar_events(event_type) WHERE event_type IS NOT NULL;
CREATE INDEX idx_calendar_all_day ON coach_calendar_events(coach_id, start_time) WHERE is_all_day = TRUE;

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_calendar_events ENABLE ROW LEVEL SECURITY;

-- ===== COACH NOTES POLICIES =====

-- Coach notes are strictly private to the coach who created them
CREATE POLICY "Coaches can manage own notes"
  ON coach_notes
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- No one else can view coach notes
CREATE POLICY "Coach notes are private"
  ON coach_notes
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- ===== COACH CALENDAR EVENTS POLICIES =====

-- Coaches can manage own calendar events
CREATE POLICY "Coaches can manage own calendar"
  ON coach_calendar_events
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- ==============================================
-- TRIGGERS
-- ==============================================

CREATE TRIGGER update_coach_notes_updated_at
  BEFORE UPDATE ON coach_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_coach_calendar_events_updated_at
  BEFORE UPDATE ON coach_calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Get notes for a player (by a coach)
CREATE OR REPLACE FUNCTION get_player_notes(p_coach_id UUID, p_player_id UUID)
RETURNS TABLE (
  note_id UUID,
  note_content TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cn.id as note_id,
    cn.note_content,
    cn.tags,
    cn.created_at,
    cn.updated_at
  FROM coach_notes cn
  WHERE cn.coach_id = p_coach_id
    AND cn.player_id = p_player_id
  ORDER BY cn.created_at DESC;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Get upcoming calendar events for a coach
CREATE OR REPLACE FUNCTION get_upcoming_events(
  p_coach_id UUID,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  event_id UUID,
  title TEXT,
  event_type VARCHAR(50),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cce.id as event_id,
    cce.title,
    cce.event_type,
    cce.start_time,
    cce.end_time,
    cce.location
  FROM coach_calendar_events cce
  WHERE cce.coach_id = p_coach_id
    AND cce.start_time >= NOW()
    AND cce.start_time <= NOW() + (p_days_ahead || ' days')::INTERVAL
  ORDER BY cce.start_time ASC;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE coach_notes IS 'Private notes coaches make about players - never visible to players';
COMMENT ON TABLE coach_calendar_events IS 'Coach calendar for games, practices, evaluations, visits, etc.';
COMMENT ON COLUMN coach_calendar_events.recurrence_rule IS 'iCal RRULE format for repeating events';
