-- ============================================================================
-- Convert TEXT+CHECK to ENUM for consistency
-- ============================================================================

-- ============================================================================
-- Create missing ENUMs
-- ============================================================================

-- Team type enum
DO $$ BEGIN
  CREATE TYPE team_type AS ENUM ('high_school', 'showcase', 'juco', 'college', 'travel_ball');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Organization type enum
DO $$ BEGIN
  CREATE TYPE organization_type AS ENUM ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Video type enum
DO $$ BEGIN
  CREATE TYPE video_type AS ENUM ('highlight', 'game', 'practice', 'skills', 'pitching', 'hitting', 'fielding', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification type enum
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('message', 'watchlist_add', 'profile_view', 'interest', 'offer', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Add updated_at to tables missing it
-- ============================================================================

-- Messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Videos
ALTER TABLE videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Add unique constraints for "only one primary" patterns
-- ============================================================================

-- Only one primary video per player
DROP INDEX IF EXISTS idx_videos_one_primary_per_player;
CREATE UNIQUE INDEX idx_videos_one_primary_per_player
  ON videos(player_id) WHERE is_primary = TRUE;

-- Only one primary coach per team
DROP INDEX IF EXISTS idx_team_staff_one_primary_per_team;
CREATE UNIQUE INDEX idx_team_staff_one_primary_per_team
  ON team_coach_staff(team_id) WHERE is_primary = TRUE;

-- ============================================================================
-- Remove redundant columns
-- ============================================================================

-- watchlists.added_at is redundant with created_at (same value always)
-- Keep added_at for now but document it's deprecated
COMMENT ON COLUMN watchlists.added_at IS 'DEPRECATED: Use created_at instead. Will be removed in future migration.';
