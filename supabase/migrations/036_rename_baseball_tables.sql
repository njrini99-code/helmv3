-- ============================================================================
-- Migration: 036_rename_baseball_tables.sql
-- Purpose: Rename core baseball tables to use baseball_ prefix for clean
--          sport separation (golf already uses golf_ prefix)
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop existing triggers that reference old table names
-- ============================================================================

DROP TRIGGER IF EXISTS update_coaches_updated_at ON coaches;
DROP TRIGGER IF EXISTS update_players_updated_at ON players;
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
DROP TRIGGER IF EXISTS update_watchlists_updated_at ON watchlists;
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
DROP TRIGGER IF EXISTS update_player_settings_updated_at ON player_settings;
DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
DROP TRIGGER IF EXISTS update_team_invitations_updated_at ON team_invitations;
DROP TRIGGER IF EXISTS update_team_coach_staff_updated_at ON team_coach_staff;
DROP TRIGGER IF EXISTS update_player_engagement_events_updated_at ON player_engagement_events;

-- ============================================================================
-- STEP 2: Rename core baseball tables
-- ============================================================================

-- Rename coaches to baseball_coaches
ALTER TABLE IF EXISTS coaches RENAME TO baseball_coaches;

-- Rename players to baseball_players
ALTER TABLE IF EXISTS players RENAME TO baseball_players;

-- Rename teams to baseball_teams
ALTER TABLE IF EXISTS teams RENAME TO baseball_teams;

-- Rename team_members to baseball_team_members
ALTER TABLE IF EXISTS team_members RENAME TO baseball_team_members;

-- Rename team_invitations to baseball_team_invitations
ALTER TABLE IF EXISTS team_invitations RENAME TO baseball_team_invitations;

-- Rename team_coach_staff to baseball_team_coach_staff
ALTER TABLE IF EXISTS team_coach_staff RENAME TO baseball_team_coach_staff;

-- Rename watchlists to baseball_watchlists
ALTER TABLE IF EXISTS watchlists RENAME TO baseball_watchlists;

-- Rename videos to baseball_videos
ALTER TABLE IF EXISTS videos RENAME TO baseball_videos;

-- Rename player_settings to baseball_player_settings
ALTER TABLE IF EXISTS player_settings RENAME TO baseball_player_settings;

-- Rename player_metrics to baseball_player_metrics
ALTER TABLE IF EXISTS player_metrics RENAME TO baseball_player_metrics;

-- Rename player_achievements to baseball_player_achievements
ALTER TABLE IF EXISTS player_achievements RENAME TO baseball_player_achievements;

-- Rename player_engagement_events to baseball_player_engagement_events
ALTER TABLE IF EXISTS player_engagement_events RENAME TO baseball_player_engagement_events;

-- Rename recruiting_interests to baseball_recruiting_interests
ALTER TABLE IF EXISTS recruiting_interests RENAME TO baseball_recruiting_interests;

-- Rename coach_notes to baseball_coach_notes
ALTER TABLE IF EXISTS coach_notes RENAME TO baseball_coach_notes;

-- Rename coach_calendar_events to baseball_coach_calendar_events
ALTER TABLE IF EXISTS coach_calendar_events RENAME TO baseball_coach_calendar_events;

-- Rename developmental_plans to baseball_developmental_plans
ALTER TABLE IF EXISTS developmental_plans RENAME TO baseball_developmental_plans;

-- Rename camps to baseball_camps
ALTER TABLE IF EXISTS camps RENAME TO baseball_camps;

-- Rename camp_registrations to baseball_camp_registrations
ALTER TABLE IF EXISTS camp_registrations RENAME TO baseball_camp_registrations;

-- Rename events to baseball_events
ALTER TABLE IF EXISTS events RENAME TO baseball_events;

-- Rename video_views to baseball_video_views
ALTER TABLE IF EXISTS video_views RENAME TO baseball_video_views;

-- Rename player_comparisons to baseball_player_comparisons
ALTER TABLE IF EXISTS player_comparisons RENAME TO baseball_player_comparisons;

-- Rename team_lineups to baseball_team_lineups
ALTER TABLE IF EXISTS team_lineups RENAME TO baseball_team_lineups;

-- ============================================================================
-- STEP 3: Recreate triggers with new table names
-- ============================================================================

-- Baseball Coaches
CREATE TRIGGER update_baseball_coaches_updated_at
  BEFORE UPDATE ON baseball_coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Players
CREATE TRIGGER update_baseball_players_updated_at
  BEFORE UPDATE ON baseball_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Teams
CREATE TRIGGER update_baseball_teams_updated_at
  BEFORE UPDATE ON baseball_teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Watchlists
CREATE TRIGGER update_baseball_watchlists_updated_at
  BEFORE UPDATE ON baseball_watchlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Videos
CREATE TRIGGER update_baseball_videos_updated_at
  BEFORE UPDATE ON baseball_videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Player Settings
