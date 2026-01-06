-- ============================================
-- GOLF SHOT TRACKING - COMPREHENSIVE STATS SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. UPDATE golf_rounds TABLE
-- ============================================

-- Add new aggregate columns for quick stats access
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS driving_distance_avg numeric;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS driving_accuracy numeric; -- percentage
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS putts_per_gir numeric;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS scrambling_attempts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS scrambles_made integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS sand_save_attempts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS sand_saves_made integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS penalty_strokes integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS three_putts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS birdies integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS pars integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS bogeys integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS double_bogeys_plus integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS eagles integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_drive integer; -- yards
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_putt_made integer; -- feet
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_hole_out integer; -- yards, from off green


-- ============================================
-- 2. UPDATE golf_holes TABLE
-- ============================================

-- Add detailed hole stats
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS driving_distance integer; -- yards
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS used_driver boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS drive_result text; -- 'fairway', 'rough_left', 'rough_right', 'sand', 'other'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS drive_miss_direction text; -- 'left', 'right'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_distance integer; -- yards from hole when approach taken
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_lie text; -- 'fairway', 'rough', 'sand', 'other'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_result text; -- 'green', 'fringe', 'rough', 'sand', 'other'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_miss_direction text; -- 'short', 'long', 'left', 'right', 'short_left', etc.
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_proximity integer; -- feet from hole after approach
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS scramble_attempt boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS scramble_made boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS sand_save_attempt boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS sand_save_made boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS up_and_down_attempt boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS up_and_down_made boolean DEFAULT false;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS penalty_strokes integer DEFAULT 0;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_distance integer; -- feet
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_leave integer; -- feet remaining after first putt (0 if made)
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_break text; -- 'right_to_left', 'left_to_right', 'straight'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_slope text; -- 'uphill', 'downhill', 'level', 'severe'
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_miss_direction text; -- 'short', 'long', 'left', 'right', etc.
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS holed_out_distance integer; -- yards, if holed from off green
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS holed_out_type text; -- 'chip', 'pitch', 'approach', 'bunker'


-- ============================================
-- 3. CREATE golf_shots TABLE (detailed shot-by-shot)
-- ============================================

