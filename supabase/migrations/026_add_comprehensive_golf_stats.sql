-- ============================================================================
-- Add Comprehensive Golf Stats Columns
-- Migration: 026_add_comprehensive_golf_stats.sql
-- ============================================================================

-- Add comprehensive stats columns to golf_rounds table
ALTER TABLE golf_rounds
ADD COLUMN IF NOT EXISTS driving_distance_avg INTEGER,
ADD COLUMN IF NOT EXISTS driving_accuracy DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS putts_per_gir DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS scrambling_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scrambles_made INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sand_save_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sand_saves_made INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS penalty_strokes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS three_putts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS birdies INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pars INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bogeys INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS double_bogeys_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS eagles INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_drive INTEGER,
ADD COLUMN IF NOT EXISTS longest_putt_made INTEGER,
ADD COLUMN IF NOT EXISTS longest_hole_out INTEGER;

-- Add comprehensive stats columns to golf_holes table
ALTER TABLE golf_holes
ADD COLUMN IF NOT EXISTS yardage INTEGER,
ADD COLUMN IF NOT EXISTS driving_distance INTEGER,
ADD COLUMN IF NOT EXISTS used_driver BOOLEAN,
ADD COLUMN IF NOT EXISTS drive_miss_direction TEXT,
ADD COLUMN IF NOT EXISTS approach_distance INTEGER,
ADD COLUMN IF NOT EXISTS approach_lie TEXT,
ADD COLUMN IF NOT EXISTS approach_result TEXT,
ADD COLUMN IF NOT EXISTS approach_miss_direction TEXT,
ADD COLUMN IF NOT EXISTS approach_proximity INTEGER,
ADD COLUMN IF NOT EXISTS scramble_attempt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scramble_made BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sand_save_attempt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sand_save_made BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS up_and_down_attempt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS up_and_down_made BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS penalty_strokes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_putt_distance INTEGER,
ADD COLUMN IF NOT EXISTS first_putt_leave INTEGER,
ADD COLUMN IF NOT EXISTS first_putt_break TEXT,
ADD COLUMN IF NOT EXISTS first_putt_slope TEXT,
ADD COLUMN IF NOT EXISTS first_putt_miss_direction TEXT,
ADD COLUMN IF NOT EXISTS holed_out_distance INTEGER,
ADD COLUMN IF NOT EXISTS holed_out_type TEXT;

-- Create golf_shots table for detailed shot tracking
CREATE TABLE IF NOT EXISTS golf_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_id UUID REFERENCES golf_holes(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  shot_number INTEGER NOT NULL,
  shot_type TEXT NOT NULL CHECK (shot_type IN ('tee', 'approach', 'around_green', 'putting', 'penalty')),
  club_type TEXT NOT NULL CHECK (club_type IN ('driver', 'non_driver', 'putter')),
  lie_before TEXT NOT NULL CHECK (lie_before IN ('tee', 'fairway', 'rough', 'sand', 'green', 'other')),
  distance_to_hole_before INTEGER NOT NULL,
  distance_unit_before TEXT NOT NULL CHECK (distance_unit_before IN ('yards', 'feet')),
  result TEXT NOT NULL CHECK (result IN ('fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty')),
  distance_to_hole_after INTEGER NOT NULL,
  distance_unit_after TEXT NOT NULL CHECK (distance_unit_after IN ('yards', 'feet')),
  shot_distance INTEGER NOT NULL,
  miss_direction TEXT,
  putt_break TEXT CHECK (putt_break IN ('right_to_left', 'left_to_right', 'straight')),
  putt_slope TEXT CHECK (putt_slope IN ('uphill', 'downhill', 'level', 'severe')),
  is_penalty BOOLEAN DEFAULT FALSE,
  penalty_type TEXT CHECK (penalty_type IN ('ob', 'water', 'unplayable', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for golf_shots
CREATE INDEX IF NOT EXISTS idx_golf_shots_round ON golf_shots(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_shots_hole ON golf_shots(hole_id);

-- Enable RLS on golf_shots
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for golf_shots
CREATE POLICY "Users can view their own golf shots"
  ON golf_shots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own golf shots"
  ON golf_shots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own golf shots"
  ON golf_shots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own golf shots"
  ON golf_shots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- Comment explaining the comprehensive stats
COMMENT ON COLUMN golf_rounds.driving_distance_avg IS 'Average driving distance for the round (yards)';
COMMENT ON COLUMN golf_rounds.driving_accuracy IS 'Fairway hit percentage for the round';
COMMENT ON COLUMN golf_rounds.putts_per_gir IS 'Average putts per green in regulation';
COMMENT ON COLUMN golf_rounds.longest_drive IS 'Longest drive distance in the round (yards)';
COMMENT ON COLUMN golf_rounds.longest_putt_made IS 'Longest putt made in the round (feet)';
COMMENT ON COLUMN golf_rounds.longest_hole_out IS 'Longest hole out from off the green (yards)';
