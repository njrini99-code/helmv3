-- ============================================
-- GOLF PLAYER CLASSES - DATABASE SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- Check if table exists, if not this will fail gracefully
-- The golf_player_classes table should already exist

-- Add new columns if they don't exist
DO $$ 
BEGIN
  -- Add days array column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'days') THEN
    ALTER TABLE golf_player_classes ADD COLUMN days text[] DEFAULT '{}';
  END IF;

  -- Add building column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'building') THEN
    ALTER TABLE golf_player_classes ADD COLUMN building text;
  END IF;

  -- Add room column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'room') THEN
    ALTER TABLE golf_player_classes ADD COLUMN room text;
  END IF;

  -- Add credits column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'credits') THEN
    ALTER TABLE golf_player_classes ADD COLUMN credits numeric;
  END IF;

  -- Add notes column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'notes') THEN
    ALTER TABLE golf_player_classes ADD COLUMN notes text;
  END IF;

  -- Add color column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'color') THEN
    ALTER TABLE golf_player_classes ADD COLUMN color text DEFAULT '#16A34A';
  END IF;

  -- Add location column (combined building + room)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'location') THEN
    ALTER TABLE golf_player_classes ADD COLUMN location text;
  END IF;

  -- Add course_code column (if using different name)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'course_code') THEN
    -- Try to rename class_name to course_code or add new
    ALTER TABLE golf_player_classes ADD COLUMN course_code text;
  END IF;

  -- Add instructor column (alias for professor)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'instructor') THEN
    ALTER TABLE golf_player_classes ADD COLUMN instructor text;
  END IF;

  -- Add semester column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'semester') THEN
    ALTER TABLE golf_player_classes ADD COLUMN semester text;
  END IF;

  -- Ensure course_name exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'golf_player_classes' AND column_name = 'course_name') THEN
    ALTER TABLE golf_player_classes ADD COLUMN course_name text;
  END IF;
END $$;

-- Migrate any existing day_of_week data to days array
UPDATE golf_player_classes 
SET days = ARRAY[
  CASE day_of_week 
    WHEN 0 THEN 'Su'
    WHEN 1 THEN 'M'
    WHEN 2 THEN 'T'
    WHEN 3 THEN 'W'
    WHEN 4 THEN 'Th'
    WHEN 5 THEN 'F'
    WHEN 6 THEN 'Sa'
  END
]
WHERE day_of_week IS NOT NULL 
  AND (days IS NULL OR days = '{}');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_player ON golf_player_classes(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_semester ON golf_player_classes(semester);
CREATE INDEX IF NOT EXISTS idx_golf_player_classes_days ON golf_player_classes USING GIN(days);

-- Add RLS policy for coaches to view player classes (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'golf_player_classes' 
    AND policyname = 'Coaches can view team player classes'
  ) THEN
    CREATE POLICY "Coaches can view team player classes" ON golf_player_classes
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM golf_players gp
          JOIN golf_coaches gc ON gc.team_id = gp.team_id
          WHERE gp.id = golf_player_classes.player_id
          AND gc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Verify the table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'golf_player_classes'
ORDER BY ordinal_position;
