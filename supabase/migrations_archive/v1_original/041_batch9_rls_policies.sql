-- ============================================================================
-- BATCH 9: RLS Policies for Player Cards & Pipeline Features
-- Migration: 041_batch9_rls_policies.sql
-- Created: 2024-12-30
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- WATCHLISTS TABLE (Pipeline Feature)
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Coaches can view their own watchlist" ON watchlists;
DROP POLICY IF EXISTS "Coaches can create watchlist entries" ON watchlists;
DROP POLICY IF EXISTS "Coaches can update their watchlist" ON watchlists;
DROP POLICY IF EXISTS "Coaches can delete from watchlist" ON watchlists;

-- Coaches can view their own watchlist
CREATE POLICY "Coaches can view their own watchlist"
  ON watchlists FOR SELECT
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Coaches can add players to their watchlist
CREATE POLICY "Coaches can create watchlist entries"
  ON watchlists FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Coaches can update their watchlist (change pipeline_stage, notes, etc.)
CREATE POLICY "Coaches can update their watchlist"
  ON watchlists FOR UPDATE
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Coaches can delete from their watchlist
CREATE POLICY "Coaches can delete from watchlist"
  ON watchlists FOR DELETE
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PLAYER_METRICS TABLE (Stats Display)
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Players can view their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Players can create their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Players can update their own metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can view player metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can create player metrics" ON player_metrics;
DROP POLICY IF EXISTS "Coaches can update player metrics" ON player_metrics;

-- Players can view their own metrics
CREATE POLICY "Players can view their own metrics"
  ON player_metrics FOR SELECT
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Players can create their own metrics
CREATE POLICY "Players can create their own metrics"
  ON player_metrics FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Players can update their own metrics
CREATE POLICY "Players can update their own metrics"
  ON player_metrics FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Coaches can view metrics for players they're recruiting
CREATE POLICY "Coaches can view player metrics"
  ON player_metrics FOR SELECT
  TO authenticated
  USING (
    -- Coaches can see metrics for players in their watchlist
    player_id IN (
      SELECT w.player_id
      FROM watchlists w
      JOIN coaches c ON c.id = w.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    -- Coaches can see metrics for players on their teams
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Coaches can create/update metrics for players on their teams
CREATE POLICY "Coaches can create player metrics"
  ON player_metrics FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update player metrics"
  ON player_metrics FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PLAYERS TABLE (Discovery & Cards)
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Players can view other recruiting-activated players" ON players;
DROP POLICY IF EXISTS "Coaches can view recruiting-activated players" ON players;
DROP POLICY IF EXISTS "Players can view their own profile" ON players;
DROP POLICY IF EXISTS "Players can update their own profile" ON players;

-- Players can view their own profile
CREATE POLICY "Players can view their own profile"
  ON players FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Players can update their own profile
CREATE POLICY "Players can update their own profile"
  ON players FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Players can view other recruiting-activated players
CREATE POLICY "Players can view other recruiting-activated players"
  ON players FOR SELECT
  TO authenticated
  USING (
    recruiting_activated = true
    OR user_id = auth.uid()  -- Can always see yourself
  );

-- Coaches can view recruiting-activated players (for discover page)
CREATE POLICY "Coaches can view recruiting-activated players"
  ON players FOR SELECT
  TO authenticated
  USING (
    recruiting_activated = true
    OR
    -- Coaches can see all players on teams they coach
    id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;
DROP POLICY IF EXISTS "Coaches can create organizations" ON organizations;
DROP POLICY IF EXISTS "Coaches can update their organization" ON organizations;

-- Anyone authenticated can view organizations (for school selection, etc.)
CREATE POLICY "Anyone can view organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (true);

-- Coaches can create organizations (during onboarding)
CREATE POLICY "Coaches can create organizations"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Coaches can update their organization
CREATE POLICY "Coaches can update their organization"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM coaches
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id
      FROM coaches
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Players can view their own videos" ON videos;
DROP POLICY IF EXISTS "Players can create videos" ON videos;
DROP POLICY IF EXISTS "Players can update their videos" ON videos;
DROP POLICY IF EXISTS "Players can delete their videos" ON videos;
DROP POLICY IF EXISTS "Coaches can view videos for recruiting" ON videos;

-- Players can view their own videos
CREATE POLICY "Players can view their own videos"
  ON videos FOR SELECT
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Players can create videos
CREATE POLICY "Players can create videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Players can update their videos
CREATE POLICY "Players can update their videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Players can delete their videos
CREATE POLICY "Players can delete their videos"
  ON videos FOR DELETE
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- Coaches can view videos for players they're recruiting or coaching
CREATE POLICY "Coaches can view videos for recruiting"
  ON videos FOR SELECT
  TO authenticated
  USING (
    -- Can see videos for players in watchlist
    player_id IN (
      SELECT w.player_id
      FROM watchlists w
      JOIN coaches c ON c.id = w.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    -- Can see videos for players on teams they coach
    player_id IN (
      SELECT tm.player_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN team_coach_staff tcs ON tcs.team_id = t.id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR
    -- Can see videos for recruiting-activated players
    player_id IN (
      SELECT id FROM players WHERE recruiting_activated = true
    )
  );

-- ============================================================================
-- COACHES TABLE
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Coaches can view their own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update their own profile" ON coaches;
DROP POLICY IF EXISTS "Anyone can view coach profiles" ON coaches;

-- Coaches can view their own profile
CREATE POLICY "Coaches can view their own profile"
  ON coaches FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Coaches can update their own profile
CREATE POLICY "Coaches can update their own profile"
  ON coaches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Anyone authenticated can view coach profiles (for program pages, etc.)
CREATE POLICY "Anyone can view coach profiles"
  ON coaches FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant authenticated role access to all tables
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON player_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON videos TO authenticated;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for watchlist queries
CREATE INDEX IF NOT EXISTS idx_watchlists_coach_id ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player_id ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_pipeline_stage ON watchlists(pipeline_stage);

-- Index for player_metrics queries
CREATE INDEX IF NOT EXISTS idx_player_metrics_player_id ON player_metrics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_metrics_metric_label ON player_metrics(metric_label);

-- Index for videos queries
CREATE INDEX IF NOT EXISTS idx_videos_player_id ON videos(player_id);

-- Index for players recruiting queries
CREATE INDEX IF NOT EXISTS idx_players_recruiting_activated ON players(recruiting_activated);
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_primary_position ON players(primary_position);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Coaches can view their own watchlist" ON watchlists IS
  'Coaches can only see watchlist entries they created';

COMMENT ON POLICY "Players can view their own metrics" ON player_metrics IS
  'Players have full access to their own performance metrics';

COMMENT ON POLICY "Coaches can view recruiting-activated players" ON players IS
  'Coaches can discover players who have activated recruiting mode';
