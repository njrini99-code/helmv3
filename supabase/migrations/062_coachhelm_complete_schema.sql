-- ============================================================================
-- Migration: 062_coachhelm_complete_schema.sql
-- Purpose: Complete CoachHelm feature suite schema additions
-- Features:
--   1. Enhanced pattern storage with validation and impact tracking
--   2. Insight action tracking with outcomes measurement
--   3. Player-specific insights separated from coach insights
--   4. Prediction tracking with accuracy analysis
--   5. Insight effectiveness metrics
-- ============================================================================

-- ============================================================================
-- 1. ENHANCE golf_patterns_v2 - Add missing columns for full pattern lifecycle
-- ============================================================================

-- Add severity classification
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- Add strokes impact estimate (positive = costs strokes, negative = saves strokes)
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS strokes_impact DECIMAL(4,2);

-- Add coach validation workflow
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS validated_by_coach BOOLEAN DEFAULT FALSE;

ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS validation_date TIMESTAMPTZ;

ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS validator_coach_id UUID REFERENCES golf_coaches(id) ON DELETE SET NULL;

-- Add source round references for evidence
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS source_round_ids UUID[] DEFAULT '{}';

-- Add pattern lifecycle state
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'detected'
    CHECK (lifecycle_state IN ('detected', 'confirmed', 'addressed', 'resolved', 'dismissed'));

-- Add resolution tracking
ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE golf_patterns_v2
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Index for coach validation queries
CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_validation
ON golf_patterns_v2(validated_by_coach, validation_date DESC)
WHERE validated_by_coach = TRUE;

-- Index for lifecycle state queries
CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_lifecycle
ON golf_patterns_v2(lifecycle_state, player_id);

-- Index for severity filtering
CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_severity
ON golf_patterns_v2(severity, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 2. ENHANCE golf_round_reviews - Add AI metadata
-- ============================================================================

-- Add AI model tracking
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS ai_model_version TEXT;

-- Add sentiment analysis score (-1 to 1, negative to positive)
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,2);

-- Add regeneration tracking
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS regeneration_count INTEGER DEFAULT 0;

ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS last_regenerated_at TIMESTAMPTZ;

-- Add review quality metrics
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS insights_count INTEGER DEFAULT 0;

ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS highlights_count INTEGER DEFAULT 0;

ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS areas_count INTEGER DEFAULT 0;

-- ============================================================================
-- 3. INSIGHT ACTION TRACKING - Track coach actions on insights and outcomes
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_insight_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source insight (polymorphic - can be coach or player insight)
    coach_insight_id UUID REFERENCES golf_coach_insights(id) ON DELETE CASCADE,
    player_insight_id UUID REFERENCES golf_player_insights(id) ON DELETE CASCADE,
    review_insight_id UUID REFERENCES golf_review_insights(id) ON DELETE CASCADE,

    -- Actor and target
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('coach', 'player')),
    player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
    team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

    -- Action taken
    action_type TEXT NOT NULL CHECK (action_type IN (
        'dismissed',           -- Ignored/dismissed the insight
        'acknowledged',        -- Marked as seen
        'created_focus_area',  -- Created a focus area from it
        'scheduled_practice',  -- Scheduled practice to address it
        'added_to_dev_plan',   -- Added to player development plan
        'discussed_with_player', -- Had conversation with player
        'adjusted_lineup',     -- Made lineup change based on it
        'modified_training',   -- Changed training approach
        'marked_incorrect',    -- Flagged as inaccurate
        'shared',              -- Shared with player/team
        'converted_to_task'    -- Created a task from it
    )),
    action_notes TEXT,
    action_date TIMESTAMPTZ DEFAULT NOW(),

    -- Linked entities created from action
    focus_area_id UUID REFERENCES golf_player_focus_areas(id) ON DELETE SET NULL,
    task_id UUID REFERENCES golf_tasks(id) ON DELETE SET NULL,
    event_id UUID REFERENCES golf_events(id) ON DELETE SET NULL,

    -- Outcome tracking (measured later)
    outcome_status TEXT CHECK (outcome_status IN (
        'pending',       -- Not yet measured
        'improved',      -- Player showed improvement
        'no_change',     -- No measurable change
        'worsened',      -- Player got worse
        'inconclusive'   -- Can't determine
    )),
    outcome_measured_at TIMESTAMPTZ,
    outcome_notes TEXT,
    outcome_metric_before DECIMAL(10,2),
    outcome_metric_after DECIMAL(10,2),
    outcome_metric_name TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure at least one insight reference
    CONSTRAINT insight_action_source_check CHECK (
        coach_insight_id IS NOT NULL OR
        player_insight_id IS NOT NULL OR
        review_insight_id IS NOT NULL
    )
);

