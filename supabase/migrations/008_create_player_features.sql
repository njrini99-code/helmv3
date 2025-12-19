-- Migration: Create player feature tables
-- Tables: player_settings, player_metrics, player_achievements, recruiting_interests

-- ==============================================
-- PLAYER SETTINGS TABLE (Privacy & Notifications)
-- ==============================================

CREATE TABLE IF NOT EXISTS player_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE UNIQUE,

  -- Privacy settings
  is_discoverable BOOLEAN DEFAULT TRUE,
  show_gpa BOOLEAN DEFAULT FALSE,
  show_test_scores BOOLEAN DEFAULT FALSE,
  show_contact_info BOOLEAN DEFAULT FALSE,
  show_location BOOLEAN DEFAULT TRUE,

  -- Notification preferences
  notify_on_eval BOOLEAN DEFAULT TRUE,
  notify_on_interest BOOLEAN DEFAULT TRUE,
  notify_on_message BOOLEAN DEFAULT TRUE,
  notify_on_watchlist_add BOOLEAN DEFAULT TRUE,
  notify_on_profile_view BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_settings_player ON player_settings(player_id);
CREATE INDEX idx_player_settings_discoverable ON player_settings(player_id) WHERE is_discoverable = TRUE;

-- ==============================================
-- PLAYER METRICS TABLE (Additional measurables)
-- ==============================================

CREATE TABLE IF NOT EXISTS player_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  metric_label VARCHAR(100) NOT NULL,
  metric_value VARCHAR(50) NOT NULL,
  metric_type VARCHAR(50),

  -- Verification by coaches
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  verified_date TIMESTAMPTZ,

  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX idx_player_metrics_type ON player_metrics(metric_type);
CREATE INDEX idx_player_metrics_verified ON player_metrics(player_id, verified) WHERE verified = TRUE;
CREATE INDEX idx_player_metrics_recorded ON player_metrics(player_id, recorded_at DESC);

-- ==============================================
-- PLAYER ACHIEVEMENTS TABLE (Awards & Honors)
-- ==============================================

CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  achievement_text TEXT NOT NULL,
  achievement_type VARCHAR(50),
  achievement_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX idx_player_achievements_date ON player_achievements(player_id, achievement_date DESC NULLS LAST);
CREATE INDEX idx_player_achievements_type ON player_achievements(achievement_type) WHERE achievement_type IS NOT NULL;

-- ==============================================
-- RECRUITING INTERESTS TABLE (Player's college list)
-- ==============================================

CREATE TABLE IF NOT EXISTS recruiting_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  school_name TEXT NOT NULL,
  conference TEXT,
  division TEXT,

  status VARCHAR(30) NOT NULL DEFAULT 'interested' CHECK (status IN (
    'interested',
    'contacted',
    'questionnaire',
    'unofficial_visit',
    'official_visit',
    'offer',
    'verbal',
    'signed',
    'declined'
  )),

  interest_level VARCHAR(10) CHECK (interest_level IN ('low', 'medium', 'high')),

  coach_name TEXT,
  notes TEXT,
  last_contact_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(player_id, organization_id)
);

CREATE INDEX idx_recruiting_player ON recruiting_interests(player_id);
CREATE INDEX idx_recruiting_status ON recruiting_interests(status);
CREATE INDEX idx_recruiting_org ON recruiting_interests(organization_id);
CREATE INDEX idx_recruiting_player_status ON recruiting_interests(player_id, status);
CREATE INDEX idx_recruiting_last_contact ON recruiting_interests(player_id, last_contact_at DESC NULLS LAST);

-- ==============================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================

ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_interests ENABLE ROW LEVEL SECURITY;

-- ===== PLAYER SETTINGS POLICIES =====

-- Players can manage own settings
CREATE POLICY "Players can manage own settings"
  ON player_settings
  FOR ALL
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ===== PLAYER METRICS POLICIES =====

-- Players can manage own metrics
CREATE POLICY "Players can manage own metrics"
  ON player_metrics
  FOR ALL
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can view metrics for recruiting-activated players
CREATE POLICY "Coaches can view player metrics"
  ON player_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM players p
      JOIN player_settings ps ON ps.player_id = p.id
      WHERE p.id = player_metrics.player_id
        AND p.recruiting_activated = TRUE
        AND ps.is_discoverable = TRUE
    )
  );

-- Coaches can verify metrics
CREATE POLICY "Coaches can verify metrics"
  ON player_metrics
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_metrics.player_id
        AND p.recruiting_activated = TRUE
    )
  )
  WITH CHECK (
    verified_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- ===== PLAYER ACHIEVEMENTS POLICIES =====

-- Players can manage own achievements
CREATE POLICY "Players can manage own achievements"
  ON player_achievements
  FOR ALL
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Achievements viewable for recruiting players
CREATE POLICY "Achievements viewable for recruiting players"
  ON player_achievements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players p
      JOIN player_settings ps ON ps.player_id = p.id
      WHERE p.id = player_achievements.player_id
        AND p.recruiting_activated = TRUE
        AND ps.is_discoverable = TRUE
    )
  );

-- ===== RECRUITING INTERESTS POLICIES =====

-- Players can manage own recruiting interests
CREATE POLICY "Players can manage own recruiting interests"
  ON recruiting_interests
  FOR ALL
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Players can view their own interests even when not recruiting
CREATE POLICY "Players can always view own interests"
  ON recruiting_interests
  FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ==============================================
-- TRIGGERS
-- ==============================================

CREATE TRIGGER update_player_settings_updated_at
  BEFORE UPDATE ON player_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_player_metrics_updated_at
  BEFORE UPDATE ON player_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_player_achievements_updated_at
  BEFORE UPDATE ON player_achievements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_recruiting_interests_updated_at
  BEFORE UPDATE ON recruiting_interests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================
-- AUTO-CREATE PLAYER SETTINGS TRIGGER
-- ==============================================

-- Function to create default player settings
CREATE OR REPLACE FUNCTION create_default_player_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO player_settings (player_id)
  VALUES (NEW.id)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically create player settings
CREATE TRIGGER create_player_settings_on_insert
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION create_default_player_settings();

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE player_settings IS 'Player privacy and notification preferences';
COMMENT ON TABLE player_metrics IS 'Additional measurables beyond core player stats (verified by coaches)';
COMMENT ON TABLE player_achievements IS 'Awards, honors, and achievements earned by players';
COMMENT ON TABLE recruiting_interests IS 'Player''s college interest list and recruiting journey tracking';
