-- ============================================================================
-- COACHHELM V2 INTELLIGENCE ENGINE
-- Pattern mining, causal discovery, predictions, and learning tables
-- ============================================================================

-- Drop existing tables (they were created with incomplete schemas)
-- These are AI/analytics tables, not user data - safe to recreate
DROP TABLE IF EXISTS golf_validations CASCADE;
DROP TABLE IF EXISTS golf_predictions CASCADE;
DROP TABLE IF EXISTS golf_confidence_calibration CASCADE;
DROP TABLE IF EXISTS golf_global_patterns CASCADE;
DROP TABLE IF EXISTS golf_learned_behavior CASCADE;
DROP TABLE IF EXISTS golf_causal_relationships CASCADE;
DROP TABLE IF EXISTS golf_patterns_v2 CASCADE;

-- Pattern storage (V2 - multi-dimensional mining)
CREATE TABLE IF NOT EXISTS golf_patterns_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'conditional', 'compound', 'anomaly', 'regression', 'sequence', 'temporal'
  )),
  conditions JSONB NOT NULL DEFAULT '[]',
  outcome JSONB NOT NULL DEFAULT '{}',
  support DECIMAL(4,3) CHECK (support >= 0 AND support <= 1),
  confidence DECIMAL(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  lift DECIMAL(6,2),
  conviction DECIMAL(6,2),
  stroke_impact DECIMAL(5,2),
  actionability DECIMAL(3,2) CHECK (actionability >= 0 AND actionability <= 1),
  sample_size INTEGER NOT NULL DEFAULT 0,
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_occurrence TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INTEGER DEFAULT 1,
  trend TEXT CHECK (trend IN ('strengthening', 'stable', 'weakening', 'new')),
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Causal relationships discovered
CREATE TABLE IF NOT EXISTS golf_causal_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  cause TEXT NOT NULL,
  cause_metric TEXT,
  effect TEXT NOT NULL,
  effect_metric TEXT,
  relationship_type TEXT CHECK (relationship_type IN (
    'direct', 'mediated', 'moderated', 'bidirectional'
  )),
  strength DECIMAL(4,3) CHECK (strength >= 0 AND strength <= 1),
  confidence DECIMAL(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  mechanism TEXT,
  confounders JSONB DEFAULT '[]',
  temporal_lag_days INTEGER,
  dose_response BOOLEAN DEFAULT FALSE,
  intervention_potential DECIMAL(3,2) CHECK (intervention_potential >= 0 AND intervention_potential <= 1),
  evidence JSONB DEFAULT '{}',
  validated_at TIMESTAMPTZ,
  validation_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions for validation
CREATE TABLE IF NOT EXISTS golf_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL CHECK (prediction_type IN (
    'round_score', 'metric', 'trajectory', 'comparison', 'milestone'
  )),
  metric TEXT NOT NULL,
  predicted_value DECIMAL(8,2),
  predicted_range_low DECIMAL(8,2),
  predicted_range_high DECIMAL(8,2),
  confidence DECIMAL(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  calibrated_confidence DECIMAL(4,3),
  confidence_interval JSONB DEFAULT '{}',
  features_snapshot JSONB DEFAULT '{}',
  model_version TEXT DEFAULT 'v2.0',
  key_factors JSONB DEFAULT '[]',
  sensitivities JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  due_date DATE,
  target_round_id UUID REFERENCES golf_rounds(id) ON DELETE SET NULL,
  actual_value DECIMAL(8,2),
  validated_at TIMESTAMPTZ,
  was_correct BOOLEAN,
  error_absolute DECIMAL(6,2),
  error_relative DECIMAL(4,3),
  within_interval BOOLEAN,
  direction_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned behavior (from coach/player interactions)
CREATE TABLE IF NOT EXISTS golf_learned_behavior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('coach', 'player', 'team')),
  interactions JSONB DEFAULT '{"views": 0, "clicks": 0, "dismissals": 0, "actions": 0}',
  preferences JSONB DEFAULT '{}',
  learned_thresholds JSONB DEFAULT '{}',
  engagement_patterns JSONB DEFAULT '{}',
  insight_feedback JSONB DEFAULT '[]',
  content_preferences JSONB DEFAULT '{"verbosity": "balanced", "focus_areas": []}',
  active_features JSONB DEFAULT '[]',
  last_interaction_at TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  engagement_score DECIMAL(4,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, entity_type)
);

-- Validation results for predictions
CREATE TABLE IF NOT EXISTS golf_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES golf_predictions(id) ON DELETE CASCADE,
  stated_confidence DECIMAL(4,3),
  actual_confidence_bucket DECIMAL(2,1),
  was_correct BOOLEAN NOT NULL,
  absolute_error DECIMAL(8,2),
  relative_error DECIMAL(4,3),
  within_confidence_interval BOOLEAN,
  direction_correct BOOLEAN,
  learning_signals JSONB DEFAULT '{}',
  model_adjustments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global patterns (cross-player learning)
CREATE TABLE IF NOT EXISTS golf_global_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]',
  outcome JSONB NOT NULL DEFAULT '{}',
  prevalence DECIMAL(4,3),
  average_impact DECIMAL(5,2),
  confidence DECIMAL(4,3),
  instance_count INTEGER DEFAULT 0,
  player_count INTEGER DEFAULT 0,
  varied_by_tier JSONB DEFAULT '{}',
  varied_by_style JSONB DEFAULT '{}',
  varied_by_handicap JSONB DEFAULT '{}',
  is_universal BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Confidence calibration tracking
