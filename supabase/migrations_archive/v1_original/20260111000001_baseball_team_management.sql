-- Baseball Team Management System Migration
-- Creates tables for college/JUCO coach team management with stats tracking and AI insights

-- ============================================
-- 1. BASEBALL PLAYER STATS - Individual stat entries
-- ============================================
CREATE TABLE IF NOT EXISTS baseball_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id),

  -- Classification
  stat_type TEXT NOT NULL CHECK (stat_type IN ('practice', 'game', 'other')),
  session_date DATE NOT NULL,
  session_name TEXT, -- e.g., "Fall Practice #12" or "vs Texas A&M"

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

  -- Pitching Stats (if applicable)
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

  -- Metrics (from trackman/rapsodo)
  exit_velocity NUMERIC(5,1),
  launch_angle NUMERIC(5,1),
  pitch_velocity NUMERIC(5,1),
  spin_rate INTEGER,

  -- Metadata
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'csv_upload', 'api')),
  upload_batch_id UUID,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_baseball_stats_player_type ON baseball_player_stats(player_id, stat_type);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_team_date ON baseball_player_stats(team_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_batch ON baseball_player_stats(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_coach ON baseball_player_stats(coach_id);

-- ============================================
-- 2. BASEBALL STAT UPLOADS - Track CSV upload batches
-- ============================================
CREATE TABLE IF NOT EXISTS baseball_stat_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id),

  filename TEXT NOT NULL,
  stat_type TEXT NOT NULL CHECK (stat_type IN ('practice', 'game', 'other')),
  session_date DATE NOT NULL,
  session_name TEXT,

  -- Upload statistics
  total_rows INTEGER DEFAULT 0,
  matched_rows INTEGER DEFAULT 0,
  unmatched_rows INTEGER DEFAULT 0,

  -- Unmatched player names for manual resolution
  unmatched_data JSONB DEFAULT '[]',

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_baseball_uploads_team ON baseball_stat_uploads(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_uploads_coach ON baseball_stat_uploads(coach_id);
CREATE INDEX IF NOT EXISTS idx_baseball_uploads_status ON baseball_stat_uploads(status);

-- ============================================
-- 3. BASEBALL PLAYER AGGREGATES - Pre-computed stats
-- ============================================
CREATE TABLE IF NOT EXISTS baseball_player_aggregates (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Session counts
  total_sessions INTEGER DEFAULT 0,
  practice_sessions INTEGER DEFAULT 0,
  game_sessions INTEGER DEFAULT 0,

  -- Career/Season batting aggregates
  career_avg NUMERIC(4,3),
  career_obp NUMERIC(4,3),
  career_slg NUMERIC(4,3),
  career_ops NUMERIC(4,3),

  -- Practice vs Game splits (Pressure Performance)
  practice_avg NUMERIC(4,3),
  game_avg NUMERIC(4,3),
  pressure_gap NUMERIC(5,3), -- game_avg - practice_avg (positive = clutch, negative = chokes)

  -- Trend analysis
  recent_trend TEXT CHECK (recent_trend IN ('improving', 'declining', 'stable')),
  trend_magnitude NUMERIC(4,3), -- Magnitude of change
  trend_velocity NUMERIC(5,3), -- Rate of improvement per session

  -- Rolling averages
  last_5_avg NUMERIC(4,3),
  last_10_avg NUMERIC(4,3),
  season_avg NUMERIC(4,3),

  -- Velocity metrics
  avg_exit_velocity NUMERIC(5,1),
  max_exit_velocity NUMERIC(5,1),
  avg_pitch_velocity NUMERIC(5,1),
  max_pitch_velocity NUMERIC(5,1),

  -- Development stage
  development_stage TEXT CHECK (development_stage IN ('emerging', 'developing', 'established', 'elite')),

  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_team ON baseball_player_aggregates(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_trend ON baseball_player_aggregates(recent_trend);

-- ============================================
-- 4. BASEBALL COACH INSIGHTS - AI-generated insights
-- ============================================
CREATE TABLE IF NOT EXISTS baseball_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,

  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'performance_decline',    -- Player stats are dropping
    'performance_surge',      -- Player stats are improving rapidly
    'pressure_gap',           -- Big practice vs game difference
    'streak_hot',             -- Player on hot streak
    'streak_cold',            -- Player on cold streak
    'plateau',                -- Player has stopped improving
    'breakout_candidate',     -- Signs of potential breakout
    'position_opportunity',   -- Position depth chart opportunity
    'development_milestone',  -- Reached a development milestone
    'comparison_alert'        -- Notable comparison to team/league avg
  )),

  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,

  -- Supporting data
  metadata JSONB DEFAULT '{}',
  -- Example metadata:
  -- {
  --   "metric": "batting_avg",
  --   "previousValue": 0.280,
  --   "currentValue": 0.220,
  --   "changePercent": -21.4,
  --   "sessionsAnalyzed": 10
  -- }

  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Auto-expire old insights
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_insights_coach_status ON baseball_coach_insights(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_player ON baseball_coach_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_team ON baseball_coach_insights(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_priority ON baseball_coach_insights(priority);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_type ON baseball_coach_insights(insight_type);

-- ============================================
-- 5. BASEBALL COACH PHILOSOPHY - Coach settings
-- ============================================
CREATE TABLE IF NOT EXISTS baseball_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID UNIQUE NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  -- Priority rankings (1-5, higher = more important)
  priority_hitting INTEGER DEFAULT 3 CHECK (priority_hitting BETWEEN 1 AND 5),
  priority_pitching INTEGER DEFAULT 3 CHECK (priority_pitching BETWEEN 1 AND 5),
  priority_fielding INTEGER DEFAULT 3 CHECK (priority_fielding BETWEEN 1 AND 5),
  priority_speed INTEGER DEFAULT 3 CHECK (priority_speed BETWEEN 1 AND 5),
  priority_mental_game INTEGER DEFAULT 3 CHECK (priority_mental_game BETWEEN 1 AND 5),

  -- Alert sensitivity
  alert_sensitivity TEXT DEFAULT 'balanced' CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),

  -- Thresholds for triggering insights
  decline_threshold NUMERIC(3,2) DEFAULT 2.0, -- Points drop before alerting
  pressure_gap_threshold NUMERIC(3,2) DEFAULT 2.0, -- Practice vs Game gap

  -- Alert type preferences
  alert_performance_decline BOOLEAN DEFAULT true,
  alert_pressure_gap BOOLEAN DEFAULT true,
  alert_streaks BOOLEAN DEFAULT true,
  alert_breakout_candidates BOOLEAN DEFAULT true,
  alert_plateau BOOLEAN DEFAULT true,
  alert_position_opportunities BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE baseball_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_stat_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_player_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_coach_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_coach_philosophy ENABLE ROW LEVEL SECURITY;

-- Baseball Player Stats Policies
CREATE POLICY "Coaches can view stats for their team"
  ON baseball_player_stats FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT team_id FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert stats for their team"
  ON baseball_player_stats FOR INSERT
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update their own stats"
  ON baseball_player_stats FOR UPDATE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete their own stats"
  ON baseball_player_stats FOR DELETE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Baseball Stat Uploads Policies
CREATE POLICY "Coaches can view their uploads"
  ON baseball_stat_uploads FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can create uploads"
  ON baseball_stat_uploads FOR INSERT
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update their uploads"
  ON baseball_stat_uploads FOR UPDATE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Baseball Player Aggregates Policies
CREATE POLICY "Coaches can view aggregates for their team"
  ON baseball_player_aggregates FOR SELECT
  USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN coaches c ON c.id = t.head_coach_id
      WHERE c.user_id = auth.uid()
      UNION
      SELECT tcs.team_id FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage aggregates"
  ON baseball_player_aggregates FOR ALL
  USING (true)
  WITH CHECK (true);

-- Baseball Coach Insights Policies
CREATE POLICY "Coaches can view their insights"
  ON baseball_coach_insights FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage their insights"
  ON baseball_coach_insights FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Baseball Coach Philosophy Policies
CREATE POLICY "Coaches can view their philosophy"
  ON baseball_coach_philosophy FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage their philosophy"
  ON baseball_coach_philosophy FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate batting average
CREATE OR REPLACE FUNCTION calculate_batting_avg(hits INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(hits::NUMERIC / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate OBP
CREATE OR REPLACE FUNCTION calculate_obp(hits INTEGER, walks INTEGER, hbp INTEGER, at_bats INTEGER, sac_flies INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  numerator NUMERIC;
  denominator NUMERIC;
BEGIN
  numerator := COALESCE(hits, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0);
  denominator := COALESCE(at_bats, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0) + COALESCE(sac_flies, 0);

  IF denominator = 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(numerator / denominator, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate SLG
CREATE OR REPLACE FUNCTION calculate_slg(hits INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  singles INTEGER;
  total_bases NUMERIC;
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN
    RETURN NULL;
  END IF;

  singles := COALESCE(hits, 0) - COALESCE(doubles, 0) - COALESCE(triples, 0) - COALESCE(home_runs, 0);
  total_bases := singles + (COALESCE(doubles, 0) * 2) + (COALESCE(triples, 0) * 3) + (COALESCE(home_runs, 0) * 4);

  RETURN ROUND(total_bases / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_baseball_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER baseball_player_stats_updated_at
  BEFORE UPDATE ON baseball_player_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE TRIGGER baseball_player_aggregates_updated_at
  BEFORE UPDATE ON baseball_player_aggregates
  FOR EACH ROW
  EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE TRIGGER baseball_coach_philosophy_updated_at
  BEFORE UPDATE ON baseball_coach_philosophy
  FOR EACH ROW
  EXECUTE FUNCTION update_baseball_stats_updated_at();

-- ============================================
-- ADD INVITE CODE TO TEAMS TABLE (if not exists)
-- ============================================

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

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
