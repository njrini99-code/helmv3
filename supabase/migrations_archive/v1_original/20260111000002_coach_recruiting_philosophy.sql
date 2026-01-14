-- Coach Recruiting Philosophy System
-- Enables coaches to set weighted preferences for player metrics
-- Players are ranked by how well they match coach preferences

-- ============================================================================
-- COACH RECRUITING PHILOSOPHY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_recruiting_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  -- Metric weights (0-100, should sum to ~100 for normalization)
  weight_exit_velocity INTEGER DEFAULT 20 CHECK (weight_exit_velocity >= 0 AND weight_exit_velocity <= 100),
  weight_pitch_velocity INTEGER DEFAULT 20 CHECK (weight_pitch_velocity >= 0 AND weight_pitch_velocity <= 100),
  weight_sixty_time INTEGER DEFAULT 15 CHECK (weight_sixty_time >= 0 AND weight_sixty_time <= 100),
  weight_gpa INTEGER DEFAULT 15 CHECK (weight_gpa >= 0 AND weight_gpa <= 100),
  weight_height INTEGER DEFAULT 10 CHECK (weight_height >= 0 AND weight_height <= 100),
  weight_weight INTEGER DEFAULT 10 CHECK (weight_weight >= 0 AND weight_weight <= 100),
  weight_arm_strength INTEGER DEFAULT 10 CHECK (weight_arm_strength >= 0 AND weight_arm_strength <= 100),

  -- Position priorities (JSON array of position codes in priority order)
  -- e.g., ["SS", "2B", "CF", "P"] means SS is most desired
  position_priorities JSONB DEFAULT '[]'::JSONB,

  -- Minimum standards (players below these are filtered out or penalized)
  min_gpa DECIMAL(3,2) DEFAULT NULL,
  min_exit_velocity INTEGER DEFAULT NULL,
  min_pitch_velocity INTEGER DEFAULT NULL,
  max_sixty_time DECIMAL(4,2) DEFAULT NULL,

  -- Geographic preferences
  preferred_states JSONB DEFAULT '[]'::JSONB,
  max_distance_miles INTEGER DEFAULT NULL,

  -- Grad year focus
  target_grad_years JSONB DEFAULT '[]'::JSONB,

  -- Settings
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(coach_id)
);

