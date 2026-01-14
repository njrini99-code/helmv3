-- =====================================================================================
-- Migration: Availability Locking & Conflict Detection
-- Description: Prevent double-booking with soft/hard locks
-- =====================================================================================

-- Add conflict detection settings to golf_events
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS ignore_conflicts BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS conflict_override_by UUID REFERENCES golf_coaches(id);

COMMENT ON COLUMN golf_events.ignore_conflicts IS 'Allow this event despite conflicts';
COMMENT ON COLUMN golf_events.conflict_override_reason IS 'Reason for overriding conflict check';
COMMENT ON COLUMN golf_events.conflict_override_by IS 'Coach who approved conflict override';

-- =====================================================================================
-- Player Availability Blocks (for blocking out time)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS golf_player_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT NOT NULL, -- e.g., "Classes", "Work", "Family commitment"
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- Optional RRULE for recurring blocks
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

COMMENT ON TABLE golf_player_availability_blocks IS 'Player-defined unavailable time blocks';

CREATE INDEX IF NOT EXISTS idx_golf_player_availability_blocks_player ON golf_player_availability_blocks(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_availability_blocks_dates ON golf_player_availability_blocks(start_date, end_date);

-- RLS for availability blocks
ALTER TABLE golf_player_availability_blocks ENABLE ROW LEVEL SECURITY;

-- Players can manage their own blocks
CREATE POLICY "golf_player_availability_blocks_select"
  ON golf_player_availability_blocks FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
    OR
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

CREATE POLICY "golf_player_availability_blocks_insert"
  ON golf_player_availability_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "golf_player_availability_blocks_update"
  ON golf_player_availability_blocks FOR UPDATE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "golf_player_availability_blocks_delete"
  ON golf_player_availability_blocks FOR DELETE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

-- =====================================================================================
-- Function: Detect event conflicts
-- =====================================================================================

CREATE OR REPLACE FUNCTION detect_event_conflicts(
  p_event_id UUID,
  p_team_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_ignore_conflicts BOOLEAN DEFAULT false
)
RETURNS TABLE (
  conflict_type TEXT,
  conflict_event_id UUID,
  conflict_event_title TEXT,
  conflict_start_date DATE,
  conflict_end_date DATE
) AS $$
BEGIN
  -- If conflicts are ignored, return empty
  IF p_ignore_conflicts THEN
    RETURN;
  END IF;

  -- Find overlapping events for the same team
  RETURN QUERY
  SELECT
    'team_event_overlap'::TEXT AS conflict_type,
    e.id AS conflict_event_id,
    e.title AS conflict_event_title,
    e.start_date AS conflict_start_date,
    e.end_date AS conflict_end_date
  FROM golf_events e
  WHERE
    e.team_id = p_team_id
    AND e.id != COALESCE(p_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND e.status = 'confirmed' -- Only check confirmed events
    AND (
      -- Date range overlap
      (e.start_date, COALESCE(e.end_date, e.start_date)) OVERLAPS
      (p_start_date, COALESCE(p_end_date, p_start_date))
    )
    AND (
      -- Time overlap (if both have times)
      p_start_time IS NULL OR p_end_time IS NULL OR
      e.start_time IS NULL OR e.end_time IS NULL OR
      (e.start_time, COALESCE(e.end_time, e.start_time)) OVERLAPS
      (p_start_time, COALESCE(p_end_time, p_start_time))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION detect_event_conflicts IS 'Detects scheduling conflicts for events';

-- =====================================================================================
-- Function: Check player availability
-- =====================================================================================

CREATE OR REPLACE FUNCTION check_player_availability(
  p_player_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_start_time TIME,
  p_end_time TIME
)
RETURNS TABLE (
  is_blocked BOOLEAN,
  block_reason TEXT,
  block_start_date DATE,
  block_end_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    true::BOOLEAN AS is_blocked,
    pab.reason AS block_reason,
    pab.start_date AS block_start_date,
    pab.end_date AS block_end_date
  FROM golf_player_availability_blocks pab
  WHERE
    pab.player_id = p_player_id
    AND (
      -- Date range overlap
      (pab.start_date, pab.end_date) OVERLAPS
      (p_start_date, COALESCE(p_end_date, p_start_date))
    )
    AND (
      -- Time overlap (if both have times)
      p_start_time IS NULL OR p_end_time IS NULL OR
      pab.start_time IS NULL OR pab.end_time IS NULL OR
      (pab.start_time, COALESCE(pab.end_time, pab.start_time)) OVERLAPS
      (p_start_time, COALESCE(p_end_time, p_start_time))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_player_availability IS 'Checks if player has availability blocks during given time';

-- =====================================================================================
-- Trigger: Warn about conflicts on event insert/update
-- =====================================================================================

CREATE OR REPLACE FUNCTION warn_event_conflicts()
RETURNS TRIGGER AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  -- Skip if ignore_conflicts is true
  IF NEW.ignore_conflicts THEN
    RETURN NEW;
  END IF;

  -- Count conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM detect_event_conflicts(
    NEW.id,
    NEW.team_id,
    NEW.start_date,
    NEW.end_date,
    NEW.start_time,
    NEW.end_time,
    NEW.ignore_conflicts
  );

  -- Log warning if conflicts exist (but still allow insert/update)
  IF conflict_count > 0 THEN
    RAISE WARNING 'Event has % scheduling conflicts', conflict_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS golf_events_conflict_check_trigger ON golf_events;
CREATE TRIGGER golf_events_conflict_check_trigger
  BEFORE INSERT OR UPDATE ON golf_events
  FOR EACH ROW
  EXECUTE FUNCTION warn_event_conflicts();

-- =====================================================================================
-- Updated at trigger for availability blocks
-- =====================================================================================

DROP TRIGGER IF EXISTS update_golf_player_availability_blocks_updated_at ON golf_player_availability_blocks;
CREATE TRIGGER update_golf_player_availability_blocks_updated_at
  BEFORE UPDATE ON golf_player_availability_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
