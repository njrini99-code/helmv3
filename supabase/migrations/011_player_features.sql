-- ============================================================================
-- Migration: 011_player_features.sql
-- Purpose: Player settings, metrics, achievements
-- Consolidated from: 008_create_player_features.sql
-- ============================================================================

-- Player Settings
CREATE TABLE IF NOT EXISTS player_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE UNIQUE,

  -- Privacy settings
  is_discoverable BOOLEAN DEFAULT TRUE,
  show_gpa BOOLEAN DEFAULT TRUE,
  show_test_scores BOOLEAN DEFAULT TRUE,
  show_contact_info BOOLEAN DEFAULT TRUE,
  show_location BOOLEAN DEFAULT TRUE,

  -- Notification settings
  notify_on_eval BOOLEAN DEFAULT TRUE,
  notify_on_interest BOOLEAN DEFAULT TRUE,
  notify_on_message BOOLEAN DEFAULT TRUE,
  notify_on_watchlist_add BOOLEAN DEFAULT TRUE,
  notify_on_profile_view BOOLEAN DEFAULT FALSE,
  email_notifications BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Metrics (flexible measurables)
CREATE TABLE IF NOT EXISTS player_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  metric_label TEXT NOT NULL,
  metric_value TEXT NOT NULL,
  metric_type TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES coaches(id),
  verified_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Achievements
CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_text TEXT NOT NULL,
  achievement_type achievement_type DEFAULT 'other',
  achievement_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recruiting Interests (player's college list)
CREATE TABLE IF NOT EXISTS recruiting_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  school_name TEXT,
  conference TEXT,
  division TEXT,
  interest_level TEXT,
  status TEXT,
  coach_name TEXT,
  notes TEXT,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, organization_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_settings_player ON player_settings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_recruiting_interests_player ON recruiting_interests(player_id);

-- Triggers
CREATE TRIGGER update_player_settings_updated_at
  BEFORE UPDATE ON player_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_player_metrics_updated_at
  BEFORE UPDATE ON player_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_recruiting_interests_updated_at
  BEFORE UPDATE ON recruiting_interests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
