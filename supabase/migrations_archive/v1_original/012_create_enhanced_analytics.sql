-- Migration: Create enhanced player engagement events table
-- Replaces basic profile_views with comprehensive engagement tracking

CREATE TABLE IF NOT EXISTS player_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Engagement type
  engagement_type VARCHAR(50) NOT NULL CHECK (engagement_type IN (
    'profile_view',
    'video_view',
    'stats_view',
    'watchlist_add',
    'watchlist_remove',
    'message_sent',
    'camp_interest',
    'top5_add'
  )),

  -- When and how long
  engagement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_duration_seconds INTEGER,

  -- Related entities
  video_id UUID,

  -- Additional metadata (flexible JSONB for future expansion)
  metadata JSONB DEFAULT '{}',

  -- Privacy flag
  is_anonymous BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================
-- INDEXES
-- ==============================================

CREATE INDEX idx_engagement_player ON player_engagement_events(player_id);
CREATE INDEX idx_engagement_coach ON player_engagement_events(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX idx_engagement_date ON player_engagement_events(engagement_date);
CREATE INDEX idx_engagement_type ON player_engagement_events(engagement_type);
CREATE INDEX idx_engagement_player_date ON player_engagement_events(player_id, engagement_date DESC);
CREATE INDEX idx_engagement_player_type ON player_engagement_events(player_id, engagement_type);
CREATE INDEX idx_engagement_coach_type ON player_engagement_events(coach_id, engagement_type) WHERE coach_id IS NOT NULL;
CREATE INDEX idx_engagement_video ON player_engagement_events(video_id) WHERE video_id IS NOT NULL;

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE player_engagement_events ENABLE ROW LEVEL SECURITY;

-- Players can view own engagement
CREATE POLICY "Players can view own engagement"
  ON player_engagement_events
  FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can view engagement they created
CREATE POLICY "Coaches can view own engagement"
  ON player_engagement_events
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR viewer_user_id = auth.uid()
  );

-- Coaches can record engagement
CREATE POLICY "Coaches can record engagement"
  ON player_engagement_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR viewer_user_id = auth.uid()
  );

-- System can record anonymous engagement
CREATE POLICY "Anonymous engagement can be recorded"
  ON player_engagement_events
  FOR INSERT
  TO authenticated
  WITH CHECK (is_anonymous = TRUE);

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Get engagement summary for a player
CREATE OR REPLACE FUNCTION get_player_engagement_summary(
  p_player_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_views BIGINT,
  unique_coaches BIGINT,
  watchlist_adds BIGINT,
  video_views BIGINT,
  messages_received BIGINT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE engagement_type = 'profile_view') as total_views,
    COUNT(DISTINCT coach_id) FILTER (WHERE engagement_type = 'profile_view') as unique_coaches,
    COUNT(*) FILTER (WHERE engagement_type = 'watchlist_add') as watchlist_adds,
    COUNT(*) FILTER (WHERE engagement_type = 'video_view') as video_views,
    COUNT(*) FILTER (WHERE engagement_type = 'message_sent') as messages_received,
    NOW() - (p_days || ' days')::INTERVAL as period_start,
    NOW() as period_end
  FROM player_engagement_events
  WHERE player_id = p_player_id
    AND engagement_date >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Get recent engagement for a player (for journey timeline)
CREATE OR REPLACE FUNCTION get_recent_engagement(
  p_player_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  event_id UUID,
  engagement_type VARCHAR(50),
  engagement_date TIMESTAMPTZ,
  coach_name TEXT,
  coach_school TEXT,
  is_anonymous BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pee.id as event_id,
    pee.engagement_type,
    pee.engagement_date,
    c.full_name as coach_name,
    c.school_name as coach_school,
    pee.is_anonymous
  FROM player_engagement_events pee
  LEFT JOIN coaches c ON c.id = pee.coach_id
  WHERE pee.player_id = p_player_id
  ORDER BY pee.engagement_date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Get engagement trends over time (for analytics charts)
CREATE OR REPLACE FUNCTION get_engagement_trends(
  p_player_id UUID,
  p_days INTEGER DEFAULT 30,
  p_interval TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period TIMESTAMPTZ,
  profile_views INTEGER,
  video_views INTEGER,
  watchlist_adds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc(p_interval, engagement_date) as period,
    COUNT(*) FILTER (WHERE engagement_type = 'profile_view')::INTEGER as profile_views,
    COUNT(*) FILTER (WHERE engagement_type = 'video_view')::INTEGER as video_views,
    COUNT(*) FILTER (WHERE engagement_type = 'watchlist_add')::INTEGER as watchlist_adds
  FROM player_engagement_events
  WHERE player_id = p_player_id
    AND engagement_date >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY date_trunc(p_interval, engagement_date)
  ORDER BY period ASC;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Record profile view (helper function for app code)
CREATE OR REPLACE FUNCTION record_profile_view(
  p_player_id UUID,
  p_coach_id UUID DEFAULT NULL,
  p_is_anonymous BOOLEAN DEFAULT FALSE,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO player_engagement_events (
    player_id,
    coach_id,
    viewer_user_id,
    engagement_type,
    view_duration_seconds,
    is_anonymous
  )
  VALUES (
    p_player_id,
    p_coach_id,
    auth.uid(),
    'profile_view',
    p_duration_seconds,
    p_is_anonymous
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- ==============================================
-- MIGRATE EXISTING profile_views DATA
-- ==============================================

-- Migrate existing profile_views to player_engagement_events if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profile_views') THEN
    INSERT INTO player_engagement_events (
      player_id,
      coach_id,
      viewer_user_id,
      engagement_type,
      engagement_date,
      is_anonymous
    )
    SELECT
      player_id,
      viewer_id as coach_id,
      viewer_id as viewer_user_id,
      'profile_view' as engagement_type,
      created_at as engagement_date,
      viewer_type IS NULL as is_anonymous
    FROM profile_views
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Migrated % profile_views to player_engagement_events', (SELECT COUNT(*) FROM profile_views);
  END IF;
END $$;

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE player_engagement_events IS 'Comprehensive tracking of all player engagement (views, watchlist adds, video views, messages, etc.)';
COMMENT ON COLUMN player_engagement_events.engagement_type IS 'Type of engagement: profile_view, video_view, stats_view, watchlist_add, watchlist_remove, message_sent, camp_interest, top5_add';
COMMENT ON COLUMN player_engagement_events.is_anonymous IS 'TRUE if player has not activated recruiting (shows "A coach from Texas" instead of name)';
COMMENT ON COLUMN player_engagement_events.metadata IS 'Flexible JSONB field for additional context (e.g., {"source": "discover_page", "filter_used": "grad_year:2025"})';
