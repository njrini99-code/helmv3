-- ============================================================================
-- Add Golf Course Setup & Management
-- Migration: 027_golf_courses_schema.sql
-- ============================================================================

-- ============================================================================
-- TABLE: golf_courses
-- Stores saved course configurations for reuse
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Course identification
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',

  -- Course ratings (can vary by tee)
  course_rating DECIMAL(4,1),
  slope_rating INTEGER,

  -- Default tee info
  default_tee_name TEXT, -- 'Blue', 'White', 'Gold', etc.
  default_tee_color TEXT,

  -- Total yardage (calculated from holes)
  total_yardage INTEGER,
  total_par INTEGER,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT false, -- Allow sharing courses
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate courses per user
  UNIQUE(name, city, state, created_by)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_golf_courses_created_by ON golf_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_courses_name ON golf_courses(name);


-- ============================================================================
-- TABLE: golf_course_holes
-- Stores hole-by-hole configuration for each course
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_course_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,

  -- Hole info
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  yardage INTEGER NOT NULL CHECK (yardage > 0),

  -- Optional extras
  handicap_index INTEGER CHECK (handicap_index BETWEEN 1 AND 18), -- Hole difficulty ranking

  -- Ensure unique hole numbers per course
  UNIQUE(course_id, hole_number)
);

-- Index for quick hole lookups
CREATE INDEX IF NOT EXISTS idx_golf_course_holes_course_id ON golf_course_holes(course_id);


-- ============================================================================
-- TABLE: golf_course_tees
-- Stores multiple tee options per course (optional, for future expansion)
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_course_tees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,

  tee_name TEXT NOT NULL, -- 'Championship', 'Blue', 'White', 'Gold', 'Red'
  tee_color TEXT, -- hex color or named color

  course_rating DECIMAL(4,1),
  slope_rating INTEGER,
  total_yardage INTEGER,

  -- Per-hole yardages stored as JSON array [hole1, hole2, ... hole18]
  hole_yardages JSONB,

  UNIQUE(course_id, tee_name)
);


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_course_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_course_tees ENABLE ROW LEVEL SECURITY;

-- Users can view their own courses and public courses
CREATE POLICY "Users can view own and public courses" ON golf_courses
  FOR SELECT USING (
    created_by = auth.uid() OR is_public = true
  );

-- Users can create their own courses
CREATE POLICY "Users can create courses" ON golf_courses
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Users can update their own courses
CREATE POLICY "Users can update own courses" ON golf_courses
  FOR UPDATE USING (created_by = auth.uid());

-- Users can delete their own courses
CREATE POLICY "Users can delete own courses" ON golf_courses
  FOR DELETE USING (created_by = auth.uid());

-- Holes inherit access from parent course
CREATE POLICY "Users can view course holes" ON golf_course_holes
  FOR SELECT USING (
    course_id IN (
      SELECT id FROM golf_courses
      WHERE created_by = auth.uid() OR is_public = true
    )
  );

CREATE POLICY "Users can manage course holes" ON golf_course_holes
  FOR ALL USING (
    course_id IN (
      SELECT id FROM golf_courses WHERE created_by = auth.uid()
    )
  );


-- ============================================================================
-- UPDATE golf_rounds to reference saved courses
-- ============================================================================

-- Add course_id column to golf_rounds if not exists
ALTER TABLE golf_rounds
ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES golf_courses(id) ON DELETE SET NULL;

-- Index for course lookups
CREATE INDEX IF NOT EXISTS idx_golf_rounds_course_id ON golf_rounds(course_id);

-- Comment explaining the relationship
COMMENT ON COLUMN golf_rounds.course_id IS 'Optional reference to saved course configuration';
