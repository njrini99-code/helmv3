-- ============================================================================
-- Migration: 031_golf_coachhelm.sql
-- Purpose: CoachHelm AI features - philosophy settings, coach notes, insights
-- Consolidated from: 20260104000009_create_coach_philosophy.sql
-- ============================================================================

-- Golf Coach Philosophy (CoachHelm AI settings)
CREATE TABLE IF NOT EXISTS golf_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,

  -- Priority metrics (1 = highest priority, 5 = lowest)
  priority_ball_striking INTEGER NOT NULL DEFAULT 1 CHECK (priority_ball_striking BETWEEN 1 AND 5),
  priority_short_game INTEGER NOT NULL DEFAULT 3 CHECK (priority_short_game BETWEEN 1 AND 5),
  priority_putting INTEGER NOT NULL DEFAULT 2 CHECK (priority_putting BETWEEN 1 AND 5),
  priority_course_management INTEGER NOT NULL DEFAULT 4 CHECK (priority_course_management BETWEEN 1 AND 5),
  priority_mental_game INTEGER NOT NULL DEFAULT 5 CHECK (priority_mental_game BETWEEN 1 AND 5),

  -- Alert sensitivity
  alert_sensitivity golf_alert_sensitivity NOT NULL DEFAULT 'balanced',

  -- Numeric thresholds
  decline_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0,
  pressure_gap_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.5,
  bubble_zone_range DECIMAL(3,1) NOT NULL DEFAULT 1.0,

  -- Comparison weights (should sum to 100)
  weight_historical INTEGER NOT NULL DEFAULT 35,
  weight_recent_form INTEGER NOT NULL DEFAULT 30,
  weight_tournament INTEGER NOT NULL DEFAULT 20,
  weight_qualifying INTEGER NOT NULL DEFAULT 10,
  weight_subjective INTEGER NOT NULL DEFAULT 5,

  -- Alert type toggles
  alert_scoring_decline BOOLEAN NOT NULL DEFAULT TRUE,
  alert_stat_regression BOOLEAN NOT NULL DEFAULT TRUE,
  alert_tournament_pressure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_plateau BOOLEAN NOT NULL DEFAULT FALSE,
  alert_bubble_player BOOLEAN NOT NULL DEFAULT TRUE,
  alert_surge_player BOOLEAN NOT NULL DEFAULT TRUE,
  alert_streaks BOOLEAN NOT NULL DEFAULT TRUE,
  alert_recurring_weakness BOOLEAN NOT NULL DEFAULT TRUE,
  alert_closing_holes BOOLEAN NOT NULL DEFAULT FALSE,
  alert_par_3_issues BOOLEAN NOT NULL DEFAULT FALSE,

  -- Display preferences
  show_strokes_gained BOOLEAN NOT NULL DEFAULT TRUE,
  show_advanced_stats BOOLEAN NOT NULL DEFAULT TRUE,
  insight_verbosity golf_insight_verbosity NOT NULL DEFAULT 'detailed',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coach_philosophy_coach_id ON golf_coach_philosophy(coach_id);

