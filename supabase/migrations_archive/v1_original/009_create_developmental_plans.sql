-- Migration: Create developmental plans table
-- Coaches create development plans for players with goals and drills

CREATE TABLE IF NOT EXISTS developmental_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

  -- Plan details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  start_date DATE,
  end_date DATE,

  -- Goals and drills stored as JSONB for flexibility
  goals JSONB DEFAULT '[]',
  drills JSONB DEFAULT '[]',

  notes TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft',
    'sent',
    'in_progress',
    'completed',
    'archived'
  )),

  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================
-- INDEXES
-- ==============================================

CREATE INDEX idx_dev_plans_coach ON developmental_plans(coach_id);
CREATE INDEX idx_dev_plans_player ON developmental_plans(player_id);
CREATE INDEX idx_dev_plans_team ON developmental_plans(team_id);
CREATE INDEX idx_dev_plans_status ON developmental_plans(status);
CREATE INDEX idx_dev_plans_player_status ON developmental_plans(player_id, status);
CREATE INDEX idx_dev_plans_dates ON developmental_plans(start_date, end_date) WHERE start_date IS NOT NULL;

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE developmental_plans ENABLE ROW LEVEL SECURITY;

-- Coaches can manage plans they created
CREATE POLICY "Coaches can manage own dev plans"
  ON developmental_plans
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Players can view plans assigned to them
CREATE POLICY "Players can view own dev plans"
  ON developmental_plans
  FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Players can update progress on their plans (status, goals completion)
CREATE POLICY "Players can update own dev plans progress"
  ON developmental_plans
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    -- Players can only update certain fields - enforce in app logic
  );

-- ==============================================
-- TRIGGERS
-- ==============================================

CREATE TRIGGER update_developmental_plans_updated_at
  BEFORE UPDATE ON developmental_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-set sent_at when status changes to 'sent'
CREATE OR REPLACE FUNCTION set_dev_plan_sent_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status != 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_dev_plan_sent_timestamp
  BEFORE UPDATE ON developmental_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_dev_plan_sent_at();

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Function to get active dev plans for a player
CREATE OR REPLACE FUNCTION get_active_dev_plans(p_player_id UUID)
RETURNS TABLE (
  plan_id UUID,
  title TEXT,
  coach_name TEXT,
  status VARCHAR(20),
  progress_percent INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dp.id as plan_id,
    dp.title,
    c.full_name as coach_name,
    dp.status,
    -- Calculate progress based on completed goals
    CASE
      WHEN jsonb_array_length(dp.goals) = 0 THEN 0
      ELSE (
        SELECT COUNT(*)::INTEGER * 100 / jsonb_array_length(dp.goals)
        FROM jsonb_array_elements(dp.goals) goal
        WHERE (goal->>'completed')::BOOLEAN = TRUE
      )
    END as progress_percent
  FROM developmental_plans dp
  JOIN coaches c ON c.id = dp.coach_id
  WHERE dp.player_id = p_player_id
    AND dp.status IN ('sent', 'in_progress')
  ORDER BY dp.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- EXAMPLE JSONB STRUCTURE FOR GOALS
-- ==============================================

COMMENT ON COLUMN developmental_plans.goals IS 'JSONB array: [{"id": "uuid", "title": "text", "description": "text", "target_date": "date", "completed": false, "completed_at": "timestamp"}]';

COMMENT ON COLUMN developmental_plans.drills IS 'JSONB array: [{"id": "uuid", "name": "text", "description": "text", "video_url": "url", "frequency": "text"}]';

COMMENT ON TABLE developmental_plans IS 'Development plans created by coaches for players with goals and drills';
