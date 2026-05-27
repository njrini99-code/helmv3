-- ============================================================================
-- Migration: 021_golf_rounds.sql
-- Purpose: Golf rounds, holes, and shots tracking
-- Consolidated from: 016_create_golf_schema.sql (rounds section)
-- ============================================================================

-- Golf Rounds
CREATE TABLE IF NOT EXISTS golf_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  qualifier_id UUID, -- FK added after golf_qualifiers table
  course_id UUID, -- FK added after golf_courses table
  round_number INTEGER,
  course_name TEXT NOT NULL,
  course_city TEXT,
  course_state TEXT,
  course_rating DECIMAL(4,1),
  course_slope INTEGER,
  tees_played TEXT,
  round_type golf_round_type NOT NULL DEFAULT 'practice',
  round_status golf_round_status DEFAULT 'in_progress',
  round_date DATE NOT NULL,
  total_score INTEGER,
  total_to_par INTEGER,
  total_putts INTEGER,
  fairways_hit INTEGER,
  fairways_total INTEGER,
  greens_in_regulation INTEGER,
  greens_total INTEGER,
  total_penalties INTEGER,
  notes TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES golf_coaches(id),
  verified_at TIMESTAMPTZ,
  weather_conditions TEXT,
  wind_speed TEXT,
  temperature INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_rounds_player ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_date ON golf_rounds(round_date DESC);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_qualifier ON golf_rounds(qualifier_id) WHERE qualifier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_golf_rounds_type ON golf_rounds(round_type);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_status ON golf_rounds(round_status);

-- Golf Holes (Individual hole scores within a round)
CREATE TABLE IF NOT EXISTS golf_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 5),
  yardage INTEGER,
  score INTEGER NOT NULL CHECK (score >= 1),
  score_to_par INTEGER GENERATED ALWAYS AS (score - par) STORED,
  putts INTEGER CHECK (putts >= 0),
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  up_and_down BOOLEAN,
  sand_save BOOLEAN,
  penalties INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(round_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_golf_holes_round ON golf_holes(round_id);

-- Golf Shots (detailed shot-by-shot tracking)
CREATE TABLE IF NOT EXISTS golf_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id UUID NOT NULL REFERENCES golf_holes(id) ON DELETE CASCADE,
  shot_number INTEGER NOT NULL,
  club golf_shot_club,
  distance_yards INTEGER,
  result golf_shot_result,
  miss_direction golf_miss_direction,
  lie TEXT, -- fairway, rough, bunker, etc.
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_shots_hole ON golf_shots(hole_id);

-- Triggers
CREATE TRIGGER update_golf_rounds_updated_at
  BEFORE UPDATE ON golf_rounds
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Helper function: Calculate round stats from holes
CREATE OR REPLACE FUNCTION calculate_round_stats(p_round_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE golf_rounds
  SET
    total_score = (SELECT COALESCE(SUM(score), 0) FROM golf_holes WHERE round_id = p_round_id),
    total_to_par = (SELECT COALESCE(SUM(score_to_par), 0) FROM golf_holes WHERE round_id = p_round_id),
    total_putts = (SELECT COALESCE(SUM(putts), 0) FROM golf_holes WHERE round_id = p_round_id),
    fairways_hit = (SELECT COUNT(*) FROM golf_holes WHERE round_id = p_round_id AND fairway_hit = true),
    fairways_total = (SELECT COUNT(*) FROM golf_holes WHERE round_id = p_round_id AND par > 3),
    greens_in_regulation = (SELECT COUNT(*) FROM golf_holes WHERE round_id = p_round_id AND green_in_regulation = true),
    greens_total = 18,
    total_penalties = (SELECT COALESCE(SUM(penalties), 0) FROM golf_holes WHERE round_id = p_round_id)
  WHERE id = p_round_id;
END;
$$ LANGUAGE plpgsql;

-- Documentation
COMMENT ON TABLE golf_rounds IS 'Golf rounds played by players';
COMMENT ON TABLE golf_holes IS 'Individual hole scores within a round';
COMMENT ON TABLE golf_shots IS 'Detailed shot-by-shot tracking for analysis';
