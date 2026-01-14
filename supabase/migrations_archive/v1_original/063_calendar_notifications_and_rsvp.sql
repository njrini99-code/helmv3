-- ============================================================================
-- Calendar Notifications and RSVP System
-- ============================================================================
-- Purpose: Add RSVP functionality, invitations, and notification system
-- to the GolfHelm calendar system
-- ============================================================================

-- ============================================================================
-- 1. CREATE CALENDAR NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_calendar_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES golf_events(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'event_invitation',      -- You're invited to an event
    'rsvp_response',         -- Someone responded to your event
    'event_updated',         -- Event details changed
    'event_cancelled',       -- Event was cancelled
    'event_reminder',        -- Reminder before event
    'rsvp_reminder'          -- Reminder to RSVP
  )),
  title text NOT NULL,
  message text,
  read boolean DEFAULT false,
  action_url text,           -- Deep link to event
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for notification queries
CREATE INDEX IF NOT EXISTS idx_golf_notifications_user ON golf_calendar_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_notifications_unread ON golf_calendar_notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_golf_notifications_event ON golf_calendar_notifications(event_id);

-- RLS for notifications
ALTER TABLE golf_calendar_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golf_notifications_select" ON golf_calendar_notifications;
CREATE POLICY "golf_notifications_select"
  ON golf_calendar_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "golf_notifications_insert" ON golf_calendar_notifications;
CREATE POLICY "golf_notifications_insert"
  ON golf_calendar_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true); -- System can create for any user

DROP POLICY IF EXISTS "golf_notifications_update" ON golf_calendar_notifications;
CREATE POLICY "golf_notifications_update"
  ON golf_calendar_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "golf_notifications_delete" ON golf_calendar_notifications;
CREATE POLICY "golf_notifications_delete"
  ON golf_calendar_notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. ADD RSVP COLUMNS TO GOLF_EVENTS
-- ============================================================================

ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS requires_rsvp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsvp_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS max_attendees integer;

-- ============================================================================
-- 3. ENSURE GOLF_EVENT_ATTENDANCE HAS PROPER STATUS VALUES
-- ============================================================================

-- The enum golf_attendance_status was created with: 'attending', 'not_attending', 'maybe', 'pending'
-- We need to add 'accepted', 'declined', 'tentative' for RSVP functionality

-- Add new enum values if they don't exist
DO $$
BEGIN
  -- Add 'accepted' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'accepted'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'golf_attendance_status')
  ) THEN
    ALTER TYPE golf_attendance_status ADD VALUE 'accepted';
  END IF;

  -- Add 'declined' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'declined'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'golf_attendance_status')
  ) THEN
    ALTER TYPE golf_attendance_status ADD VALUE 'declined';
  END IF;

  -- Add 'tentative' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'tentative'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'golf_attendance_status')
  ) THEN
    ALTER TYPE golf_attendance_status ADD VALUE 'tentative';
  END IF;
END $$;

-- Note: Data migration for existing attendance records is in migration 064
-- (Must be separate due to PostgreSQL enum transaction limitations)

-- ============================================================================
-- 4. ADD NOTIFICATION TRACKING TO GOLF_EVENT_ATTENDANCE
-- ============================================================================

ALTER TABLE golf_event_attendance
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;

-- ============================================================================
-- 5. CREATE FUNCTION TO AUTO-UPDATE UPDATED_AT TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for golf_calendar_notifications
DROP TRIGGER IF EXISTS update_golf_calendar_notifications_updated_at ON golf_calendar_notifications;
CREATE TRIGGER update_golf_calendar_notifications_updated_at
  BEFORE UPDATE ON golf_calendar_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

-- Allow authenticated users to access notifications
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_calendar_notifications TO authenticated;
-- Note: No sequence to grant because table uses UUID primary key

-- ============================================================================
-- 7. CREATE COACH BLOCKED TIME TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_coach_blocked_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  all_day boolean DEFAULT false,
  recurrence_rule text, -- RRULE format for recurring blocked time
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for coach blocked time queries
CREATE INDEX IF NOT EXISTS idx_golf_coach_blocked_time_coach ON golf_coach_blocked_time(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_blocked_time_dates ON golf_coach_blocked_time(start_date, end_date);

-- RLS for coach blocked time
ALTER TABLE golf_coach_blocked_time ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golf_coach_blocked_time_select" ON golf_coach_blocked_time;
CREATE POLICY "golf_coach_blocked_time_select"
  ON golf_coach_blocked_time FOR SELECT
  TO authenticated
  USING (
    -- Coach can see their own blocked time
    coach_id IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
    OR
    -- Team members can see their coach's blocked time (for availability checking)
    coach_id IN (
      SELECT gc.id
      FROM golf_coaches gc
      JOIN golf_players gp ON gp.team_id = gc.team_id
      WHERE gp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "golf_coach_blocked_time_insert" ON golf_coach_blocked_time;
CREATE POLICY "golf_coach_blocked_time_insert"
  ON golf_coach_blocked_time FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "golf_coach_blocked_time_update" ON golf_coach_blocked_time;
CREATE POLICY "golf_coach_blocked_time_update"
  ON golf_coach_blocked_time FOR UPDATE
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "golf_coach_blocked_time_delete" ON golf_coach_blocked_time;
CREATE POLICY "golf_coach_blocked_time_delete"
  ON golf_coach_blocked_time FOR DELETE
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
  );

-- Add trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_golf_coach_blocked_time_updated_at ON golf_coach_blocked_time;
CREATE TRIGGER update_golf_coach_blocked_time_updated_at
  BEFORE UPDATE ON golf_coach_blocked_time
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_coach_blocked_time TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- New features enabled:
-- ✓ Calendar notifications table with RLS
-- ✓ RSVP requirement fields on events
-- ✓ Proper status constraints on event attendance
-- ✓ Notification tracking on attendance records
-- ✓ Coach blocked time table with RLS
-- ============================================================================