-- Indexes for insight actions
CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_coach_insight
ON golf_insight_actions(coach_insight_id) WHERE coach_insight_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_player_insight
ON golf_insight_actions(player_insight_id) WHERE player_insight_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_review_insight
ON golf_insight_actions(review_insight_id) WHERE review_insight_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_actor
ON golf_insight_actions(actor_id, action_date DESC);

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_player
ON golf_insight_actions(player_id, action_date DESC);

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_outcome
ON golf_insight_actions(outcome_status) WHERE outcome_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_actions_type
ON golf_insight_actions(action_type, created_at DESC);

-- ============================================================================
-- 4. ENHANCE golf_player_insights - Add action and outcome tracking
-- ============================================================================

-- Add source tracking
ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'system'
    CHECK (source_type IN ('system', 'coach', 'pattern', 'round_review', 'prediction'));

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS source_id UUID;

-- Add action tracking
ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS action_taken BOOLEAN DEFAULT FALSE;

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS action_type TEXT;

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS action_date TIMESTAMPTZ;

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS action_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add outcome tracking
ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS outcome_status TEXT CHECK (outcome_status IN (
    'pending', 'improved', 'no_change', 'worsened', 'inconclusive'
));

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS outcome_measured_at TIMESTAMPTZ;

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

-- Add priority and category
ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN (
    'performance', 'technique', 'mental', 'physical', 'practice', 'competition'
));

-- Add linked focus area
ALTER TABLE golf_player_insights
ADD COLUMN IF NOT EXISTS linked_focus_area_id UUID
    REFERENCES golf_player_focus_areas(id) ON DELETE SET NULL;

-- Index for action tracking
CREATE INDEX IF NOT EXISTS idx_golf_player_insights_action
ON golf_player_insights(action_taken, action_date DESC)
WHERE action_taken = TRUE;

-- Index for outcome analysis
CREATE INDEX IF NOT EXISTS idx_golf_player_insights_outcome
ON golf_player_insights(outcome_status, outcome_measured_at)
WHERE outcome_status IS NOT NULL;

-- ============================================================================
-- 5. ENHANCE golf_coach_insights - Add action and outcome tracking
-- ============================================================================

-- Add source tracking
ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'system'
    CHECK (source_type IN ('system', 'pattern', 'prediction', 'comparison', 'attendance'));

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS source_id UUID;

-- Add action tracking
ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS action_taken BOOLEAN DEFAULT FALSE;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS action_type TEXT;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS action_date TIMESTAMPTZ;

-- Add outcome tracking
ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_status TEXT CHECK (outcome_status IN (
    'pending', 'improved', 'no_change', 'worsened', 'inconclusive'
));

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_measured_at TIMESTAMPTZ;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_metric_name TEXT;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_metric_before DECIMAL(10,2);

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS outcome_metric_after DECIMAL(10,2);

-- Add linked entities
ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS linked_focus_area_id UUID
    REFERENCES golf_player_focus_areas(id) ON DELETE SET NULL;

ALTER TABLE golf_coach_insights
ADD COLUMN IF NOT EXISTS linked_task_id UUID
    REFERENCES golf_tasks(id) ON DELETE SET NULL;

-- Index for action tracking
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_action
ON golf_coach_insights(action_taken, action_date DESC)
WHERE action_taken = TRUE;

-- Index for outcome analysis
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_outcome
ON golf_coach_insights(outcome_status, outcome_measured_at)
WHERE outcome_status IS NOT NULL;

