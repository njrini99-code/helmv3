-- ============================================================================
-- Migration: 054_round_review_system_v3.sql
-- Purpose: Comprehensive Round Review System V3
-- Features:
--   - Enhanced review structure with coach/player workflow
--   - Insight feedback loop for learning
--   - Focus areas linked to reviews
--   - Review status workflow (draft -> published)
-- ============================================================================

-- ============================================================================
-- ENHANCED ROUND REVIEWS TABLE
-- ============================================================================

-- Add new columns to existing golf_round_reviews table
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS coach_rating INTEGER CHECK (coach_rating BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS coach_feedback_text TEXT,
ADD COLUMN IF NOT EXISTS player_viewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS player_acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS generation_method TEXT DEFAULT 'v1';

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_status
ON golf_round_reviews(status) WHERE status != 'archived';

-- Index for coach workflow
CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_coach_workflow
ON golf_round_reviews(player_id, status, created_at DESC);

-- ============================================================================
-- REVIEW INSIGHTS TABLE
-- Stores individual insights that can be rated/feedback'd
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_review_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES golf_round_reviews(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- Insight classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'stat_insight',        -- Pure statistical observation
    'pattern_insight',     -- Pattern detected across rounds
    'improvement_insight', -- Specific improvement suggestion
    'comparison_insight',  -- Comparison to avg/team/previous
    'highlight',           -- Positive moment
    'area_to_review'       -- Needs work
  )),

  -- Insight content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Supporting data
  metric_name TEXT,
  metric_value DECIMAL(10,2),
  metric_baseline DECIMAL(10,2),
  metric_comparison TEXT, -- 'vs_average', 'vs_team', 'vs_previous'
  hole_numbers INTEGER[],
  evidence JSONB DEFAULT '[]',

  -- Coach feedback
  coach_accuracy TEXT CHECK (coach_accuracy IN ('accurate', 'partially_accurate', 'inaccurate')),
  coach_accuracy_at TIMESTAMPTZ,
  coach_notes TEXT,
  is_highlighted BOOLEAN DEFAULT FALSE, -- Coach marked as important
  is_hidden BOOLEAN DEFAULT FALSE, -- Coach hid from player view

  -- Focus area creation
  created_focus_area_id UUID REFERENCES golf_player_focus_areas(id) ON DELETE SET NULL,

  -- Confidence and ordering
  confidence DECIMAL(5,4) DEFAULT 0.75,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_review_insights_review ON golf_review_insights(review_id);
CREATE INDEX IF NOT EXISTS idx_golf_review_insights_player ON golf_review_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_review_insights_type ON golf_review_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_golf_review_insights_feedback
ON golf_review_insights(coach_accuracy) WHERE coach_accuracy IS NOT NULL;