CREATE TRIGGER update_baseball_player_settings_updated_at
  BEFORE UPDATE ON baseball_player_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Developmental Plans
CREATE TRIGGER update_baseball_developmental_plans_updated_at
  BEFORE UPDATE ON baseball_developmental_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Coach Notes
CREATE TRIGGER update_baseball_coach_notes_updated_at
  BEFORE UPDATE ON baseball_coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Coach Calendar Events
CREATE TRIGGER update_baseball_coach_calendar_events_updated_at
  BEFORE UPDATE ON baseball_coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Events
CREATE TRIGGER update_baseball_events_updated_at
  BEFORE UPDATE ON baseball_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Camps
CREATE TRIGGER update_baseball_camps_updated_at
  BEFORE UPDATE ON baseball_camps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Player Comparisons
CREATE TRIGGER update_baseball_player_comparisons_updated_at
  BEFORE UPDATE ON baseball_player_comparisons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseball Team Lineups
CREATE TRIGGER update_baseball_team_lineups_updated_at
  BEFORE UPDATE ON baseball_team_lineups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- STEP 4: Update camp counts trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_camp_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE baseball_camps SET
      registered_count = COALESCE((
        SELECT COUNT(*) FROM baseball_camp_registrations
        WHERE camp_id = OLD.camp_id AND status = 'confirmed'
      ), 0),
      waitlist_count = COALESCE((
        SELECT COUNT(*) FROM baseball_camp_registrations
        WHERE camp_id = OLD.camp_id AND status = 'waitlist'
      ), 0)
    WHERE id = OLD.camp_id;
    RETURN OLD;
  ELSE
    UPDATE baseball_camps SET
      registered_count = COALESCE((
        SELECT COUNT(*) FROM baseball_camp_registrations
        WHERE camp_id = NEW.camp_id AND status = 'confirmed'
      ), 0),
      waitlist_count = COALESCE((
        SELECT COUNT(*) FROM baseball_camp_registrations
        WHERE camp_id = NEW.camp_id AND status = 'waitlist'
      ), 0)
    WHERE id = NEW.camp_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_camp_counts ON baseball_camp_registrations;
CREATE TRIGGER trigger_update_camp_counts
  AFTER INSERT OR UPDATE OR DELETE ON baseball_camp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_camp_counts();

-- ============================================================================
-- STEP 5: Update profile completion function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_profile_completion(p baseball_players)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 15;
  filled INTEGER := 0;
BEGIN
  IF p.first_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.last_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.primary_position IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.grad_year IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.height_feet IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.weight_lbs IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.high_school_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.city IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.state IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.gpa IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.bats IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.throws IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.about_me IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.pitch_velo IS NOT NULL OR p.exit_velo IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.has_video THEN filled := filled + 1; END IF;
  RETURN (filled * 100 / total);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 6: Update engagement trend function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_player_engagement_trend(
  p_player_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  engagement_date DATE,
  total_views BIGINT,
  unique_coaches BIGINT,
  watchlist_adds BIGINT,
  video_plays BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pee.engagement_date,
    COUNT(*) FILTER (WHERE pee.engagement_type = 'profile_view') AS total_views,
    COUNT(DISTINCT pee.coach_id) FILTER (WHERE pee.engagement_type = 'profile_view') AS unique_coaches,
    COUNT(*) FILTER (WHERE pee.engagement_type = 'watchlist_add') AS watchlist_adds,
    COUNT(*) FILTER (WHERE pee.engagement_type = 'video_play') AS video_plays
  FROM baseball_player_engagement_events pee
  WHERE pee.player_id = p_player_id
    AND pee.engagement_date >= CURRENT_DATE - p_days
  GROUP BY pee.engagement_date
  ORDER BY pee.engagement_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Update RLS helper functions
-- ============================================================================

-- Check if user is a baseball team coach
CREATE OR REPLACE FUNCTION is_baseball_team_coach(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM baseball_teams t
    JOIN baseball_coaches c ON c.id = t.head_coach_id
    WHERE t.id = p_team_id AND c.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    JOIN baseball_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id AND c.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if user is a baseball team player
CREATE OR REPLACE FUNCTION is_baseball_team_player(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM baseball_team_members tm
    JOIN baseball_players p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id AND p.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- STEP 8: Update comments
-- ============================================================================
COMMENT ON TABLE baseball_coaches IS 'Baseball coach profiles with school and recruiting info';
COMMENT ON TABLE baseball_players IS 'Baseball player profiles with stats and recruiting info';
COMMENT ON TABLE baseball_teams IS 'Baseball teams (HS, showcase, JUCO, college)';
COMMENT ON TABLE baseball_watchlists IS 'Coach recruiting watchlist entries';
COMMENT ON TABLE baseball_videos IS 'Player highlight and game videos';
COMMENT ON TABLE baseball_events IS 'Games, practices, and team events';
COMMENT ON TABLE baseball_camps IS 'College-hosted recruiting camps';

-- ============================================================================
-- Done! Tables have been renamed with baseball_ prefix
-- ============================================================================
