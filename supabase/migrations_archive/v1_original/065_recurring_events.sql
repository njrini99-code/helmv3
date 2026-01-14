-- =====================================================================================
-- Migration: Recurring Events (RRULE Support)
-- Description: Adds recurrence support to golf_events with RRULE format (RFC 5545)
-- =====================================================================================

-- Add recurrence columns to golf_events
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT, -- RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20240531")
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES golf_events(id) ON DELETE CASCADE, -- Points to parent event for instances
  ADD COLUMN IF NOT EXISTS original_start_date TIMESTAMPTZ, -- Original start date for exception instances
  ADD COLUMN IF NOT EXISTS is_exception BOOLEAN DEFAULT false; -- True if this is an edited instance

COMMENT ON COLUMN golf_events.recurrence_rule IS 'RRULE string following RFC 5545 format';
COMMENT ON COLUMN golf_events.recurrence_parent_id IS 'Parent event ID for recurring instances';
COMMENT ON COLUMN golf_events.original_start_date IS 'Original start date for exception instances';
COMMENT ON COLUMN golf_events.is_exception IS 'True if this instance was edited from the series';

-- Create index for recurrence queries
CREATE INDEX IF NOT EXISTS idx_golf_events_recurrence_parent ON golf_events(recurrence_parent_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_recurrence_rule ON golf_events(recurrence_rule) WHERE recurrence_rule IS NOT NULL;

-- =====================================================================================
-- Event Exclusions Table (Individual Date Exclusions)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS golf_event_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  excluded_date DATE NOT NULL, -- Date to exclude from recurrence
  reason TEXT, -- Optional reason for exclusion
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(event_id, excluded_date)
);

COMMENT ON TABLE golf_event_exclusions IS 'Individual date exclusions for recurring events';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_golf_event_exclusions_event ON golf_event_exclusions(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_exclusions_date ON golf_event_exclusions(excluded_date);

-- RLS Policies for golf_event_exclusions
ALTER TABLE golf_event_exclusions ENABLE ROW LEVEL SECURITY;

-- Coaches can view exclusions for their team's events
CREATE POLICY "golf_event_exclusions_select"
  ON golf_event_exclusions FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM golf_events
      WHERE created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
    )
  );

-- Coaches can insert exclusions for their team's events
CREATE POLICY "golf_event_exclusions_insert"
  ON golf_event_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM golf_events
      WHERE created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
    )
  );

-- Coaches can delete exclusions for their team's events
CREATE POLICY "golf_event_exclusions_delete"
  ON golf_event_exclusions FOR DELETE
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM golf_events
      WHERE created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
    )
  );

-- =====================================================================================
-- Academic Exclusions Table (Institution-wide exclusions)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS golf_academic_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Spring Break", "Finals Week"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  exclude_practices BOOLEAN DEFAULT true,
  exclude_matches BOOLEAN DEFAULT false,
  exclude_all_events BOOLEAN DEFAULT false,
  created_by UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

COMMENT ON TABLE golf_academic_exclusions IS 'Institution-wide academic calendar exclusions (e.g., Spring Break, Finals)';
COMMENT ON COLUMN golf_academic_exclusions.exclude_practices IS 'Exclude practices during this period';
COMMENT ON COLUMN golf_academic_exclusions.exclude_matches IS 'Exclude matches during this period';
COMMENT ON COLUMN golf_academic_exclusions.exclude_all_events IS 'Exclude all events during this period';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_golf_academic_exclusions_team ON golf_academic_exclusions(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_academic_exclusions_dates ON golf_academic_exclusions(start_date, end_date);

-- RLS Policies for golf_academic_exclusions
ALTER TABLE golf_academic_exclusions ENABLE ROW LEVEL SECURITY;

-- Coaches and players can view academic exclusions for their team
CREATE POLICY "golf_academic_exclusions_select"
  ON golf_academic_exclusions FOR SELECT
  TO authenticated
  USING (
    -- Coaches on the team
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
    OR
    -- Players on the team
    team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
  );

-- Coaches can insert academic exclusions for their team
CREATE POLICY "golf_academic_exclusions_insert"
  ON golf_academic_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  );

-- Coaches can update academic exclusions for their team
CREATE POLICY "golf_academic_exclusions_update"
  ON golf_academic_exclusions FOR UPDATE
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  );

-- Coaches can delete academic exclusions for their team
CREATE POLICY "golf_academic_exclusions_delete"
  ON golf_academic_exclusions FOR DELETE
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  );

-- =====================================================================================
-- Updated At Triggers
-- =====================================================================================

-- Trigger for golf_event_exclusions
DROP TRIGGER IF EXISTS update_golf_event_exclusions_updated_at ON golf_event_exclusions;
CREATE TRIGGER update_golf_event_exclusions_updated_at
  BEFORE UPDATE ON golf_event_exclusions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for golf_academic_exclusions
DROP TRIGGER IF EXISTS update_golf_academic_exclusions_updated_at ON golf_academic_exclusions;
CREATE TRIGGER update_golf_academic_exclusions_updated_at
  BEFORE UPDATE ON golf_academic_exclusions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