-- Golf Coach Notes (Private notes on players)
CREATE TABLE IF NOT EXISTS golf_coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  meeting_date DATE,
  meeting_type TEXT,
  shared_with_player BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coach_notes_player ON golf_coach_notes(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_notes_coach ON golf_coach_notes(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_notes_date ON golf_coach_notes(meeting_date DESC);

-- Player Insights (generated AI insights)
CREATE TABLE IF NOT EXISTS golf_player_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_insights_player ON golf_player_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_insights_type ON golf_player_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_golf_insights_active ON golf_player_insights(player_id) WHERE is_dismissed = FALSE;

-- Triggers
CREATE OR REPLACE TRIGGER update_golf_coach_philosophy_timestamp
  BEFORE UPDATE ON golf_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_coach_notes_updated_at
  BEFORE UPDATE ON golf_coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- ============================================================================
-- CoachHelm Settings Tables
-- ============================================================================

-- User-level CoachHelm settings
CREATE TABLE IF NOT EXISTS golf_coachhelm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT TRUE,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coachhelm_settings_user ON golf_coachhelm_settings(user_id);

-- Team-level CoachHelm settings
CREATE TABLE IF NOT EXISTS golf_team_coachhelm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT TRUE,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_team_coachhelm_settings_team ON golf_team_coachhelm_settings(team_id);

-- ============================================================================
-- Round Reviews (AI-generated round analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_round_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- Round performance data
  round_score INTEGER,
  round_score_to_par INTEGER,
  scoring_avg_before DECIMAL(4,1),
  scoring_avg_after DECIMAL(4,1),
  qualifying_position_before INTEGER,
  qualifying_position_after INTEGER,
  gap_to_next_position DECIMAL(4,1),

  -- Analysis results
  goal_impacts JSONB DEFAULT '[]',
  highlights JSONB DEFAULT '[]',
  areas_to_review JSONB DEFAULT '[]',
  round_stats JSONB DEFAULT '{}',
  player_averages JSONB DEFAULT '{}',
  team_averages JSONB DEFAULT '{}',
  strokes_gained JSONB DEFAULT '{}',
  patterns_detected JSONB DEFAULT '[]',
  patterns_recurring JSONB DEFAULT '[]',

  -- Summary and recommendations
  summary TEXT,
  primary_takeaway TEXT,
  next_practice_priority TEXT,
  linked_focus_area_id UUID,

  -- Coach interaction
  coach_notes TEXT,
  coach_viewed_at TIMESTAMPTZ,
  shared_with_coach BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,

  -- Metadata
  engine_version TEXT DEFAULT 'v2',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(round_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_round ON golf_round_reviews(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_player ON golf_round_reviews(player_id);

-- ============================================================================
-- Coach Insights (team-level AI insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',

  acknowledged_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_coach ON golf_coach_insights(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_player ON golf_coach_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_active ON golf_coach_insights(coach_id) WHERE dismissed = FALSE;

-- ============================================================================
-- Player Focus Areas
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_player_focus_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
  focus_area TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  notes TEXT,
  target_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_focus_areas_player ON golf_player_focus_areas(player_id);

-- ============================================================================
-- CoachHelm V2 AI Tables (Pattern Mining & Learning)
-- ============================================================================

-- Patterns detected by the pattern mining engine
CREATE TABLE IF NOT EXISTS golf_patterns_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT,
  confidence DECIMAL(5,4) DEFAULT 0.0,
  occurrence_count INTEGER DEFAULT 1,

  conditions JSONB DEFAULT '{}',
  outcomes JSONB DEFAULT '{}',
  evidence JSONB DEFAULT '[]',

  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_player ON golf_patterns_v2(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_team ON golf_patterns_v2(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_type ON golf_patterns_v2(pattern_type);

-- Global patterns (cross-player insights)
CREATE TABLE IF NOT EXISTS golf_global_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT,
  confidence DECIMAL(5,4) DEFAULT 0.0,
  player_count INTEGER DEFAULT 0,

  conditions JSONB DEFAULT '{}',
  outcomes JSONB DEFAULT '{}',
  contributing_players JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_global_patterns_team ON golf_global_patterns(team_id);

-- Causal relationships identified by the causal engine
CREATE TABLE IF NOT EXISTS golf_causal_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  cause_type TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  relationship_strength DECIMAL(5,4) DEFAULT 0.0,
  confidence DECIMAL(5,4) DEFAULT 0.0,

  cause_data JSONB DEFAULT '{}',
  effect_data JSONB DEFAULT '{}',
  evidence JSONB DEFAULT '[]',

  validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_causal_player ON golf_causal_relationships(player_id);

-- Performance predictions
CREATE TABLE IF NOT EXISTS golf_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  prediction_type TEXT NOT NULL,
  predicted_value DECIMAL(6,2),
  predicted_score INTEGER,
  confidence DECIMAL(5,4) DEFAULT 0.0,

  prediction_date DATE,
  event_context JSONB DEFAULT '{}',
  factors JSONB DEFAULT '[]',

  actual_value DECIMAL(6,2),
  actual_score INTEGER,
  accuracy DECIMAL(5,4),
  validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_predictions_player ON golf_predictions(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_predictions_date ON golf_predictions(prediction_date);

-- Prediction validations
CREATE TABLE IF NOT EXISTS golf_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID REFERENCES golf_predictions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,

  validation_type TEXT NOT NULL,
  predicted JSONB DEFAULT '{}',
  actual JSONB DEFAULT '{}',
  error_margin DECIMAL(6,2),
  is_accurate BOOLEAN,

  feedback JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_validations_prediction ON golf_validations(prediction_id);

-- Confidence calibration tracking
CREATE TABLE IF NOT EXISTS golf_confidence_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,

  calibration_type TEXT NOT NULL,
  confidence_bucket DECIMAL(3,2), -- 0.00 to 1.00
  total_predictions INTEGER DEFAULT 0,
  accurate_predictions INTEGER DEFAULT 0,
  calibration_score DECIMAL(5,4),

  period_start DATE,
  period_end DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_calibration_team ON golf_confidence_calibration(team_id);

-- Learned behavior patterns
CREATE TABLE IF NOT EXISTS golf_learned_behavior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  behavior_type TEXT NOT NULL,
  behavior_pattern JSONB DEFAULT '{}',
  trigger_conditions JSONB DEFAULT '{}',

  observation_count INTEGER DEFAULT 1,
  confidence DECIMAL(5,4) DEFAULT 0.0,
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),

  is_positive BOOLEAN,
  coaching_suggestion TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_learned_behavior_player ON golf_learned_behavior(player_id);

-- ============================================================================
-- Insight Generation Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_insight_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  generation_type TEXT NOT NULL,
  insights_created INTEGER DEFAULT 0,
  focus_areas_updated INTEGER DEFAULT 0,
  players_analyzed INTEGER DEFAULT 0,

  duration_ms INTEGER,
  error_message TEXT,

  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_insight_log_coach ON golf_insight_generation_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_log_date ON golf_insight_generation_log(generated_at DESC);

-- Documentation
COMMENT ON TABLE golf_coach_philosophy IS 'CoachHelm AI settings - coach priorities, thresholds, and preferences';
COMMENT ON TABLE golf_coach_notes IS 'Private coach notes on players for development tracking';
COMMENT ON TABLE golf_player_insights IS 'AI-generated insights about player performance';
COMMENT ON TABLE golf_coachhelm_settings IS 'User-level CoachHelm feature toggles';
COMMENT ON TABLE golf_team_coachhelm_settings IS 'Team-level CoachHelm feature toggles';
COMMENT ON TABLE golf_round_reviews IS 'AI-generated round analysis and recommendations';
COMMENT ON TABLE golf_coach_insights IS 'Team-wide insights for coaches';
COMMENT ON TABLE golf_patterns_v2 IS 'V2 pattern mining - detected player patterns';
COMMENT ON TABLE golf_global_patterns IS 'Cross-player patterns at team level';
COMMENT ON TABLE golf_causal_relationships IS 'Causal analysis between performance factors';
COMMENT ON TABLE golf_predictions IS 'Performance predictions by the AI engine';
COMMENT ON TABLE golf_validations IS 'Validation of prediction accuracy';
COMMENT ON TABLE golf_confidence_calibration IS 'Calibration tracking for prediction confidence';
COMMENT ON TABLE golf_learned_behavior IS 'Learned behavioral patterns for players';