-- ============================================================================
-- 6. ENHANCE golf_predictions - Add context and error analysis
-- ============================================================================

-- Add prediction context
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS prediction_context JSONB DEFAULT '{}';

-- Add model confidence breakdown
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS confidence_factors JSONB DEFAULT '[]';

-- Add error analysis
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS error_analysis JSONB DEFAULT '{}';

ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS error_category TEXT CHECK (error_category IN (
    'overconfident',    -- Predicted value was too certain
    'underconfident',   -- Should have been more certain
    'systematic_bias',  -- Consistent directional error
    'outlier_event',    -- Unusual circumstances
    'data_quality',     -- Bad input data
    'model_limitation', -- Known model weakness
    'external_factor'   -- Weather, injury, etc.
));

-- Add round reference for context
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS related_round_id UUID REFERENCES golf_rounds(id) ON DELETE SET NULL;

-- Add event reference for tournament predictions
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS related_event_id UUID REFERENCES golf_events(id) ON DELETE SET NULL;

-- Add prediction range (for interval predictions)
ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS predicted_low DECIMAL(6,2);

ALTER TABLE golf_predictions
ADD COLUMN IF NOT EXISTS predicted_high DECIMAL(6,2);

-- Index for error analysis
CREATE INDEX IF NOT EXISTS idx_golf_predictions_error
ON golf_predictions(error_category) WHERE error_category IS NOT NULL;

-- Index for round-based lookups
CREATE INDEX IF NOT EXISTS idx_golf_predictions_round
ON golf_predictions(related_round_id) WHERE related_round_id IS NOT NULL;

-- ============================================================================
-- 7. INSIGHT EFFECTIVENESS METRICS - Aggregate tracking of insight value
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_insight_effectiveness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,

    -- Time period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Insight type metrics
    insight_type TEXT NOT NULL,

    -- Volume metrics
    insights_generated INTEGER DEFAULT 0,
    insights_dismissed INTEGER DEFAULT 0,
    insights_acted_upon INTEGER DEFAULT 0,
    insights_with_outcome INTEGER DEFAULT 0,

    -- Outcome metrics
    outcomes_improved INTEGER DEFAULT 0,
    outcomes_no_change INTEGER DEFAULT 0,
    outcomes_worsened INTEGER DEFAULT 0,

    -- Calculated metrics
    action_rate DECIMAL(5,4),          -- acted_upon / generated
    improvement_rate DECIMAL(5,4),     -- improved / with_outcome
    effectiveness_score DECIMAL(5,4),  -- weighted score

    -- Accuracy metrics (for prediction insights)
    predictions_made INTEGER DEFAULT 0,
    predictions_accurate INTEGER DEFAULT 0,
    mean_absolute_error DECIMAL(6,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(team_id, period_start, period_end, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_golf_insight_effectiveness_team
ON golf_insight_effectiveness(team_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_golf_insight_effectiveness_type
ON golf_insight_effectiveness(insight_type, period_start DESC);

-- ============================================================================
-- 8. PREDICTION MODEL PERFORMANCE - Track model accuracy over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_prediction_model_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

    -- Model identification
    model_type TEXT NOT NULL,  -- 'scoring', 'ranking', 'lineup', etc.
    model_version TEXT,

    -- Time period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Volume
    predictions_made INTEGER DEFAULT 0,
    predictions_validated INTEGER DEFAULT 0,

    -- Accuracy metrics
    accuracy_rate DECIMAL(5,4),
    mean_absolute_error DECIMAL(6,2),
    root_mean_square_error DECIMAL(6,2),

    -- Confidence calibration
    calibration_score DECIMAL(5,4),  -- How well confidence matches accuracy
    overconfidence_rate DECIMAL(5,4),
    underconfidence_rate DECIMAL(5,4),

    -- Breakdown by confidence bucket
    accuracy_by_confidence JSONB DEFAULT '{}',

    -- Error analysis
    error_distribution JSONB DEFAULT '{}',
    systematic_bias DECIMAL(6,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(team_id, model_type, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_golf_prediction_performance_team
ON golf_prediction_model_performance(team_id, model_type, period_start DESC);

-- ============================================================================
-- 9. PLAYER INSIGHT PREFERENCES - Personalize insights per player
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_player_insight_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE UNIQUE,

    -- Notification preferences
    notify_performance_decline BOOLEAN DEFAULT TRUE,
    notify_improvement_detected BOOLEAN DEFAULT TRUE,
    notify_pattern_found BOOLEAN DEFAULT TRUE,
    notify_practice_suggestion BOOLEAN DEFAULT TRUE,

    -- Insight type preferences
    enabled_insight_types TEXT[] DEFAULT ARRAY['performance_decline', 'performance_improvement', 'pattern_detected', 'practice_recommendation'],

    -- Frequency preferences
    max_insights_per_week INTEGER DEFAULT 10,
    min_severity_level TEXT DEFAULT 'low' CHECK (min_severity_level IN ('low', 'medium', 'high')),

    -- Display preferences
    show_strokes_impact BOOLEAN DEFAULT TRUE,
    show_comparison_to_team BOOLEAN DEFAULT TRUE,
    preferred_verbosity TEXT DEFAULT 'standard' CHECK (preferred_verbosity IN ('minimal', 'standard', 'detailed')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_player_insight_prefs_player
ON golf_player_insight_preferences(player_id);

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

-- Insight Actions RLS
ALTER TABLE golf_insight_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view actions for their team"
ON golf_insight_actions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM golf_coaches gc
        WHERE gc.user_id = auth.uid()
        AND (gc.team_id = golf_insight_actions.team_id OR gc.id IN (
            SELECT coach_id FROM golf_coach_insights WHERE id = golf_insight_actions.coach_insight_id
        ))
    )
);

CREATE POLICY "Coaches can create actions"
ON golf_insight_actions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM golf_coaches gc
        WHERE gc.user_id = auth.uid()
    )
    AND actor_id = auth.uid()
);

CREATE POLICY "Coaches can update their own actions"
ON golf_insight_actions FOR UPDATE
USING (actor_id = auth.uid());

CREATE POLICY "Players can view actions about them"
ON golf_insight_actions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM golf_players gp
        WHERE gp.user_id = auth.uid()
        AND gp.id = golf_insight_actions.player_id
    )
);

