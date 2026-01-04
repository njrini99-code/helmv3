-- =====================================================================================
-- Migration: Event Lifecycle States
-- Description: Add status workflow for events (draft, confirmed, cancelled)
-- =====================================================================================

-- Create event status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'golf_event_status') THEN
        CREATE TYPE golf_event_status AS ENUM (
            'draft',      -- Event is being planned, not published
            'confirmed',  -- Event is finalized and visible
            'cancelled'   -- Event was cancelled
        );
    END IF;
END $$;

COMMENT ON TYPE golf_event_status IS 'Event lifecycle status: draft, confirmed, cancelled';

-- Add status column to golf_events
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS status golf_event_status DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES golf_coaches(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN golf_events.status IS 'Event lifecycle status';
COMMENT ON COLUMN golf_events.cancelled_at IS 'When event was cancelled';
COMMENT ON COLUMN golf_events.cancelled_by IS 'Coach who cancelled the event';
COMMENT ON COLUMN golf_events.cancellation_reason IS 'Reason for cancellation';

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_golf_events_status ON golf_events(status);
CREATE INDEX IF NOT EXISTS idx_golf_events_status_date ON golf_events(status, start_date);

-- =====================================================================================
-- Event Status Change Log
-- =====================================================================================

CREATE TABLE IF NOT EXISTS golf_event_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  old_status golf_event_status,
  new_status golf_event_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES golf_coaches(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,

  -- Ensure we have proper tracking
  CHECK (old_status IS NULL OR old_status != new_status)
);

COMMENT ON TABLE golf_event_status_log IS 'Audit log for event status changes';

CREATE INDEX IF NOT EXISTS idx_golf_event_status_log_event ON golf_event_status_log(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_status_log_date ON golf_event_status_log(changed_at);

-- RLS for status log (coaches can view logs for their events)
ALTER TABLE golf_event_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_event_status_log_select"
  ON golf_event_status_log FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM golf_events
      WHERE created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
      OR team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
      OR team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
    )
  );

-- =====================================================================================
-- Update RLS Policies for golf_events to respect status
-- =====================================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "golf_events_select_team_players" ON golf_events;
DROP POLICY IF EXISTS "golf_events_select_team_coaches" ON golf_events;

-- Recreate with status filtering
-- Players can see confirmed events for their team
CREATE POLICY "golf_events_select_team_players"
  ON golf_events FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
    AND (
      status = 'confirmed'
      OR status = 'cancelled' -- Players can see cancelled events too
    )
  );

-- Coaches can see all events (including drafts) for their team
CREATE POLICY "golf_events_select_team_coaches"
  ON golf_events FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  );

-- =====================================================================================
-- Function to automatically log status changes
-- =====================================================================================

CREATE OR REPLACE FUNCTION log_event_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO golf_event_status_log (
      event_id,
      old_status,
      new_status,
      changed_by,
      reason
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.created_by, -- Assuming created_by is the coach making changes
      CASE
        WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason
        ELSE NULL
      END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for status change logging
DROP TRIGGER IF EXISTS golf_events_status_change_trigger ON golf_events;
CREATE TRIGGER golf_events_status_change_trigger
  AFTER UPDATE ON golf_events
  FOR EACH ROW
  EXECUTE FUNCTION log_event_status_change();