-- ============================================================================
-- PLAYER PERCENTILES CACHE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_percentiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  grad_year INTEGER NOT NULL,

  -- Percentile rankings within grad year (0-100, NULL if no data)
  percentile_exit_velocity INTEGER CHECK (percentile_exit_velocity >= 0 AND percentile_exit_velocity <= 100),
  percentile_pitch_velocity INTEGER CHECK (percentile_pitch_velocity >= 0 AND percentile_pitch_velocity <= 100),
  percentile_sixty_time INTEGER CHECK (percentile_sixty_time >= 0 AND percentile_sixty_time <= 100),
  percentile_gpa INTEGER CHECK (percentile_gpa >= 0 AND percentile_gpa <= 100),
  percentile_height INTEGER CHECK (percentile_height >= 0 AND percentile_height <= 100),
  percentile_weight INTEGER CHECK (percentile_weight >= 0 AND percentile_weight <= 100),
  percentile_arm_strength INTEGER CHECK (percentile_arm_strength >= 0 AND percentile_arm_strength <= 100),

  -- Composite scores (pre-calculated for common queries)
  composite_athletic INTEGER CHECK (composite_athletic >= 0 AND composite_athletic <= 100),
  composite_academic INTEGER CHECK (composite_academic >= 0 AND composite_academic <= 100),

  -- Cache management
  is_stale BOOLEAN DEFAULT false,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(player_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_coach_philosophy_coach_id ON coach_recruiting_philosophy(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_philosophy_active ON coach_recruiting_philosophy(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_player_percentiles_player_id ON player_percentiles(player_id);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_grad_year ON player_percentiles(grad_year);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_stale ON player_percentiles(is_stale) WHERE is_stale = true;

-- Composite indexes for efficient match queries
CREATE INDEX IF NOT EXISTS idx_player_percentiles_exit_velo ON player_percentiles(grad_year, percentile_exit_velocity DESC) WHERE percentile_exit_velocity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_percentiles_pitch_velo ON player_percentiles(grad_year, percentile_pitch_velocity DESC) WHERE percentile_pitch_velocity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_percentiles_gpa ON player_percentiles(grad_year, percentile_gpa DESC) WHERE percentile_gpa IS NOT NULL;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_philosophy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_philosophy_updated_at
  BEFORE UPDATE ON coach_recruiting_philosophy
  FOR EACH ROW
  EXECUTE FUNCTION update_philosophy_updated_at();

CREATE TRIGGER trigger_percentiles_updated_at
  BEFORE UPDATE ON player_percentiles
  FOR EACH ROW
  EXECUTE FUNCTION update_philosophy_updated_at();

-- ============================================================================
-- TRIGGER: Mark percentiles stale when player metrics change
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_percentiles_stale()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark this player's percentiles as stale
  UPDATE player_percentiles
  SET is_stale = true, updated_at = NOW()
  WHERE player_id = NEW.id;

  -- Also mark all players in same grad year as stale (percentiles are relative)
  IF OLD.grad_year IS DISTINCT FROM NEW.grad_year
     OR OLD.exit_velo IS DISTINCT FROM NEW.exit_velo
     OR OLD.pitch_velo IS DISTINCT FROM NEW.pitch_velo
     OR OLD.sixty_time IS DISTINCT FROM NEW.sixty_time
     OR OLD.gpa IS DISTINCT FROM NEW.gpa
     OR OLD.height_feet IS DISTINCT FROM NEW.height_feet
     OR OLD.height_inches IS DISTINCT FROM NEW.height_inches
     OR OLD.weight_lbs IS DISTINCT FROM NEW.weight_lbs
  THEN
    UPDATE player_percentiles pp
    SET is_stale = true, updated_at = NOW()
    FROM players p
    WHERE pp.player_id = p.id
      AND p.grad_year = COALESCE(NEW.grad_year, OLD.grad_year);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_player_metrics_changed
  AFTER UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION mark_percentiles_stale();

-- ============================================================================
-- FUNCTION: Calculate percentiles for a grad year
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_grad_year_percentiles(target_grad_year INTEGER)
RETURNS void AS $$
DECLARE
  player_record RECORD;
BEGIN
  -- Calculate percentiles for each player in the grad year
  FOR player_record IN
    SELECT
      p.id,
      p.exit_velo,
      p.pitch_velo,
      p.sixty_time,
      p.gpa,
      (p.height_feet * 12 + COALESCE(p.height_inches, 0)) as total_height,
      p.weight_lbs,
      -- Calculate percentile ranks using window functions
      CASE WHEN p.exit_velo IS NOT NULL THEN
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY p.exit_velo ASC) * 100
      END as pct_exit_velo,
      CASE WHEN p.pitch_velo IS NOT NULL THEN
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY p.pitch_velo ASC) * 100
      END as pct_pitch_velo,
      CASE WHEN p.sixty_time IS NOT NULL THEN
        -- Lower 60 time is better, so reverse the ranking
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY p.sixty_time DESC) * 100
      END as pct_sixty_time,
      CASE WHEN p.gpa IS NOT NULL THEN
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY p.gpa ASC) * 100
      END as pct_gpa,
      CASE WHEN p.height_feet IS NOT NULL THEN
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY (p.height_feet * 12 + COALESCE(p.height_inches, 0)) ASC) * 100
      END as pct_height,
      CASE WHEN p.weight_lbs IS NOT NULL THEN
        PERCENT_RANK() OVER (PARTITION BY p.grad_year ORDER BY p.weight_lbs ASC) * 100
      END as pct_weight
    FROM players p
    WHERE p.grad_year = target_grad_year
  LOOP
    -- Upsert percentile record
    INSERT INTO player_percentiles (
      player_id,
      grad_year,
      percentile_exit_velocity,
      percentile_pitch_velocity,
      percentile_sixty_time,
      percentile_gpa,
      percentile_height,
      percentile_weight,
      is_stale,
      calculated_at
    ) VALUES (
      player_record.id,
      target_grad_year,
      ROUND(player_record.pct_exit_velo)::INTEGER,
      ROUND(player_record.pct_pitch_velo)::INTEGER,
      ROUND(player_record.pct_sixty_time)::INTEGER,
      ROUND(player_record.pct_gpa)::INTEGER,
      ROUND(player_record.pct_height)::INTEGER,
      ROUND(player_record.pct_weight)::INTEGER,
      false,
      NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
      grad_year = EXCLUDED.grad_year,
      percentile_exit_velocity = EXCLUDED.percentile_exit_velocity,
      percentile_pitch_velocity = EXCLUDED.percentile_pitch_velocity,
      percentile_sixty_time = EXCLUDED.percentile_sixty_time,
      percentile_gpa = EXCLUDED.percentile_gpa,
      percentile_height = EXCLUDED.percentile_height,
      percentile_weight = EXCLUDED.percentile_weight,
      is_stale = false,
      calculated_at = NOW(),
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Calculate match score for a player against coach philosophy
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_player_match_score(
  p_player_id UUID,
  p_coach_id UUID
)
RETURNS TABLE (
  match_score INTEGER,
  score_breakdown JSONB
) AS $$
DECLARE
  philosophy RECORD;
  percentiles RECORD;
  total_weight INTEGER;
  weighted_sum NUMERIC;
  breakdown JSONB;
BEGIN
  -- Get coach philosophy
  SELECT * INTO philosophy
  FROM coach_recruiting_philosophy
  WHERE coach_id = p_coach_id AND is_active = true;

  IF NOT FOUND THEN
    -- No philosophy set, return neutral score
    RETURN QUERY SELECT 50, '{}'::JSONB;
    RETURN;
  END IF;

  -- Get player percentiles
  SELECT * INTO percentiles
  FROM player_percentiles
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    -- No percentiles calculated, return neutral score
    RETURN QUERY SELECT 50, '{}'::JSONB;
    RETURN;
  END IF;

  -- Calculate weighted score
  total_weight := 0;
  weighted_sum := 0;
  breakdown := '{}'::JSONB;

  -- Exit velocity
  IF percentiles.percentile_exit_velocity IS NOT NULL AND philosophy.weight_exit_velocity > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_exit_velocity * philosophy.weight_exit_velocity);
    total_weight := total_weight + philosophy.weight_exit_velocity;
    breakdown := breakdown || jsonb_build_object('exit_velocity', jsonb_build_object(
      'percentile', percentiles.percentile_exit_velocity,
      'weight', philosophy.weight_exit_velocity
    ));
  END IF;

  -- Pitch velocity
  IF percentiles.percentile_pitch_velocity IS NOT NULL AND philosophy.weight_pitch_velocity > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_pitch_velocity * philosophy.weight_pitch_velocity);
    total_weight := total_weight + philosophy.weight_pitch_velocity;
    breakdown := breakdown || jsonb_build_object('pitch_velocity', jsonb_build_object(
      'percentile', percentiles.percentile_pitch_velocity,
      'weight', philosophy.weight_pitch_velocity
    ));
  END IF;

  -- 60-yard time
  IF percentiles.percentile_sixty_time IS NOT NULL AND philosophy.weight_sixty_time > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_sixty_time * philosophy.weight_sixty_time);
    total_weight := total_weight + philosophy.weight_sixty_time;
    breakdown := breakdown || jsonb_build_object('sixty_time', jsonb_build_object(
      'percentile', percentiles.percentile_sixty_time,
      'weight', philosophy.weight_sixty_time
    ));
  END IF;

  -- GPA
  IF percentiles.percentile_gpa IS NOT NULL AND philosophy.weight_gpa > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_gpa * philosophy.weight_gpa);
    total_weight := total_weight + philosophy.weight_gpa;
    breakdown := breakdown || jsonb_build_object('gpa', jsonb_build_object(
      'percentile', percentiles.percentile_gpa,
      'weight', philosophy.weight_gpa
    ));
  END IF;

  -- Height
  IF percentiles.percentile_height IS NOT NULL AND philosophy.weight_height > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_height * philosophy.weight_height);
    total_weight := total_weight + philosophy.weight_height;
    breakdown := breakdown || jsonb_build_object('height', jsonb_build_object(
      'percentile', percentiles.percentile_height,
      'weight', philosophy.weight_height
    ));
  END IF;

  -- Weight
  IF percentiles.percentile_weight IS NOT NULL AND philosophy.weight_weight > 0 THEN
    weighted_sum := weighted_sum + (percentiles.percentile_weight * philosophy.weight_weight);
    total_weight := total_weight + philosophy.weight_weight;
    breakdown := breakdown || jsonb_build_object('weight', jsonb_build_object(
      'percentile', percentiles.percentile_weight,
      'weight', philosophy.weight_weight
    ));
  END IF;

  -- Calculate final score
  IF total_weight > 0 THEN
    RETURN QUERY SELECT
      ROUND(weighted_sum / total_weight)::INTEGER,
      breakdown;
  ELSE
    RETURN QUERY SELECT 50, '{}'::JSONB;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE coach_recruiting_philosophy ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_percentiles ENABLE ROW LEVEL SECURITY;

-- Coaches can only see/edit their own philosophy
CREATE POLICY "Coaches can view own philosophy"
  ON coach_recruiting_philosophy FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert own philosophy"
  ON coach_recruiting_philosophy FOR INSERT
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update own philosophy"
  ON coach_recruiting_philosophy FOR UPDATE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete own philosophy"
  ON coach_recruiting_philosophy FOR DELETE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Player percentiles are readable by coaches (for matching)
CREATE POLICY "Coaches can view player percentiles"
  ON player_percentiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Players can view their own percentiles
CREATE POLICY "Players can view own percentiles"
  ON player_percentiles FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all percentiles (for background jobs)
CREATE POLICY "Service role manages percentiles"
  ON player_percentiles FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON coach_recruiting_philosophy TO authenticated;
GRANT SELECT ON player_percentiles TO authenticated;
GRANT ALL ON player_percentiles TO service_role;

GRANT EXECUTE ON FUNCTION calculate_grad_year_percentiles(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_player_match_score(UUID, UUID) TO authenticated;