-- Insight Effectiveness RLS
ALTER TABLE golf_insight_effectiveness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view team effectiveness metrics"
ON golf_insight_effectiveness FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM golf_coaches gc
        WHERE gc.user_id = auth.uid()
        AND gc.team_id = golf_insight_effectiveness.team_id
    )
);

CREATE POLICY "System can insert effectiveness metrics"
ON golf_insight_effectiveness FOR INSERT
WITH CHECK (true);  -- Typically inserted by system/triggers

-- Prediction Model Performance RLS
ALTER TABLE golf_prediction_model_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view team model performance"
ON golf_prediction_model_performance FOR SELECT
USING (
    team_id IS NULL  -- Global metrics visible to all
    OR EXISTS (
        SELECT 1 FROM golf_coaches gc
        WHERE gc.user_id = auth.uid()
        AND gc.team_id = golf_prediction_model_performance.team_id
    )
);

-- Player Insight Preferences RLS
ALTER TABLE golf_player_insight_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own preferences"
ON golf_player_insight_preferences FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM golf_players gp
        WHERE gp.user_id = auth.uid()
        AND gp.id = golf_player_insight_preferences.player_id
    )
);

CREATE POLICY "Coaches can view player preferences"
ON golf_player_insight_preferences FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM golf_coaches gc
        JOIN golf_players gp ON gp.team_id = gc.team_id
        WHERE gc.user_id = auth.uid()
        AND gp.id = golf_player_insight_preferences.player_id
    )
);

-- ============================================================================
-- 11. TRIGGERS
-- ============================================================================

