-- ============================================================================
-- Migration: 032_baseball_advanced.sql
-- Purpose: Advanced baseball features - stats, insights, recruiting philosophy
-- Consolidated from: 20260111000001_baseball_team_management.sql, 20260111000002_coach_recruiting_philosophy.sql
-- ============================================================================

-- ============================================================================
-- BASEBALL PLAYER STATS - Individual stat entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id),
  stat_type TEXT NOT NULL CHECK (stat_type IN ('practice', 'game', 'other')),
  session_date DATE NOT NULL,
  session_name TEXT,

  -- Hitting Stats
  at_bats INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbis INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,
  caught_stealing INTEGER DEFAULT 0,
  hit_by_pitch INTEGER DEFAULT 0,
  sacrifice_bunts INTEGER DEFAULT 0,
  sacrifice_flies INTEGER DEFAULT 0,

  -- Pitching Stats
  innings_pitched NUMERIC(4,1) DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  runs_allowed INTEGER DEFAULT 0,
  hits_allowed INTEGER DEFAULT 0,
  walks_allowed INTEGER DEFAULT 0,
  strikeouts_thrown INTEGER DEFAULT 0,
  pitches_thrown INTEGER DEFAULT 0,
  strikes_thrown INTEGER DEFAULT 0,

  -- Fielding Stats
  putouts INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,

  -- Metrics
  exit_velocity NUMERIC(5,1),
  launch_angle NUMERIC(5,1),
  pitch_velocity NUMERIC(5,1),
  spin_rate INTEGER,

  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'csv_upload', 'api')),
  upload_batch_id UUID,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_stats_player_type ON baseball_player_stats(player_id, stat_type);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_team_date ON baseball_player_stats(team_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_batch ON baseball_player_stats(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_coach ON baseball_player_stats(coach_id);

-- ============================================================================
-- BASEBALL STAT UPLOADS - Track CSV upload batches
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_stat_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id),
  filename TEXT NOT NULL,
  stat_type TEXT NOT NULL CHECK (stat_type IN ('practice', 'game', 'other')),
  session_date DATE NOT NULL,
  session_name TEXT,
  total_rows INTEGER DEFAULT 0,
  matched_rows INTEGER DEFAULT 0,
  unmatched_rows INTEGER DEFAULT 0,
  unmatched_data JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_baseball_uploads_team ON baseball_stat_uploads(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_uploads_status ON baseball_stat_uploads(status);

-- ============================================================================
-- BASEBALL PLAYER AGGREGATES - Pre-computed stats
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_aggregates (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  practice_sessions INTEGER DEFAULT 0,
  game_sessions INTEGER DEFAULT 0,
  career_avg NUMERIC(4,3),
  career_obp NUMERIC(4,3),
  career_slg NUMERIC(4,3),
  career_ops NUMERIC(4,3),
  practice_avg NUMERIC(4,3),
  game_avg NUMERIC(4,3),
  pressure_gap NUMERIC(5,3),
  recent_trend TEXT CHECK (recent_trend IN ('improving', 'declining', 'stable')),
  trend_magnitude NUMERIC(4,3),
  last_5_avg NUMERIC(4,3),
  last_10_avg NUMERIC(4,3),
  season_avg NUMERIC(4,3),
  avg_exit_velocity NUMERIC(5,1),
  max_exit_velocity NUMERIC(5,1),
  avg_pitch_velocity NUMERIC(5,1),
  max_pitch_velocity NUMERIC(5,1),
  development_stage TEXT CHECK (development_stage IN ('emerging', 'developing', 'established', 'elite')),
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_team ON baseball_player_aggregates(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_trend ON baseball_player_aggregates(recent_trend);

-- ============================================================================
-- BASEBALL COACH INSIGHTS - AI-generated insights
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'performance_decline', 'performance_surge', 'pressure_gap',
    'streak_hot', 'streak_cold', 'plateau', 'breakout_candidate',
    'position_opportunity', 'development_milestone', 'comparison_alert'
  )),
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_insights_coach_status ON baseball_coach_insights(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_player ON baseball_coach_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_team ON baseball_coach_insights(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_priority ON baseball_coach_insights(priority);

-- ============================================================================
-- BASEBALL COACH PHILOSOPHY - Coach settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID UNIQUE NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  priority_hitting INTEGER DEFAULT 3 CHECK (priority_hitting BETWEEN 1 AND 5),
  priority_pitching INTEGER DEFAULT 3 CHECK (priority_pitching BETWEEN 1 AND 5),
  priority_fielding INTEGER DEFAULT 3 CHECK (priority_fielding BETWEEN 1 AND 5),
  priority_speed INTEGER DEFAULT 3 CHECK (priority_speed BETWEEN 1 AND 5),
  priority_mental_game INTEGER DEFAULT 3 CHECK (priority_mental_game BETWEEN 1 AND 5),
  alert_sensitivity TEXT DEFAULT 'balanced' CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),
  decline_threshold NUMERIC(3,2) DEFAULT 2.0,
  pressure_gap_threshold NUMERIC(3,2) DEFAULT 2.0,
  alert_performance_decline BOOLEAN DEFAULT TRUE,
  alert_pressure_gap BOOLEAN DEFAULT TRUE,
  alert_streaks BOOLEAN DEFAULT TRUE,
  alert_breakout_candidates BOOLEAN DEFAULT TRUE,
  alert_plateau BOOLEAN DEFAULT TRUE,
  alert_position_opportunities BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- COACH RECRUITING PHILOSOPHY - Weighted player preferences
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_recruiting_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  weight_exit_velocity INTEGER DEFAULT 20 CHECK (weight_exit_velocity >= 0 AND weight_exit_velocity <= 100),
  weight_pitch_velocity INTEGER DEFAULT 20 CHECK (weight_pitch_velocity >= 0 AND weight_pitch_velocity <= 100),
  weight_sixty_time INTEGER DEFAULT 15 CHECK (weight_sixty_time >= 0 AND weight_sixty_time <= 100),
  weight_gpa INTEGER DEFAULT 15 CHECK (weight_gpa >= 0 AND weight_gpa <= 100),
  weight_height INTEGER DEFAULT 10 CHECK (weight_height >= 0 AND weight_height <= 100),
  weight_weight INTEGER DEFAULT 10 CHECK (weight_weight >= 0 AND weight_weight <= 100),
  weight_arm_strength INTEGER DEFAULT 10 CHECK (weight_arm_strength >= 0 AND weight_arm_strength <= 100),
  position_priorities JSONB DEFAULT '[]'::JSONB,
  min_gpa DECIMAL(3,2) DEFAULT NULL,
  min_exit_velocity INTEGER DEFAULT NULL,
  min_pitch_velocity INTEGER DEFAULT NULL,
  max_sixty_time DECIMAL(4,2) DEFAULT NULL,
  preferred_states JSONB DEFAULT '[]'::JSONB,
  max_distance_miles INTEGER DEFAULT NULL,
  target_grad_years JSONB DEFAULT '[]'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_philosophy_coach_id ON coach_recruiting_philosophy(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_philosophy_active ON coach_recruiting_philosophy(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- PLAYER PERCENTILES CACHE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_percentiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  grad_year INTEGER NOT NULL,
  percentile_exit_velocity INTEGER CHECK (percentile_exit_velocity >= 0 AND percentile_exit_velocity <= 100),
  percentile_pitch_velocity INTEGER CHECK (percentile_pitch_velocity >= 0 AND percentile_pitch_velocity <= 100),
  percentile_sixty_time INTEGER CHECK (percentile_sixty_time >= 0 AND percentile_sixty_time <= 100),
  percentile_gpa INTEGER CHECK (percentile_gpa >= 0 AND percentile_gpa <= 100),
  percentile_height INTEGER CHECK (percentile_height >= 0 AND percentile_height <= 100),
  percentile_weight INTEGER CHECK (percentile_weight >= 0 AND percentile_weight <= 100),
  percentile_arm_strength INTEGER CHECK (percentile_arm_strength >= 0 AND percentile_arm_strength <= 100),
  composite_athletic INTEGER CHECK (composite_athletic >= 0 AND composite_athletic <= 100),
  composite_academic INTEGER CHECK (composite_academic >= 0 AND composite_academic <= 100),
  is_stale BOOLEAN DEFAULT FALSE,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_percentiles_player_id ON player_percentiles(player_id);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_grad_year ON player_percentiles(grad_year);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_stale ON player_percentiles(is_stale) WHERE is_stale = TRUE;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Calculate batting average
CREATE OR REPLACE FUNCTION calculate_batting_avg(hits INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(hits::NUMERIC / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate OBP
CREATE OR REPLACE FUNCTION calculate_obp(hits INTEGER, walks INTEGER, hbp INTEGER, at_bats INTEGER, sac_flies INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  numerator NUMERIC;
  denominator NUMERIC;
BEGIN
  numerator := COALESCE(hits, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0);
  denominator := COALESCE(at_bats, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0) + COALESCE(sac_flies, 0);
  IF denominator = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(numerator / denominator, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate SLG
CREATE OR REPLACE FUNCTION calculate_slg(hits INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  singles INTEGER;
  total_bases NUMERIC;
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN RETURN NULL; END IF;
  singles := COALESCE(hits, 0) - COALESCE(doubles, 0) - COALESCE(triples, 0) - COALESCE(home_runs, 0);
  total_bases := singles + (COALESCE(doubles, 0) * 2) + (COALESCE(triples, 0) * 3) + (COALESCE(home_runs, 0) * 4);
  RETURN ROUND(total_bases / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_baseball_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER baseball_player_stats_updated_at
  BEFORE UPDATE ON baseball_player_stats
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE TRIGGER baseball_player_aggregates_updated_at
  BEFORE UPDATE ON baseball_player_aggregates
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE TRIGGER baseball_coach_philosophy_updated_at
  BEFORE UPDATE ON baseball_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE OR REPLACE FUNCTION update_philosophy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_philosophy_updated_at
  BEFORE UPDATE ON coach_recruiting_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();

CREATE TRIGGER trigger_percentiles_updated_at
  BEFORE UPDATE ON player_percentiles
  FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();

-- Add invite_code to teams if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE teams ADD COLUMN invite_code VARCHAR(8) UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
  END IF;
END $$;

-- Documentation
COMMENT ON TABLE baseball_player_stats IS 'Individual stat entries for baseball players';
COMMENT ON TABLE baseball_player_aggregates IS 'Pre-computed aggregate stats for dashboard display';
COMMENT ON TABLE baseball_coach_insights IS 'AI-generated insights about player performance';
COMMENT ON TABLE coach_recruiting_philosophy IS 'Coach preferences for ranking recruits by metrics';
COMMENT ON TABLE player_percentiles IS 'Cached percentile rankings for player matching';
