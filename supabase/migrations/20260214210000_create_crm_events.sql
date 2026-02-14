-- ============================================================================
-- Migration: 20260214210000_create_crm_events.sql
-- Purpose: CRM Calendar Events (demos, follow-ups, calls, meetings)
-- ============================================================================

-- Create enum for CRM event types
DO $$ BEGIN
  CREATE TYPE crm_event_type AS ENUM (
    'demo',
    'follow_up',
    'call',
    'meeting',
    'email_reminder',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CRM EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  event_type crm_event_type NOT NULL DEFAULT 'follow_up',
  
  -- Time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  
  -- Location
  location TEXT,
  meeting_url TEXT, -- Zoom/Meet link
  
  -- Related coach (optional - can have events not tied to a coach)
  coach_id UUID REFERENCES crm_coaches(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled, rescheduled
  completed_at TIMESTAMPTZ,
  notes TEXT,
  outcome TEXT, -- Result of the meeting/call
  
  -- Google Calendar sync
  google_event_id TEXT,
  google_calendar_id TEXT,
  google_sync_status TEXT DEFAULT 'pending', -- pending, synced, error
  google_last_synced_at TIMESTAMPTZ,
  
  -- Recurrence (for follow-up series)
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT, -- RRULE format
  parent_event_id UUID REFERENCES crm_events(id) ON DELETE SET NULL,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_time INTEGER DEFAULT 30, -- minutes before
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================================
-- GOOGLE CALENDAR TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  
  -- Selected calendar
  calendar_id TEXT DEFAULT 'primary',
  calendar_name TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_calendar UNIQUE (user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_crm_events_start_time ON crm_events(start_time);
CREATE INDEX idx_crm_events_coach_id ON crm_events(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX idx_crm_events_event_type ON crm_events(event_type);
CREATE INDEX idx_crm_events_status ON crm_events(status);
CREATE INDEX idx_crm_events_google_event_id ON crm_events(google_event_id) WHERE google_event_id IS NOT NULL;
CREATE INDEX idx_crm_google_tokens_user ON crm_google_calendar_tokens(user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_events_updated_at
  BEFORE UPDATE ON crm_events
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_events_updated_at();

CREATE OR REPLACE FUNCTION update_crm_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_google_tokens_updated_at
  BEFORE UPDATE ON crm_google_calendar_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_google_tokens_updated_at();

-- ============================================================================
-- RLS POLICIES (Admin only)
-- ============================================================================
ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Events policies
CREATE POLICY "Admins can view all CRM events"
  ON crm_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert CRM events"
  ON crm_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update CRM events"
  ON crm_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete CRM events"
  ON crm_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Token policies
CREATE POLICY "Admins can view own calendar tokens"
  ON crm_google_calendar_tokens FOR SELECT
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert own calendar tokens"
  ON crm_google_calendar_tokens FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update own calendar tokens"
  ON crm_google_calendar_tokens FOR UPDATE
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete own calendar tokens"
  ON crm_google_calendar_tokens FOR DELETE
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get upcoming events for a coach
CREATE OR REPLACE FUNCTION get_coach_upcoming_events(p_coach_id UUID, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  title TEXT,
  event_type crm_event_type,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.event_type,
    e.start_time,
    e.end_time,
    e.status
  FROM crm_events e
  WHERE e.coach_id = p_coach_id
    AND e.start_time >= NOW()
    AND e.status != 'cancelled'
  ORDER BY e.start_time
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coach_upcoming_events(UUID, INTEGER) TO authenticated;

-- Get events in date range
CREATE OR REPLACE FUNCTION get_crm_events_in_range(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  event_type crm_event_type,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN,
  location TEXT,
  meeting_url TEXT,
  coach_id UUID,
  coach_name TEXT,
  coach_school TEXT,
  status TEXT,
  google_event_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.event_type,
    e.start_time,
    e.end_time,
    e.all_day,
    e.location,
    e.meeting_url,
    e.coach_id,
    c.name as coach_name,
    c.school as coach_school,
    e.status,
    e.google_event_id
  FROM crm_events e
  LEFT JOIN crm_coaches c ON c.id = e.coach_id
  WHERE e.start_time >= p_start
    AND e.start_time < p_end
  ORDER BY e.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_crm_events_in_range(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Create event and optionally update coach status
CREATE OR REPLACE FUNCTION create_crm_event_with_update(
  p_title TEXT,
  p_event_type crm_event_type,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_coach_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_meeting_url TEXT DEFAULT NULL,
  p_update_coach_status BOOLEAN DEFAULT TRUE
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert the event
  INSERT INTO crm_events (
    title, event_type, start_time, end_time, coach_id,
    description, location, meeting_url, created_by
  )
  VALUES (
    p_title, p_event_type, p_start_time, p_end_time, p_coach_id,
    p_description, p_location, p_meeting_url, auth.uid()
  )
  RETURNING id INTO v_event_id;
  
  -- Update coach status if demo scheduled
  IF p_update_coach_status AND p_coach_id IS NOT NULL THEN
    IF p_event_type = 'demo' THEN
      UPDATE crm_coaches
      SET status = 'demo_scheduled',
          next_follow_up_at = p_start_time
      WHERE id = p_coach_id;
    ELSE
      UPDATE crm_coaches
      SET next_follow_up_at = p_start_time
      WHERE id = p_coach_id;
    END IF;
  END IF;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_crm_event_with_update(TEXT, crm_event_type, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
