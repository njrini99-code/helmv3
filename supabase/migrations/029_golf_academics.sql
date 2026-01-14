-- ============================================================================
-- Migration: 029_golf_academics.sql
-- Purpose: Golf player academic schedules
-- Consolidated from: 016_create_golf_schema.sql (academics section), 055_add_golf_classes.sql
-- ============================================================================

-- Golf Player Classes (Academic schedule)
CREATE TABLE IF NOT EXISTS golf_player_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  course_code TEXT,
  course_name TEXT NOT NULL,
  instructor TEXT,
  location TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  semester TEXT,
  academic_year TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_player_classes_player ON golf_player_classes(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_day ON golf_player_classes(day_of_week);
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_semester ON golf_player_classes(semester);

-- Triggers
CREATE TRIGGER update_golf_player_classes_updated_at
  BEFORE UPDATE ON golf_player_classes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Helper function: Get player's class schedule
CREATE OR REPLACE FUNCTION get_player_class_schedule(p_player_id UUID)
RETURNS TABLE (
  class_id UUID,
  course_code TEXT,
  course_name TEXT,
  instructor TEXT,
  location TEXT,
  day_of_week INTEGER,
  day_name TEXT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id as class_id,
    pc.course_code,
    pc.course_name,
    pc.instructor,
    pc.location,
    pc.day_of_week,
    CASE pc.day_of_week
      WHEN 0 THEN 'Sunday'
      WHEN 1 THEN 'Monday'
      WHEN 2 THEN 'Tuesday'
      WHEN 3 THEN 'Wednesday'
      WHEN 4 THEN 'Thursday'
      WHEN 5 THEN 'Friday'
      WHEN 6 THEN 'Saturday'
    END as day_name,
    pc.start_time,
    pc.end_time
  FROM golf_player_classes pc
  WHERE pc.player_id = p_player_id
  ORDER BY pc.day_of_week, pc.start_time;
END;
$$ LANGUAGE plpgsql;

-- Documentation
COMMENT ON TABLE golf_player_classes IS 'Academic class schedules for golf players';
