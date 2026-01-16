-- ============================================================================
-- Migration: 048_golf_classes_schema_update.sql
-- Purpose: Update golf_player_classes to match UI expectations
-- Issue: Schema mismatch between migration 029 and UI code
-- ============================================================================

-- Add missing columns expected by the UI
ALTER TABLE golf_player_classes
ADD COLUMN IF NOT EXISTS class_name TEXT,
ADD COLUMN IF NOT EXISTS days TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS building TEXT,
ADD COLUMN IF NOT EXISTS room TEXT,
ADD COLUMN IF NOT EXISTS credits INTEGER,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;

-- Create index on team_id for team-based queries
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_team ON golf_player_classes(team_id);

-- Migrate existing data: Convert day_of_week to days array and copy course_name to class_name
DO $$
BEGIN
  -- Copy course_name to class_name where class_name is null
  UPDATE golf_player_classes
  SET class_name = course_name
  WHERE class_name IS NULL AND course_name IS NOT NULL;

  -- Convert day_of_week integer to days array
  UPDATE golf_player_classes
  SET days = ARRAY[
    CASE day_of_week
      WHEN 0 THEN 'Sun'
      WHEN 1 THEN 'Mon'
      WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed'
      WHEN 4 THEN 'Thu'
      WHEN 5 THEN 'Fri'
      WHEN 6 THEN 'Sat'
    END
  ]
  WHERE days = '{}' AND day_of_week IS NOT NULL;
END $$;

-- Update RLS policies for team_id access
-- Coaches can view classes for their team members
DROP POLICY IF EXISTS "golf_player_classes_select_coach" ON golf_player_classes;
CREATE POLICY "golf_player_classes_select_coach"
ON golf_player_classes FOR SELECT TO authenticated
USING (
  -- Player can see their own classes
  player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  OR
  -- Coach can see classes for their team members
  player_id IN (
    SELECT tm.player_id
    FROM golf_team_members tm
    JOIN golf_teams t ON t.id = tm.team_id
    JOIN golf_coaches c ON c.organization_id = t.organization_id
    WHERE c.user_id = auth.uid()
  )
  OR
  -- Coach can see classes linked to their team
  team_id IN (
    SELECT t.id
    FROM golf_teams t
    JOIN golf_coaches c ON c.organization_id = t.organization_id
    WHERE c.user_id = auth.uid()
  )
);

-- Players can insert their own classes
DROP POLICY IF EXISTS "golf_player_classes_insert_own" ON golf_player_classes;
CREATE POLICY "golf_player_classes_insert_own"
ON golf_player_classes FOR INSERT TO authenticated
WITH CHECK (
  player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
);

-- Players can update their own classes
DROP POLICY IF EXISTS "golf_player_classes_update_own" ON golf_player_classes;
CREATE POLICY "golf_player_classes_update_own"
ON golf_player_classes FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Players can delete their own classes
DROP POLICY IF EXISTS "golf_player_classes_delete_own" ON golf_player_classes;
CREATE POLICY "golf_player_classes_delete_own"
ON golf_player_classes FOR DELETE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Documentation
COMMENT ON COLUMN golf_player_classes.class_name IS 'Display name of the class (preferred over course_name)';
COMMENT ON COLUMN golf_player_classes.days IS 'Array of days the class meets (Mon, Tue, Wed, etc.)';
COMMENT ON COLUMN golf_player_classes.building IS 'Building name where class is held';
COMMENT ON COLUMN golf_player_classes.room IS 'Room number';
COMMENT ON COLUMN golf_player_classes.credits IS 'Credit hours for the class';
COMMENT ON COLUMN golf_player_classes.color IS 'Hex color for calendar display';
COMMENT ON COLUMN golf_player_classes.notes IS 'Additional notes about the class';
COMMENT ON COLUMN golf_player_classes.team_id IS 'Optional team association for team-wide visibility';