-- Updated at trigger for new tables
CREATE OR REPLACE TRIGGER update_golf_insight_actions_timestamp
    BEFORE UPDATE ON golf_insight_actions
    FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE OR REPLACE TRIGGER update_golf_insight_effectiveness_timestamp
    BEFORE UPDATE ON golf_insight_effectiveness
    FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE OR REPLACE TRIGGER update_golf_prediction_performance_timestamp
    BEFORE UPDATE ON golf_prediction_model_performance
    FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE OR REPLACE TRIGGER update_golf_player_insight_prefs_timestamp
    BEFORE UPDATE ON golf_player_insight_preferences
    FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- ============================================================================
-- 12. FUNCTIONS FOR INSIGHT EFFECTIVENESS CALCULATION
-- ============================================================================

-- Function to calculate and update insight effectiveness
CREATE OR REPLACE FUNCTION calculate_insight_effectiveness(
    p_team_id UUID,
    p_period_start DATE,
    p_period_end DATE
) RETURNS void AS $$
DECLARE
    v_insight_type TEXT;
    v_generated INTEGER;
    v_dismissed INTEGER;
    v_acted INTEGER;
    v_with_outcome INTEGER;
    v_improved INTEGER;
    v_no_change INTEGER;
    v_worsened INTEGER;
BEGIN
    -- Loop through each insight type
    FOR v_insight_type IN
        SELECT DISTINCT insight_type FROM golf_coach_insights
        WHERE (team_id = p_team_id OR player_id IN (
            SELECT id FROM golf_players WHERE team_id = p_team_id
        ))
        AND created_at >= p_period_start AND created_at < p_period_end + INTERVAL '1 day'
    LOOP
        -- Count insights
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE dismissed = TRUE),
            COUNT(*) FILTER (WHERE action_taken = TRUE),
            COUNT(*) FILTER (WHERE outcome_status IS NOT NULL),
            COUNT(*) FILTER (WHERE outcome_status = 'improved'),
            COUNT(*) FILTER (WHERE outcome_status = 'no_change'),
            COUNT(*) FILTER (WHERE outcome_status = 'worsened')
        INTO v_generated, v_dismissed, v_acted, v_with_outcome, v_improved, v_no_change, v_worsened
        FROM golf_coach_insights
        WHERE (team_id = p_team_id OR player_id IN (
            SELECT id FROM golf_players WHERE team_id = p_team_id
        ))
        AND insight_type = v_insight_type
        AND created_at >= p_period_start AND created_at < p_period_end + INTERVAL '1 day';

        -- Upsert effectiveness record
        INSERT INTO golf_insight_effectiveness (
            team_id, period_start, period_end, insight_type,
            insights_generated, insights_dismissed, insights_acted_upon, insights_with_outcome,
            outcomes_improved, outcomes_no_change, outcomes_worsened,
            action_rate, improvement_rate, effectiveness_score
        ) VALUES (
            p_team_id, p_period_start, p_period_end, v_insight_type,
            v_generated, v_dismissed, v_acted, v_with_outcome,
            v_improved, v_no_change, v_worsened,
            CASE WHEN v_generated > 0 THEN v_acted::DECIMAL / v_generated ELSE 0 END,
            CASE WHEN v_with_outcome > 0 THEN v_improved::DECIMAL / v_with_outcome ELSE 0 END,
            -- Effectiveness = (action_rate * 0.3) + (improvement_rate * 0.7)
            CASE WHEN v_generated > 0 AND v_with_outcome > 0
                THEN (v_acted::DECIMAL / v_generated * 0.3) + (v_improved::DECIMAL / v_with_outcome * 0.7)
                WHEN v_generated > 0 THEN v_acted::DECIMAL / v_generated * 0.3
                ELSE 0
            END
        )
        ON CONFLICT (team_id, period_start, period_end, insight_type)
        DO UPDATE SET
            insights_generated = EXCLUDED.insights_generated,
            insights_dismissed = EXCLUDED.insights_dismissed,
            insights_acted_upon = EXCLUDED.insights_acted_upon,
            insights_with_outcome = EXCLUDED.insights_with_outcome,
            outcomes_improved = EXCLUDED.outcomes_improved,
            outcomes_no_change = EXCLUDED.outcomes_no_change,
            outcomes_worsened = EXCLUDED.outcomes_worsened,
            action_rate = EXCLUDED.action_rate,
            improvement_rate = EXCLUDED.improvement_rate,
            effectiveness_score = EXCLUDED.effectiveness_score,
            updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to validate predictions and update accuracy
