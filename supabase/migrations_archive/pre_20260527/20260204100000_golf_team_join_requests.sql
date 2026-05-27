-- Golf Team Join Requests
-- Creates a request/approval flow for players joining teams
-- Players request to join → Coach reviews → Accept/Reject

-- ============================================================================
-- TABLE: golf_team_join_requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT, -- Optional message from player to coach
  rejection_reason TEXT, -- Optional reason if rejected
  reviewed_by UUID REFERENCES golf_coaches(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate pending requests
  UNIQUE (team_id, player_id, status)
);

-- Indexes for efficient queries
CREATE INDEX idx_golf_team_join_requests_team ON golf_team_join_requests(team_id);
CREATE INDEX idx_golf_team_join_requests_player ON golf_team_join_requests(player_id);
CREATE INDEX idx_golf_team_join_requests_status ON golf_team_join_requests(status);
CREATE INDEX idx_golf_team_join_requests_pending ON golf_team_join_requests(team_id) WHERE status = 'pending';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE golf_team_join_requests ENABLE ROW LEVEL SECURITY;

-- Players can create join requests for themselves
CREATE POLICY "Players can create their own join requests"
  ON golf_team_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = golf_team_join_requests.player_id
      AND gp.user_id = auth.uid()
    )
  );

-- Players can view their own requests
CREATE POLICY "Players can view their own join requests"
  ON golf_team_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = golf_team_join_requests.player_id
      AND gp.user_id = auth.uid()
    )
  );

-- Players can cancel their pending requests
CREATE POLICY "Players can cancel their pending requests"
  ON golf_team_join_requests
  FOR DELETE
  TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = golf_team_join_requests.player_id
      AND gp.user_id = auth.uid()
    )
  );

-- Coaches can view requests for their team
CREATE POLICY "Coaches can view team join requests"
  ON golf_team_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
      AND gt.id = golf_team_join_requests.team_id
    )
  );

-- Coaches can update (approve/reject) requests for their team
CREATE POLICY "Coaches can review team join requests"
  ON golf_team_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
      AND gt.id = golf_team_join_requests.team_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
      AND gt.id = golf_team_join_requests.team_id
    )
  );

-- ============================================================================
-- TRIGGER: Update updated_at on changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_golf_team_join_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER golf_team_join_requests_updated_at
  BEFORE UPDATE ON golf_team_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_golf_team_join_requests_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE golf_team_join_requests IS 'Tracks player requests to join golf teams, requiring coach approval';
COMMENT ON COLUMN golf_team_join_requests.status IS 'Request status: pending (awaiting review), approved (player added to team), rejected (denied by coach)';
COMMENT ON COLUMN golf_team_join_requests.message IS 'Optional message from player explaining why they want to join';
COMMENT ON COLUMN golf_team_join_requests.rejection_reason IS 'Optional explanation from coach when rejecting a request';
