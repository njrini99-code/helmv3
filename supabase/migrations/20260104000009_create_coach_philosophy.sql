-- ============================================================================
-- COACH PHILOSOPHY SETTINGS
-- Feature 1: Coach Philosophy Settings for CoachHelm
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,

  -- Priority metrics (1 = highest priority, 5 = lowest)
  priority_ball_striking INTEGER NOT NULL DEFAULT 1
    CHECK (priority_ball_striking BETWEEN 1 AND 5),
  priority_short_game INTEGER NOT NULL DEFAULT 3
    CHECK (priority_short_game BETWEEN 1 AND 5),
  priority_putting INTEGER NOT NULL DEFAULT 2
    CHECK (priority_putting BETWEEN 1 AND 5),
  priority_course_management INTEGER NOT NULL DEFAULT 4
    CHECK (priority_course_management BETWEEN 1 AND 5),
  priority_mental_game INTEGER NOT NULL DEFAULT 5
    CHECK (priority_mental_game BETWEEN 1 AND 5),

  -- Alert sensitivity: aggressive | balanced | conservative
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced'
    CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),

  -- Numeric thresholds
  decline_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0,      -- strokes over 5 rounds
  pressure_gap_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.5, -- tournament vs practice
  bubble_zone_range DECIMAL(3,1) NOT NULL DEFAULT 1.0,      -- strokes from cutoff

  -- Comparison weights (must sum to 100)
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
  insight_verbosity TEXT NOT NULL DEFAULT 'detailed'
    CHECK (insight_verbosity IN ('brief', 'detailed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update timestamp
CREATE OR REPLACE TRIGGER update_golf_coach_philosophy_timestamp
  BEFORE UPDATE ON golf_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- RLS
ALTER TABLE golf_coach_philosophy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage own philosophy" ON golf_coach_philosophy;

CREATE POLICY "Coaches can manage own philosophy"
  ON golf_coach_philosophy FOR ALL
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_golf_coach_philosophy_coach_id ON golf_coach_philosophy(coach_id);
