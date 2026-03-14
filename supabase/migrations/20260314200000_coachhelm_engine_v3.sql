-- CoachHelm Engine V3: Statistical foundation tables

-- Player baselines (exponentially weighted moving averages)
CREATE TABLE IF NOT EXISTS golf_player_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  ewma_value DECIMAL(10,4),
  rolling_mean DECIMAL(10,4),
  rolling_stddev DECIMAL(10,4),
  sample_size INTEGER DEFAULT 0,
  decay_factor DECIMAL(5,4) DEFAULT 0.15,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_player_baselines_player ON golf_player_baselines(player_id);
ALTER TABLE golf_player_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches and players can view baselines" ON golf_player_baselines FOR SELECT
  USING (auth.uid() = player_id OR EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_coaches gc ON gc.team_id = gtm.team_id
    WHERE gtm.player_id = golf_player_baselines.player_id AND gc.user_id = auth.uid()
  ));

-- Percentile cache
CREATE TABLE IF NOT EXISTS golf_percentile_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  team_percentile DECIMAL(5,2),
  platform_percentile DECIMAL(5,2),
  division_percentile DECIMAL(5,2),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_percentile_cache_player ON golf_percentile_cache(player_id);
ALTER TABLE golf_percentile_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches and players can view percentiles" ON golf_percentile_cache FOR SELECT
  USING (auth.uid() = player_id OR EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_coaches gc ON gc.team_id = gtm.team_id
    WHERE gtm.player_id = golf_percentile_cache.player_id AND gc.user_id = auth.uid()
  ));

-- Prediction validations
CREATE TABLE IF NOT EXISTS golf_prediction_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID,
  player_id UUID NOT NULL,
  predicted_value DECIMAL(6,2),
  actual_value DECIMAL(6,2),
  error DECIMAL(6,2),
  error_pct DECIMAL(5,2),
  within_interval BOOLEAN,
  direction TEXT CHECK (direction IN ('overestimate', 'underestimate', 'accurate')),
  validated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pred_validations_player ON golf_prediction_validations(player_id);
CREATE INDEX IF NOT EXISTS idx_pred_validations_date ON golf_prediction_validations(validated_at DESC);
ALTER TABLE golf_prediction_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and coaches can view validations" ON golf_prediction_validations FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'coach')));

-- Insight feedback scores (aggregated)
CREATE TABLE IF NOT EXISTS golf_insight_feedback_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type TEXT NOT NULL,
  team_id UUID,
  total_shown INTEGER DEFAULT 0,
  total_acted INTEGER DEFAULT 0,
  total_dismissed INTEGER DEFAULT 0,
  total_accurate INTEGER DEFAULT 0,
  accuracy_rate DECIMAL(5,4),
  helpfulness_rate DECIMAL(5,4),
  threshold_adjustment DECIMAL(5,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(insight_type, team_id)
);
ALTER TABLE golf_insight_feedback_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches can view feedback scores" ON golf_insight_feedback_scores FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'coach')));

-- Coach behavior log
CREATE TABLE IF NOT EXISTS golf_coach_behavior_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_behavior_coach ON golf_coach_behavior_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_behavior_date ON golf_coach_behavior_log(created_at DESC);
ALTER TABLE golf_coach_behavior_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches can view own behavior" ON golf_coach_behavior_log FOR SELECT
  USING (coach_id = auth.uid());
CREATE POLICY "System can insert behavior" ON golf_coach_behavior_log FOR INSERT
  WITH CHECK (true);