CREATE OR REPLACE FUNCTION validate_prediction(
    p_prediction_id UUID,
    p_actual_value DECIMAL,
    p_actual_score INTEGER DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_predicted_value DECIMAL;
    v_predicted_score INTEGER;
    v_confidence DECIMAL;
    v_error DECIMAL;
    v_accuracy DECIMAL;
    v_error_cat TEXT;
BEGIN
    -- Get prediction details
    SELECT predicted_value, predicted_score, confidence
    INTO v_predicted_value, v_predicted_score, v_confidence
    FROM golf_predictions
    WHERE id = p_prediction_id;

    -- Calculate error
    IF v_predicted_score IS NOT NULL AND p_actual_score IS NOT NULL THEN
        v_error := ABS(v_predicted_score - p_actual_score);
        v_accuracy := CASE
            WHEN v_error = 0 THEN 1.0
            WHEN v_error <= 2 THEN 0.8
            WHEN v_error <= 5 THEN 0.5
            ELSE 0.2
        END;
    ELSIF v_predicted_value IS NOT NULL AND p_actual_value IS NOT NULL THEN
        v_error := ABS(v_predicted_value - p_actual_value);
        v_accuracy := GREATEST(0, 1 - (v_error / NULLIF(v_predicted_value, 0)));
    END IF;

    -- Determine error category
    IF v_accuracy < 0.5 AND v_confidence > 0.7 THEN
        v_error_cat := 'overconfident';
    ELSIF v_accuracy > 0.8 AND v_confidence < 0.4 THEN
        v_error_cat := 'underconfident';
    END IF;

    -- Update prediction
    UPDATE golf_predictions
    SET
        actual_value = p_actual_value,
        actual_score = p_actual_score,
        accuracy = v_accuracy,
        validated_at = NOW(),
        error_category = v_error_cat,
        error_analysis = jsonb_build_object(
            'absolute_error', v_error,
            'relative_error', CASE WHEN v_predicted_value > 0 THEN v_error / v_predicted_value ELSE NULL END,
            'confidence_at_prediction', v_confidence,
            'accuracy_score', v_accuracy
        )
    WHERE id = p_prediction_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE golf_insight_actions IS 'Tracks actions taken on insights and their outcomes for effectiveness measurement';
COMMENT ON TABLE golf_insight_effectiveness IS 'Aggregated metrics on insight effectiveness by type and period';
COMMENT ON TABLE golf_prediction_model_performance IS 'Tracks prediction model accuracy over time for calibration';
COMMENT ON TABLE golf_player_insight_preferences IS 'Player-specific preferences for insight generation and display';

COMMENT ON COLUMN golf_patterns_v2.severity IS 'Pattern severity: low, medium, high, critical';
COMMENT ON COLUMN golf_patterns_v2.strokes_impact IS 'Estimated strokes cost/saved per round from this pattern';
COMMENT ON COLUMN golf_patterns_v2.lifecycle_state IS 'Pattern lifecycle: detected, confirmed, addressed, resolved, dismissed';

COMMENT ON COLUMN golf_insight_actions.outcome_status IS 'Measured outcome after action: pending, improved, no_change, worsened, inconclusive';
COMMENT ON COLUMN golf_insight_actions.action_type IS 'Type of action taken on insight';

COMMENT ON COLUMN golf_predictions.error_category IS 'Category of prediction error for learning improvement';
COMMENT ON COLUMN golf_predictions.confidence_factors IS 'Breakdown of factors contributing to confidence level';

COMMENT ON FUNCTION calculate_insight_effectiveness IS 'Calculates and stores insight effectiveness metrics for a team and period';
COMMENT ON FUNCTION validate_prediction IS 'Validates a prediction with actual results and calculates accuracy';
