-- ============================================================================
-- Migration: 022_golf_courses.sql
-- Purpose: Golf course configurations and hole data
-- Consolidated from: 027_golf_courses_schema.sql
-- ============================================================================

-- Golf Courses
CREATE TABLE IF NOT EXISTS golf_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',
  course_rating DECIMAL(4,1),
  slope_rating INTEGER,
  default_tee_name TEXT,
  default_tee_color TEXT,
  total_yardage INTEGER,
  total_par INTEGER,
  created_by UUID REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, city, state, created_by)
);

CREATE INDEX IF NOT EXISTS idx_golf_courses_created_by ON golf_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_courses_name ON golf_courses(name);

-- Golf Course Holes
CREATE TABLE IF NOT EXISTS golf_course_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  yardage INTEGER NOT NULL CHECK (yardage > 0),
  handicap_index INTEGER CHECK (handicap_index BETWEEN 1 AND 18),
  UNIQUE(course_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_golf_course_holes_course_id ON golf_course_holes(course_id);

-- Golf Course Tees
CREATE TABLE IF NOT EXISTS golf_course_tees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  tee_name TEXT NOT NULL,
  tee_color TEXT,
  course_rating DECIMAL(4,1),
  slope_rating INTEGER,
  total_yardage INTEGER,
  hole_yardages JSONB,
  UNIQUE(course_id, tee_name)
);

-- Add course_id FK to golf_rounds (after courses table exists)
ALTER TABLE golf_rounds
ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES golf_courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_golf_rounds_course_id ON golf_rounds(course_id);

-- Trigger
CREATE TRIGGER update_golf_courses_updated_at
  BEFORE UPDATE ON golf_courses
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_courses IS 'Saved course configurations for reuse';
COMMENT ON TABLE golf_course_holes IS 'Hole-by-hole configuration for each course';
COMMENT ON TABLE golf_course_tees IS 'Multiple tee options per course';
COMMENT ON COLUMN golf_rounds.course_id IS 'Optional reference to saved course configuration';