CREATE TABLE IF NOT EXISTS golf_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_id uuid REFERENCES golf_holes(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  shot_number integer NOT NULL,
  
  -- Shot classification
  shot_type text NOT NULL, -- 'tee', 'approach', 'around_green', 'putting', 'penalty'
  club_type text NOT NULL, -- 'driver', 'non_driver', 'putter'
  
  -- Position before shot
  lie_before text, -- 'tee', 'fairway', 'rough', 'sand', 'green', 'other'
  distance_to_hole_before integer, -- yards for non-putts, feet for putts
  distance_unit_before text DEFAULT 'yards', -- 'yards' or 'feet'
  
  -- Position after shot
  result text NOT NULL, -- 'fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty'
  distance_to_hole_after integer,
  distance_unit_after text DEFAULT 'yards',
  shot_distance integer, -- calculated: before - after (in same units)
  
  -- Miss direction (when not holed/on target)
  miss_direction text, -- 'left', 'right', 'short', 'long', 'short_left', 'short_right', 'long_left', 'long_right'
  
  -- Putting specific
  putt_break text, -- 'right_to_left', 'left_to_right', 'straight'
  putt_slope text, -- 'uphill', 'downhill', 'level', 'severe'
  
  -- Penalty specific
  is_penalty boolean DEFAULT false,
  penalty_type text, -- 'ob', 'water', 'unplayable', 'lost'
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure shots are ordered
  UNIQUE(round_id, hole_number, shot_number)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_golf_shots_round ON golf_shots(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_shots_hole ON golf_shots(hole_id);
CREATE INDEX IF NOT EXISTS idx_golf_shots_type ON golf_shots(shot_type);
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_hole ON golf_shots(round_id, hole_number);


-- ============================================
-- 4. CREATE golf_player_stats TABLE (aggregated career stats)
-- ============================================

CREATE TABLE IF NOT EXISTS golf_player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  -- General
  rounds_played integer DEFAULT 0,
  holes_played integer DEFAULT 0,
  
  -- Scoring
  scoring_average numeric,
  best_round integer,
  worst_round integer,
  total_birdies integer DEFAULT 0,
  total_eagles integer DEFAULT 0,
  total_pars integer DEFAULT 0,
  total_bogeys integer DEFAULT 0,
  total_double_plus integer DEFAULT 0,
  birdies_per_round numeric,
  eagles_per_round numeric,
  pars_per_round numeric,
  bogeys_per_round numeric,
  double_plus_per_round numeric,
  
  -- Scoring by round type
  practice_scoring_avg numeric,
  practice_rounds integer DEFAULT 0,
  qualifying_scoring_avg numeric,
  qualifying_rounds integer DEFAULT 0,
  tournament_scoring_avg numeric,
  tournament_rounds integer DEFAULT 0,
  
  -- Streaks
  most_birdies_round integer DEFAULT 0,
  most_birdies_row integer DEFAULT 0,
  most_pars_row integer DEFAULT 0,
  current_no_3putt_streak integer DEFAULT 0,
  longest_no_3putt_streak integer DEFAULT 0,
  longest_hole_out integer DEFAULT 0, -- yards
  
  -- Driving
  driving_distance_avg numeric,
  driving_distance_driver_only numeric,
  fairways_hit integer DEFAULT 0,
  fairway_opportunities integer DEFAULT 0,
  fairway_percentage numeric,
  fairway_pct_par4 numeric,
  fairway_pct_par5 numeric,
  fairway_pct_driver numeric,
  fairway_pct_non_driver numeric,
  miss_left_count integer DEFAULT 0,
  miss_right_count integer DEFAULT 0,
  miss_left_pct numeric,
  miss_right_pct numeric,
  
  -- Greens in Regulation
  gir_total integer DEFAULT 0,
  gir_opportunities integer DEFAULT 0,
  gir_percentage numeric,
  gir_per_round numeric,
  gir_pct_par3 numeric,
  gir_pct_par4 numeric,
  gir_pct_par5 numeric,
  
  -- Putting
  total_putts integer DEFAULT 0,
  putts_per_round numeric,
  putts_per_hole numeric,
  putts_per_gir numeric,
  three_putts_total integer DEFAULT 0,
  three_putts_per_round numeric,
  one_putts_total integer DEFAULT 0,
  
  -- Putting by distance (make percentages)
  putt_make_pct_0_3 numeric, -- 0-3 feet
  putt_make_pct_3_5 numeric, -- 3-5 feet
  putt_make_pct_5_10 numeric, -- 5-10 feet
  putt_make_pct_10_15 numeric,
  putt_make_pct_15_20 numeric,
  putt_make_pct_20_25 numeric,
  putt_make_pct_25_30 numeric,
  putt_make_pct_30_35 numeric,
  putt_make_pct_35_plus numeric,
  
  -- Putting proximity (avg leave after first putt)
  putt_proximity_avg numeric, -- feet
  putt_proximity_5_10 numeric,
  putt_proximity_10_15 numeric,
  putt_proximity_15_20 numeric,
  putt_proximity_20_plus numeric,
  
  -- Putting efficiency (avg putts to hole from distance)
  putt_efficiency_0_3 numeric,
  putt_efficiency_3_5 numeric,
  putt_efficiency_5_10 numeric,
  putt_efficiency_10_15 numeric,
  putt_efficiency_15_20 numeric,
  putt_efficiency_20_25 numeric,
  putt_efficiency_25_30 numeric,
  putt_efficiency_30_plus numeric,
  
  -- Putt miss direction percentages
  putt_miss_left_pct numeric,
  putt_miss_right_pct numeric,
  putt_miss_short_pct numeric,
  putt_miss_long_pct numeric,
  
  -- Approach
  approach_proximity_avg numeric, -- feet
  approach_proximity_par3 numeric,
  approach_proximity_par4 numeric,
  approach_proximity_par5 numeric,
  approach_proximity_fairway numeric,
  approach_proximity_rough numeric,
  approach_proximity_sand numeric,
  
  -- Approach by distance buckets (proximity in feet)
  approach_prox_30_75 numeric,
  approach_prox_75_100 numeric,
  approach_prox_100_125 numeric,
  approach_prox_125_150 numeric,
  approach_prox_150_175 numeric,
  approach_prox_175_200 numeric,
  approach_prox_200_225 numeric,
  approach_prox_225_plus numeric,
  
  -- Approach efficiency (avg strokes to hole from distance)
  approach_eff_30_75 numeric,
  approach_eff_75_100 numeric,
  approach_eff_100_125 numeric,
  approach_eff_125_150 numeric,
  approach_eff_150_175 numeric,
  approach_eff_175_200 numeric,
  approach_eff_200_225 numeric,
  approach_eff_225_plus numeric,
  
  -- Scrambling
  scramble_attempts integer DEFAULT 0,
  scrambles_made integer DEFAULT 0,
  scrambling_percentage numeric,
  scrambling_pct_fairway numeric,
  scrambling_pct_rough numeric,
  scrambling_pct_sand numeric,
  scrambling_pct_0_10 numeric, -- by distance
  scrambling_pct_10_20 numeric,
  scrambling_pct_20_30 numeric,
  
  -- Around the green efficiency
  atg_efficiency_avg numeric, -- avg strokes to hole
  atg_efficiency_0_10 numeric,
  atg_efficiency_10_20 numeric,
  atg_efficiency_20_30 numeric,
  atg_eff_fairway numeric,
  atg_eff_rough numeric,
  atg_eff_sand numeric,
  
  -- Sand saves
  sand_save_attempts integer DEFAULT 0,
  sand_saves_made integer DEFAULT 0,
  sand_save_percentage numeric,
  
  -- Penalties
  total_penalties integer DEFAULT 0,
  penalties_per_round numeric,
  
  -- Timestamps
  last_calculated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(player_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_golf_player_stats_player ON golf_player_stats(player_id);


-- ============================================
-- 5. RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_stats ENABLE ROW LEVEL SECURITY;

-- golf_shots policies
CREATE POLICY "Players can view own shots" ON golf_shots
  FOR SELECT USING (
    round_id IN (
      SELECT id FROM golf_rounds WHERE player_id IN (
        SELECT id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Players can insert own shots" ON golf_shots
  FOR INSERT WITH CHECK (
    round_id IN (
      SELECT id FROM golf_rounds WHERE player_id IN (
        SELECT id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Players can update own shots" ON golf_shots
  FOR UPDATE USING (
    round_id IN (
      SELECT id FROM golf_rounds WHERE player_id IN (
        SELECT id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Coaches can view team shots" ON golf_shots
  FOR SELECT USING (
    round_id IN (
      SELECT gr.id FROM golf_rounds gr
      JOIN golf_players gp ON gr.player_id = gp.id
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

-- golf_player_stats policies
CREATE POLICY "Players can view own stats" ON golf_player_stats
  FOR SELECT USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can update own stats" ON golf_player_stats
  FOR ALL USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team stats" ON golf_player_stats
  FOR SELECT USING (
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );


-- ============================================
-- 6. HELPER FUNCTION: Calculate player stats
-- ============================================

CREATE OR REPLACE FUNCTION calculate_player_stats(p_player_id uuid)
RETURNS void AS $$
DECLARE
  v_rounds_played integer;
  v_holes_played integer;
BEGIN
  -- Count rounds and holes
  SELECT COUNT(*), COALESCE(SUM(18), 0)
  INTO v_rounds_played, v_holes_played
  FROM golf_rounds WHERE player_id = p_player_id;
  
  -- Insert or update player stats
  INSERT INTO golf_player_stats (player_id, rounds_played, holes_played, last_calculated_at)
  VALUES (p_player_id, v_rounds_played, v_holes_played, now())
  ON CONFLICT (player_id) DO UPDATE SET
    rounds_played = v_rounds_played,
    holes_played = v_holes_played,
    last_calculated_at = now(),
    updated_at = now();
    
  -- Note: Full stat calculations will be done in application code
  -- This function just ensures the stats row exists
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 7. VERIFY SCHEMA
-- ============================================

SELECT 'golf_shots' as table_name, COUNT(*) as column_count 
FROM information_schema.columns WHERE table_name = 'golf_shots'
UNION ALL
SELECT 'golf_player_stats', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'golf_player_stats'
UNION ALL
SELECT 'golf_holes (updated)', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'golf_holes'
UNION ALL
SELECT 'golf_rounds (updated)', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'golf_rounds';