-- ============================================================================
-- INSIGHT FEEDBACK HISTORY
-- Tracks all feedback for learning/improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_insight_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id UUID NOT NULL REFERENCES golf_review_insights(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES golf_round_reviews(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,

  -- Feedback details
  accuracy TEXT NOT NULL CHECK (accuracy IN ('accurate', 'partially_accurate', 'inaccurate')),
  feedback_text TEXT,

  -- Context for learning
  insight_type TEXT NOT NULL,
  metric_name TEXT,
  predicted_value DECIMAL(10,2),
  actual_assessment TEXT, -- What was actually true

  -- Learning signals
  was_overconfident BOOLEAN,
  was_underconfident BOOLEAN,
  error_category TEXT, -- 'data_quality', 'threshold_too_sensitive', 'missing_context', etc.

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_insight_feedback_insight ON golf_insight_feedback(insight_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_feedback_coach ON golf_insight_feedback(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_feedback_type ON golf_insight_feedback(insight_type);

-- ============================================================================
-- REVIEW FOCUS AREAS
-- Links reviews to actionable focus areas
-- ============================================================================

-- Update golf_player_focus_areas to link to reviews
ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS from_review_id UUID REFERENCES golf_round_reviews(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS from_insight_id UUID REFERENCES golf_review_insights(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS review_context TEXT,
ADD COLUMN IF NOT EXISTS progress_notes JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_golf_focus_areas_from_review
ON golf_player_focus_areas(from_review_id) WHERE from_review_id IS NOT NULL;

-- ============================================================================
-- REVIEW HISTORY/TIMELINE
-- Tracks review-related events for timeline display
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES golf_round_reviews(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'review_generated',
    'review_regenerated',
    'coach_viewed',
    'coach_annotated',
    'coach_published',
    'player_viewed',
    'player_acknowledged',
    'focus_area_created',
    'focus_area_completed',
    'insight_feedback_given'
  )),

  event_data JSONB DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_review_events_review ON golf_review_events(review_id);
CREATE INDEX IF NOT EXISTS idx_golf_review_events_player ON golf_review_events(player_id, created_at DESC);

-- ============================================================================
-- INSIGHT GENERATION WEIGHTS
-- Stores learned weights for insight generation
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_insight_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE CASCADE,

  insight_type TEXT NOT NULL,
  metric_name TEXT,

  -- Weights and adjustments
  base_weight DECIMAL(5,4) DEFAULT 1.0,
  coach_adjustment DECIMAL(5,4) DEFAULT 0.0,
  accuracy_rate DECIMAL(5,4) DEFAULT 0.5,
  sample_size INTEGER DEFAULT 0,

  -- Threshold adjustments based on feedback
  threshold_multiplier DECIMAL(5,4) DEFAULT 1.0,

  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, insight_type, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_golf_insight_weights_team ON golf_insight_weights(team_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for review_insights
CREATE OR REPLACE TRIGGER update_golf_review_insights_timestamp
  BEFORE UPDATE ON golf_review_insights
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Log review events automatically
CREATE OR REPLACE FUNCTION log_review_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO golf_review_events (review_id, player_id, actor_id, event_type, event_data)
    VALUES (
      NEW.id,
      NEW.player_id,
      NEW.published_by,
      CASE NEW.status
        WHEN 'published' THEN 'coach_published'
        ELSE 'review_generated'
      END,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_review_status_change
  AFTER UPDATE ON golf_round_reviews
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_review_status_change();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Review insights: coaches can view/edit for their team players
ALTER TABLE golf_review_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view review insights for their team players"
  ON golf_review_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      JOIN golf_team_members gtm ON gtm.team_id = gt.id
      WHERE gc.user_id = auth.uid()
      AND gtm.player_id = golf_review_insights.player_id
    )
  );

CREATE POLICY "Players can view their own published review insights"
  ON golf_review_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.user_id = auth.uid()
      AND gp.id = golf_review_insights.player_id
    )
    AND is_hidden = FALSE
    AND EXISTS (
      SELECT 1 FROM golf_round_reviews grr
      WHERE grr.id = golf_review_insights.review_id
      AND grr.status = 'published'
    )
  );

CREATE POLICY "Coaches can update review insights for their team players"
  ON golf_review_insights FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      JOIN golf_team_members gtm ON gtm.team_id = gt.id
      WHERE gc.user_id = auth.uid()
      AND gtm.player_id = golf_review_insights.player_id
    )
  );

-- Insight feedback: coaches only
ALTER TABLE golf_insight_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own insight feedback"
  ON golf_insight_feedback FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      WHERE gc.user_id = auth.uid()
      AND gc.id = golf_insight_feedback.coach_id
    )
  );

-- Review events: similar to insights
ALTER TABLE golf_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant review events"
  ON golf_review_events FOR SELECT
  USING (
    -- Coach can see all events for their team players
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      JOIN golf_team_members gtm ON gtm.team_id = gt.id
      WHERE gc.user_id = auth.uid()
      AND gtm.player_id = golf_review_events.player_id
    )
    OR
    -- Player can see their own events
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.user_id = auth.uid()
      AND gp.id = golf_review_events.player_id
    )
  );

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE golf_review_insights IS 'Individual insights within a round review, supports coach feedback loop';
COMMENT ON TABLE golf_insight_feedback IS 'Historical feedback on insights for learning improvement';
COMMENT ON TABLE golf_review_events IS 'Timeline of events related to reviews for history display';
COMMENT ON TABLE golf_insight_weights IS 'Learned weights for insight generation based on coach feedback';

COMMENT ON COLUMN golf_round_reviews.status IS 'Review workflow status: draft (coach editing), published (visible to player), archived';
COMMENT ON COLUMN golf_review_insights.coach_accuracy IS 'Coach assessment of insight accuracy for feedback loop';
COMMENT ON COLUMN golf_review_insights.is_highlighted IS 'Coach marked this as particularly important for player';
COMMENT ON COLUMN golf_review_insights.is_hidden IS 'Coach hid this insight from player view';
