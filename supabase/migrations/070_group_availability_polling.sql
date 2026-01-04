-- =====================================================================================
-- Migration: Group Availability Polling
-- Description: Find optimal meeting times for groups based on availability
-- =====================================================================================

-- Availability Polls Table
CREATE TABLE IF NOT EXISTS golf_availability_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  team_id UUID NOT NULL REFERENCES golf_teams(id),
  duration_minutes INTEGER NOT NULL, -- How long the event will be
  date_options DATE[], -- Array of possible dates
  time_options TIME[], -- Array of possible start times
  deadline TIMESTAMPTZ, -- When poll closes
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'scheduled')),
  selected_date DATE, -- Final chosen date
  selected_time TIME, -- Final chosen time
  created_event_id UUID REFERENCES golf_events(id), -- Event created from poll
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE golf_availability_polls IS 'Polls to find best meeting times for groups';

CREATE INDEX IF NOT EXISTS idx_golf_availability_polls_team ON golf_availability_polls(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_availability_polls_status ON golf_availability_polls(status);

-- Poll Responses Table
CREATE TABLE IF NOT EXISTS golf_poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES golf_availability_polls(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  date_option DATE NOT NULL,
  time_option TIME NOT NULL,
  is_available BOOLEAN NOT NULL,
  preference_level INTEGER CHECK (preference_level BETWEEN 1 AND 5), -- 1 = prefer not to, 5 = highly prefer
  notes TEXT,
  responded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(poll_id, player_id, date_option, time_option)
);

COMMENT ON TABLE golf_poll_responses IS 'Player responses to availability polls';
COMMENT ON COLUMN golf_poll_responses.preference_level IS '1-5 scale: 1=prefer not, 5=highly prefer';

CREATE INDEX IF NOT EXISTS idx_golf_poll_responses_poll ON golf_poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_golf_poll_responses_player ON golf_poll_responses(player_id);

-- =====================================================================================
-- RLS POLICIES
-- =====================================================================================

ALTER TABLE golf_availability_polls ENABLE ROW LEVEL SECURITY;

-- Coaches can manage polls for their team
CREATE POLICY "golf_availability_polls_select"
  ON golf_availability_polls FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
    OR
    team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "golf_availability_polls_insert"
  ON golf_availability_polls FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "golf_availability_polls_update"
  ON golf_availability_polls FOR UPDATE
  TO authenticated
  USING (
    created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "golf_availability_polls_delete"
  ON golf_availability_polls FOR DELETE
  TO authenticated
  USING (
    created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
  );

-- Poll Responses RLS
ALTER TABLE golf_poll_responses ENABLE ROW LEVEL SECURITY;

-- Players can see all responses for polls they can access
CREATE POLICY "golf_poll_responses_select"
  ON golf_poll_responses FOR SELECT
  TO authenticated
  USING (
    poll_id IN (
      SELECT id FROM golf_availability_polls
      WHERE team_id IN (
        SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
        UNION
        SELECT team_id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

-- Players can submit their own responses
CREATE POLICY "golf_poll_responses_insert"
  ON golf_poll_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

-- Players can update their own responses
CREATE POLICY "golf_poll_responses_update"
  ON golf_poll_responses FOR UPDATE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

-- Players can delete their own responses
CREATE POLICY "golf_poll_responses_delete"
  ON golf_poll_responses FOR DELETE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

-- =====================================================================================
-- Function: Calculate poll results (find best times)
-- =====================================================================================

CREATE OR REPLACE FUNCTION calculate_poll_results(p_poll_id UUID)
RETURNS TABLE (
  date_option DATE,
  time_option TIME,
  available_count INTEGER,
  total_responses INTEGER,
  average_preference NUMERIC,
  availability_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.date_option,
    pr.time_option,
    COUNT(CASE WHEN pr.is_available THEN 1 END)::INTEGER AS available_count,
    COUNT(*)::INTEGER AS total_responses,
    AVG(CASE WHEN pr.is_available THEN pr.preference_level ELSE 0 END)::NUMERIC AS average_preference,
    (COUNT(CASE WHEN pr.is_available THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100)::NUMERIC AS availability_percentage
  FROM golf_poll_responses pr
  WHERE pr.poll_id = p_poll_id
  GROUP BY pr.date_option, pr.time_option
  ORDER BY
    availability_percentage DESC,
    average_preference DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_poll_results IS 'Calculates best time slots for a poll based on responses';

-- =====================================================================================
-- Function: Get suggested best times
-- =====================================================================================

CREATE OR REPLACE FUNCTION get_suggested_best_times(
  p_poll_id UUID,
  p_min_availability_percentage NUMERIC DEFAULT 70.0
)
RETURNS TABLE (
  date_option DATE,
  time_option TIME,
  score NUMERIC,
  available_count INTEGER,
  total_responses INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.date_option,
    r.time_option,
    -- Score = (availability % * 0.7) + (average preference * 0.3 * 20)
    (r.availability_percentage * 0.7 + r.average_preference * 0.3 * 20)::NUMERIC AS score,
    r.available_count,
    r.total_responses
  FROM calculate_poll_results(p_poll_id) r
  WHERE r.availability_percentage >= p_min_availability_percentage
  ORDER BY score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_suggested_best_times IS 'Returns top 5 time slots with at least min availability';

-- =====================================================================================
-- Updated at trigger
-- =====================================================================================

DROP TRIGGER IF EXISTS update_golf_availability_polls_updated_at ON golf_availability_polls;
CREATE TRIGGER update_golf_availability_polls_updated_at
  BEFORE UPDATE ON golf_availability_polls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
