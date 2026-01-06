-- ============================================================================
-- ROUND REVIEWS
-- CoachHelm Feature: Intelligent Round Analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_round_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE UNIQUE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- Scoring context
  round_score INTEGER NOT NULL,
  round_score_to_par INTEGER NOT NULL,
  scoring_avg_before DECIMAL(4,1),
  scoring_avg_after DECIMAL(4,1),

  -- Position context (for qualifying)
  qualifying_position_before INTEGER,
  qualifying_position_after INTEGER,
  gap_to_next_position DECIMAL(4,2),

  -- Goal impacts (array of impacts)
  goal_impacts JSONB DEFAULT '[]',
  -- Example: [{ "goalId": "uuid", "goalType": "make_travel_roster", "valueBefore": 6, "valueAfter": 5.8, "change": -0.2, "direction": "positive" }]

  -- Highlights (best moments)
  highlights JSONB DEFAULT '[]',
  -- Example: [{ "holeNumber": 7, "type": "birdie_streak", "title": "Back-to-back birdies", "description": "...", "shots": [...], "impact": "+2 vs expected" }]

  -- Areas to review (concerning moments)
  areas_to_review JSONB DEFAULT '[]',
  -- Example: [{ "holeNumber": 12, "type": "three_putt", "title": "Three-putt from 15 feet", "description": "...", "pattern": "lag_putting", "rootCause": "First putt left 6 feet", "linkedFocusArea": "putting_lag" }]

  -- Round stats snapshot
  round_stats JSONB NOT NULL DEFAULT '{}',
  -- All calculated stats for this round

  -- Comparison averages
  player_averages JSONB NOT NULL DEFAULT '{}',
  -- Player's season averages at time of round

  team_averages JSONB,
  -- Team averages (if on a team)

  -- Strokes gained breakdown
  strokes_gained JSONB NOT NULL DEFAULT '{"total": 0, "tee": 0, "approach": 0, "aroundGreen": 0, "putting": 0}',
  -- { "total": 1.2, "tee": 0.5, "approach": 0.8, "aroundGreen": -0.3, "putting": 0.2 }

  -- Patterns
  patterns_detected JSONB DEFAULT '[]',
  -- New patterns found in this round

  patterns_recurring JSONB DEFAULT '[]',
  -- Patterns that appeared again

  -- Summary
  summary TEXT NOT NULL DEFAULT '',
  -- 2-3 paragraph synthesis

  primary_takeaway TEXT NOT NULL DEFAULT '',
  -- Single most important insight

  next_practice_priority TEXT,
  -- What to work on next

  linked_focus_area_id UUID,
  -- No foreign key for now (golf_focus_areas doesn't exist yet)

  -- Sharing
  shared_with_coach BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  coach_viewed_at TIMESTAMPTZ,
  coach_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_round_reviews_player ON golf_round_reviews(player_id);
CREATE INDEX IF NOT EXISTS idx_round_reviews_round ON golf_round_reviews(round_id);
CREATE INDEX IF NOT EXISTS idx_round_reviews_created ON golf_round_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_reviews_shared ON golf_round_reviews(shared_with_coach) WHERE shared_with_coach = TRUE;

-- RLS
ALTER TABLE golf_round_reviews ENABLE ROW LEVEL SECURITY;

-- Players can view their own reviews
DROP POLICY IF EXISTS "Players can view own reviews" ON golf_round_reviews;
CREATE POLICY "Players can view own reviews"
  ON golf_round_reviews FOR SELECT
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Players can update sharing status
DROP POLICY IF EXISTS "Players can update own reviews" ON golf_round_reviews;
CREATE POLICY "Players can update own reviews"
  ON golf_round_reviews FOR UPDATE
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Coaches can view shared reviews from their team
DROP POLICY IF EXISTS "Coaches can view shared team reviews" ON golf_round_reviews;
CREATE POLICY "Coaches can view shared team reviews"
  ON golf_round_reviews FOR SELECT
  USING (
    shared_with_coach = TRUE
    AND player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Coaches can add notes to shared reviews
DROP POLICY IF EXISTS "Coaches can update shared reviews" ON golf_round_reviews;
CREATE POLICY "Coaches can update shared reviews"
  ON golf_round_reviews FOR UPDATE
  USING (
    shared_with_coach = TRUE
    AND player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );

-- System/service role can insert reviews
DROP POLICY IF EXISTS "Service role can insert reviews" ON golf_round_reviews;
CREATE POLICY "Service role can insert reviews"
  ON golf_round_reviews FOR INSERT
  WITH CHECK (TRUE);

-- Players can also insert their own reviews (for client-side generation)
DROP POLICY IF EXISTS "Players can insert own reviews" ON golf_round_reviews;
CREATE POLICY "Players can insert own reviews"
  ON golf_round_reviews FOR INSERT
  WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));