CREATE TABLE IF NOT EXISTS golf_confidence_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket DECIMAL(2,1) NOT NULL CHECK (bucket >= 0 AND bucket <= 1),
  prediction_type TEXT NOT NULL,
  predictions_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  actual_accuracy DECIMAL(4,3),
  sample_size INTEGER DEFAULT 0,
  calibration_error DECIMAL(4,3),
  last_recalibrated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bucket, prediction_type)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Patterns indexes
CREATE INDEX IF NOT EXISTS idx_patterns_v2_player ON golf_patterns_v2(player_id);
CREATE INDEX IF NOT EXISTS idx_patterns_v2_type ON golf_patterns_v2(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_v2_active ON golf_patterns_v2(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_patterns_v2_confidence ON golf_patterns_v2(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_v2_impact ON golf_patterns_v2(stroke_impact DESC);

-- Causal relationships indexes
CREATE INDEX IF NOT EXISTS idx_causal_player ON golf_causal_relationships(player_id);
CREATE INDEX IF NOT EXISTS idx_causal_team ON golf_causal_relationships(team_id);
CREATE INDEX IF NOT EXISTS idx_causal_strength ON golf_causal_relationships(strength DESC);

-- Predictions indexes
CREATE INDEX IF NOT EXISTS idx_predictions_player ON golf_predictions(player_id);
CREATE INDEX IF NOT EXISTS idx_predictions_type ON golf_predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_due ON golf_predictions(due_date) WHERE validated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_predictions_pending ON golf_predictions(validated_at) WHERE validated_at IS NULL;

-- Learned behavior indexes
CREATE INDEX IF NOT EXISTS idx_learned_entity ON golf_learned_behavior(entity_id, entity_type);

-- Validations indexes
CREATE INDEX IF NOT EXISTS idx_validations_prediction ON golf_validations(prediction_id);
CREATE INDEX IF NOT EXISTS idx_validations_correct ON golf_validations(was_correct);

-- Global patterns indexes
CREATE INDEX IF NOT EXISTS idx_global_patterns_type ON golf_global_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_global_patterns_prevalence ON golf_global_patterns(prevalence DESC);

-- Calibration indexes
CREATE INDEX IF NOT EXISTS idx_calibration_bucket ON golf_confidence_calibration(bucket, prediction_type);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE golf_patterns_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_causal_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_learned_behavior ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_global_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_confidence_calibration ENABLE ROW LEVEL SECURITY;

-- Patterns: players see their own, coaches see team's
CREATE POLICY "Players can view own patterns" ON golf_patterns_v2
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM golf_players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view team patterns" ON golf_patterns_v2
  FOR SELECT USING (
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage patterns" ON golf_patterns_v2
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM golf_coaches
      UNION
      SELECT user_id FROM golf_players WHERE id = player_id
    )
  );

-- Causal relationships: similar access pattern
CREATE POLICY "Players can view own causal" ON golf_causal_relationships
  FOR SELECT USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team causal" ON golf_causal_relationships
  FOR SELECT USING (
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
    OR team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "System can manage causal" ON golf_causal_relationships
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM golf_coaches)
    OR (player_id IS NOT NULL AND player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
  );

-- Predictions: players see their own, coaches see team's
CREATE POLICY "Players can view own predictions" ON golf_predictions
  FOR SELECT USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team predictions" ON golf_predictions
  FOR SELECT USING (
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage predictions" ON golf_predictions
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM golf_coaches)
    OR player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

-- Learned behavior: entity can see/manage their own
CREATE POLICY "Entity can view own behavior" ON golf_learned_behavior
  FOR SELECT USING (
    (entity_type = 'coach' AND entity_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
    OR (entity_type = 'player' AND entity_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
    OR (entity_type = 'team' AND entity_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()))
  );

CREATE POLICY "Entity can manage own behavior" ON golf_learned_behavior
  FOR ALL USING (
    (entity_type = 'coach' AND entity_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
    OR (entity_type = 'player' AND entity_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
    OR (entity_type = 'team' AND entity_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()))
  );

-- Validations: follow prediction access
CREATE POLICY "View validations via prediction" ON golf_validations
  FOR SELECT USING (
    prediction_id IN (
      SELECT id FROM golf_predictions WHERE player_id IN (
        SELECT id FROM golf_players WHERE user_id = auth.uid()
      )
    )
    OR prediction_id IN (
      SELECT p.id FROM golf_predictions p
      JOIN golf_players gp ON p.player_id = gp.id
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage validations" ON golf_validations
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM golf_coaches));

-- Global patterns: read-only for authenticated users
CREATE POLICY "Authenticated can read global patterns" ON golf_global_patterns
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can manage global patterns" ON golf_global_patterns
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM golf_coaches));

-- Calibration: read-only for authenticated users
CREATE POLICY "Authenticated can read calibration" ON golf_confidence_calibration
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can manage calibration" ON golf_confidence_calibration
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM golf_coaches));

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get active patterns for a player
CREATE OR REPLACE FUNCTION get_player_active_patterns(p_player_id UUID)
RETURNS TABLE (
  id UUID,
  pattern_type TEXT,
  conditions JSONB,
  outcome JSONB,
  confidence DECIMAL,
  stroke_impact DECIMAL,
  trend TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gp.id,
    gp.pattern_type,
    gp.conditions,
    gp.outcome,
    gp.confidence,
    gp.stroke_impact,
    gp.trend
  FROM golf_patterns_v2 gp
  WHERE gp.player_id = p_player_id
    AND gp.is_active = TRUE
    AND gp.confidence >= 0.6
  ORDER BY gp.stroke_impact DESC NULLS LAST
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a prediction for later validation
CREATE OR REPLACE FUNCTION record_prediction(
  p_player_id UUID,
  p_prediction_type TEXT,
  p_metric TEXT,
  p_predicted_value DECIMAL,
  p_confidence DECIMAL,
  p_due_date DATE DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_prediction_id UUID;
BEGIN
  INSERT INTO golf_predictions (
    player_id,
    prediction_type,
    metric,
    predicted_value,
    confidence,
    due_date,
    context
  ) VALUES (
    p_player_id,
    p_prediction_type,
    p_metric,
    p_predicted_value,
    p_confidence,
    COALESCE(p_due_date, CURRENT_DATE + INTERVAL '7 days'),
    p_context
  )
  RETURNING id INTO v_prediction_id;

  RETURN v_prediction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate a prediction against actual outcome
CREATE OR REPLACE FUNCTION validate_prediction(
  p_prediction_id UUID,
  p_actual_value DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_prediction RECORD;
  v_was_correct BOOLEAN;
  v_abs_error DECIMAL;
  v_rel_error DECIMAL;
  v_within_interval BOOLEAN;
BEGIN
  -- Get the prediction
  SELECT * INTO v_prediction FROM golf_predictions WHERE id = p_prediction_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Calculate errors
  v_abs_error := ABS(p_actual_value - v_prediction.predicted_value);
  v_rel_error := CASE
    WHEN v_prediction.predicted_value != 0 THEN v_abs_error / ABS(v_prediction.predicted_value)
    ELSE NULL
  END;

  -- Check if within confidence interval
  v_within_interval := (
    p_actual_value >= COALESCE(v_prediction.predicted_range_low, v_prediction.predicted_value - 5)
    AND p_actual_value <= COALESCE(v_prediction.predicted_range_high, v_prediction.predicted_value + 5)
  );

  -- Determine if "correct" (within 10% or within interval)
  v_was_correct := v_within_interval OR (v_rel_error IS NOT NULL AND v_rel_error <= 0.10);

  -- Update prediction
  UPDATE golf_predictions SET
    actual_value = p_actual_value,
    validated_at = NOW(),
    was_correct = v_was_correct,
    error_absolute = v_abs_error,
    error_relative = v_rel_error,
    within_interval = v_within_interval
  WHERE id = p_prediction_id;

  -- Record validation
  INSERT INTO golf_validations (
    prediction_id,
    stated_confidence,
    actual_confidence_bucket,
    was_correct,
    absolute_error,
    relative_error,
    within_confidence_interval
  ) VALUES (
    p_prediction_id,
    v_prediction.confidence,
    ROUND(v_prediction.confidence, 1),
    v_was_correct,
    v_abs_error,
    v_rel_error,
    v_within_interval
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update confidence calibration
CREATE OR REPLACE FUNCTION update_calibration()
RETURNS VOID AS $$
BEGIN
  -- Recalculate calibration for each bucket
  INSERT INTO golf_confidence_calibration (bucket, prediction_type, predictions_count, correct_count, actual_accuracy, sample_size)
  SELECT
    ROUND(stated_confidence, 1) as bucket,
    p.prediction_type,
    COUNT(*) as predictions_count,
    SUM(CASE WHEN v.was_correct THEN 1 ELSE 0 END) as correct_count,
    CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN v.was_correct THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) ELSE 0 END as actual_accuracy,
    COUNT(*) as sample_size
  FROM golf_validations v
  JOIN golf_predictions p ON v.prediction_id = p.id
  GROUP BY ROUND(stated_confidence, 1), p.prediction_type
  ON CONFLICT (bucket, prediction_type) DO UPDATE SET
    predictions_count = EXCLUDED.predictions_count,
    correct_count = EXCLUDED.correct_count,
    actual_accuracy = EXCLUDED.actual_accuracy,
    sample_size = EXCLUDED.sample_size,
    calibration_error = ABS(golf_confidence_calibration.bucket - EXCLUDED.actual_accuracy),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
