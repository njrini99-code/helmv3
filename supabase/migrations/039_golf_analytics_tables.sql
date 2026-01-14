-- Migration 039: Golf Analytics Tables
-- Creates golf analytics, insights, reviews, and attendance tracking tables

-- ============================================================================
-- 1. golf_round_reviews - CoachHelm AI round analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_round_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- Round summary
  round_score INTEGER,
  round_score_to_par INTEGER,
  scoring_avg_before NUMERIC(4,2),
  scoring_avg_after NUMERIC(4,2),

  -- AI-generated analysis
  highlights JSONB DEFAULT '[]',
  areas_to_review JSONB DEFAULT '[]',
  round_stats JSONB,
  patterns_detected JSONB DEFAULT '[]',

  -- Text summaries
  summary TEXT,
  primary_takeaway TEXT,
  next_practice_priority TEXT,

  -- Coach interaction
  coach_notes TEXT,
  coach_viewed_at TIMESTAMPTZ,
  shared_with_coach BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,

  -- Version tracking
  engine_version TEXT DEFAULT 'v2',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_player ON golf_round_reviews(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_round ON golf_round_reviews(round_id);

-- RLS for golf_round_reviews
ALTER TABLE golf_round_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own reviews" ON golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_round_reviews.player_id
    )
  );

CREATE POLICY "Coaches can view shared team reviews" ON golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    shared_with_coach = true AND
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_round_reviews.player_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage team reviews" ON golf_round_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_round_reviews.player_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. golf_coach_insights - CoachHelm proactive insights for coaches
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES golf_coaches(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,

  -- Insight classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'performance_decline', 'performance_improvement', 'pattern_detected',
    'practice_recommendation', 'roster_alert', 'qualifying_watch',
    'attendance_concern', 'milestone_reached', 'comparison_insight'
  )),
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Additional data
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_coach ON golf_coach_insights(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_player ON golf_coach_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_status ON golf_coach_insights(status) WHERE status = 'active';

-- RLS for golf_coach_insights
ALTER TABLE golf_coach_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their own insights" ON golf_coach_insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND (c.id = golf_coach_insights.coach_id OR c.team_id = golf_coach_insights.team_id)
    )
  );

CREATE POLICY "Coaches can manage their insights" ON golf_coach_insights
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND (c.id = golf_coach_insights.coach_id OR c.team_id = golf_coach_insights.team_id)
    )
  );

-- ============================================================================
-- 3. golf_insight_generation_log - Audit log for insight generation
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_insight_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  insight_type TEXT,
  rounds_analyzed INTEGER,
  insights_generated INTEGER,
  engine_version TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_insight_log_team ON golf_insight_generation_log(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_log_created ON golf_insight_generation_log(created_at DESC);

-- RLS for golf_insight_generation_log
ALTER TABLE golf_insight_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their team logs" ON golf_insight_generation_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_insight_generation_log.team_id
    )
  );

-- ============================================================================
-- 4. golf_attendance_summary - Aggregated attendance tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_attendance_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,

  -- Counts
  total_events INTEGER DEFAULT 0,
  attended_count INTEGER DEFAULT 0,
  absent_count INTEGER DEFAULT 0,
  excused_count INTEGER DEFAULT 0,

  -- Calculated
  attendance_percentage NUMERIC(5,2),

  -- Period
  period_start_date DATE,
  period_end_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, team_id, period_start_date, period_end_date)
);

CREATE INDEX IF NOT EXISTS idx_golf_attendance_summary_player ON golf_attendance_summary(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_attendance_summary_team ON golf_attendance_summary(team_id);

-- RLS for golf_attendance_summary
ALTER TABLE golf_attendance_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own attendance" ON golf_attendance_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_attendance_summary.player_id
    )
  );

CREATE POLICY "Coaches can view team attendance" ON golf_attendance_summary
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
      AND c.team_id = golf_attendance_summary.team_id
    )
  );

-- ============================================================================
-- 5. golf_event_status_log - Event status change audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_event_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES golf_coaches(id),
  change_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_event_status_log_event ON golf_event_status_log(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_status_log_changed ON golf_event_status_log(changed_at DESC);

-- RLS for golf_event_status_log
ALTER TABLE golf_event_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view event logs" ON golf_event_status_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_events e
      JOIN golf_coaches c ON c.team_id = e.team_id
      WHERE e.id = golf_event_status_log.event_id
      AND c.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM golf_events e
      JOIN golf_players p ON p.team_id = e.team_id
      WHERE e.id = golf_event_status_log.event_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. golf_academic_exclusions - Players excluded for academic reasons
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_academic_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  excluded_by UUID REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_academic_exclusions_player ON golf_academic_exclusions(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_academic_exclusions_dates ON golf_academic_exclusions(start_date, end_date);

-- RLS for golf_academic_exclusions
ALTER TABLE golf_academic_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own exclusions" ON golf_academic_exclusions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_academic_exclusions.player_id
    )
  );

CREATE POLICY "Coaches can manage exclusions" ON golf_academic_exclusions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_academic_exclusions.player_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. golf_event_exclusions - Players excluded from specific events
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_event_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  reason TEXT,
  excluded_by UUID REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_event_exclusions_event ON golf_event_exclusions(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_exclusions_player ON golf_event_exclusions(player_id);

-- RLS for golf_event_exclusions
ALTER TABLE golf_event_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own event exclusions" ON golf_event_exclusions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.user_id = auth.uid()
      AND p.id = golf_event_exclusions.player_id
    )
  );

CREATE POLICY "Coaches can manage event exclusions" ON golf_event_exclusions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_events e
      JOIN golf_coaches c ON c.team_id = e.team_id
      WHERE e.id = golf_event_exclusions.event_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. golf_course_holes - Individual hole data for courses
-- ============================================================================
CREATE TABLE IF NOT EXISTS golf_course_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  yardage INTEGER,
  handicap_index INTEGER CHECK (handicap_index BETWEEN 1 AND 18),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_golf_course_holes_course ON golf_course_holes(course_id);

-- RLS for golf_course_holes
ALTER TABLE golf_course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view course holes" ON golf_course_holes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coaches can manage course holes" ON golf_course_holes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches c
      WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Update triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_golf_round_reviews_updated_at ON golf_round_reviews;
CREATE TRIGGER update_golf_round_reviews_updated_at
    BEFORE UPDATE ON golf_round_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_coach_insights_updated_at ON golf_coach_insights;
CREATE TRIGGER update_golf_coach_insights_updated_at
    BEFORE UPDATE ON golf_coach_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_attendance_summary_updated_at ON golf_attendance_summary;
CREATE TRIGGER update_golf_attendance_summary_updated_at
    BEFORE UPDATE ON golf_attendance_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_golf_academic_exclusions_updated_at ON golf_academic_exclusions;
CREATE TRIGGER update_golf_academic_exclusions_updated_at
    BEFORE UPDATE ON golf_academic_exclusions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
