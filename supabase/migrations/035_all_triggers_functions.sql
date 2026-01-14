-- ============================================================================
-- Migration: 035_all_triggers_functions.sql
-- Purpose: All triggers and helper functions consolidated
-- ============================================================================

-- ============================================================================
-- PART 1: CORE UPDATED_AT TRIGGER FUNCTIONS
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Golf-specific updated_at function
CREATE OR REPLACE FUNCTION update_golf_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: AUTH/USER TRIGGERS
-- ============================================================================

-- Handle new user signup from auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role, sport)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'player'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'sport',
      'baseball'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- PART 3: CORE TABLE TRIGGERS
-- ============================================================================

-- Users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Coaches
DROP TRIGGER IF EXISTS update_coaches_updated_at ON coaches;
CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Players
DROP TRIGGER IF EXISTS update_players_updated_at ON players;
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Organizations
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Teams
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Watchlists
DROP TRIGGER IF EXISTS update_watchlists_updated_at ON watchlists;
CREATE TRIGGER update_watchlists_updated_at
  BEFORE UPDATE ON watchlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Conversations
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Videos
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Player Settings
DROP TRIGGER IF EXISTS update_player_settings_updated_at ON player_settings;
CREATE TRIGGER update_player_settings_updated_at
  BEFORE UPDATE ON player_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Developmental Plans
DROP TRIGGER IF EXISTS update_developmental_plans_updated_at ON developmental_plans;
CREATE TRIGGER update_developmental_plans_updated_at
  BEFORE UPDATE ON developmental_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Coach Notes
DROP TRIGGER IF EXISTS update_coach_notes_updated_at ON coach_notes;
CREATE TRIGGER update_coach_notes_updated_at
  BEFORE UPDATE ON coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Coach Calendar Events
DROP TRIGGER IF EXISTS update_coach_calendar_events_updated_at ON coach_calendar_events;
CREATE TRIGGER update_coach_calendar_events_updated_at
  BEFORE UPDATE ON coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Events
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Camps
DROP TRIGGER IF EXISTS update_camps_updated_at ON camps;
CREATE TRIGGER update_camps_updated_at
  BEFORE UPDATE ON camps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Player Comparisons
DROP TRIGGER IF EXISTS update_player_comparisons_updated_at ON player_comparisons;
CREATE TRIGGER update_player_comparisons_updated_at
  BEFORE UPDATE ON player_comparisons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Team Lineups
DROP TRIGGER IF EXISTS update_team_lineups_updated_at ON team_lineups;
CREATE TRIGGER update_team_lineups_updated_at
  BEFORE UPDATE ON team_lineups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 4: CAMP REGISTRATION COUNT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_camp_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE camps SET
      registered_count = COALESCE((
        SELECT COUNT(*) FROM camp_registrations
        WHERE camp_id = OLD.camp_id AND status = 'confirmed'
      ), 0),
      waitlist_count = COALESCE((
        SELECT COUNT(*) FROM camp_registrations
        WHERE camp_id = OLD.camp_id AND status = 'waitlist'
      ), 0)
    WHERE id = OLD.camp_id;
    RETURN OLD;
  ELSE
    UPDATE camps SET
      registered_count = COALESCE((
        SELECT COUNT(*) FROM camp_registrations
        WHERE camp_id = NEW.camp_id AND status = 'confirmed'
      ), 0),
      waitlist_count = COALESCE((
        SELECT COUNT(*) FROM camp_registrations
        WHERE camp_id = NEW.camp_id AND status = 'waitlist'
      ), 0)
    WHERE id = NEW.camp_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_camp_counts ON camp_registrations;
CREATE TRIGGER trigger_update_camp_counts
  AFTER INSERT OR UPDATE OR DELETE ON camp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_camp_counts();

-- ============================================================================
-- PART 5: PLAYER PROFILE COMPLETION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_profile_completion(p players)
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
-- PART 6: GOLF TABLE TRIGGERS
-- ============================================================================

-- Golf Organizations
DROP TRIGGER IF EXISTS update_golf_organizations_updated_at ON golf_organizations;
CREATE TRIGGER update_golf_organizations_updated_at
  BEFORE UPDATE ON golf_organizations
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Teams
DROP TRIGGER IF EXISTS update_golf_teams_updated_at ON golf_teams;
CREATE TRIGGER update_golf_teams_updated_at
  BEFORE UPDATE ON golf_teams
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Coaches
DROP TRIGGER IF EXISTS update_golf_coaches_updated_at ON golf_coaches;
CREATE TRIGGER update_golf_coaches_updated_at
  BEFORE UPDATE ON golf_coaches
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Players
DROP TRIGGER IF EXISTS update_golf_players_updated_at ON golf_players;
CREATE TRIGGER update_golf_players_updated_at
  BEFORE UPDATE ON golf_players
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Rounds
DROP TRIGGER IF EXISTS update_golf_rounds_updated_at ON golf_rounds;
CREATE TRIGGER update_golf_rounds_updated_at
  BEFORE UPDATE ON golf_rounds
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Events
DROP TRIGGER IF EXISTS update_golf_events_updated_at ON golf_events;
CREATE TRIGGER update_golf_events_updated_at
  BEFORE UPDATE ON golf_events
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Qualifiers
DROP TRIGGER IF EXISTS update_golf_qualifiers_updated_at ON golf_qualifiers;
CREATE TRIGGER update_golf_qualifiers_updated_at
  BEFORE UPDATE ON golf_qualifiers
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Announcements
DROP TRIGGER IF EXISTS update_golf_announcements_updated_at ON golf_announcements;
CREATE TRIGGER update_golf_announcements_updated_at
  BEFORE UPDATE ON golf_announcements
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Conversations
DROP TRIGGER IF EXISTS update_golf_conversations_updated_at ON golf_conversations;
CREATE TRIGGER update_golf_conversations_updated_at
  BEFORE UPDATE ON golf_conversations
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Tasks
DROP TRIGGER IF EXISTS update_golf_tasks_updated_at ON golf_tasks;
CREATE TRIGGER update_golf_tasks_updated_at
  BEFORE UPDATE ON golf_tasks
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Documents
DROP TRIGGER IF EXISTS update_golf_documents_updated_at ON golf_documents;
CREATE TRIGGER update_golf_documents_updated_at
  BEFORE UPDATE ON golf_documents
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Travel
DROP TRIGGER IF EXISTS update_golf_travel_itineraries_updated_at ON golf_travel_itineraries;
CREATE TRIGGER update_golf_travel_itineraries_updated_at
  BEFORE UPDATE ON golf_travel_itineraries
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Player Classes
DROP TRIGGER IF EXISTS update_golf_player_classes_updated_at ON golf_player_classes;
CREATE TRIGGER update_golf_player_classes_updated_at
  BEFORE UPDATE ON golf_player_classes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Calendar Feeds
DROP TRIGGER IF EXISTS update_golf_calendar_feeds_updated_at ON golf_calendar_feeds;
CREATE TRIGGER update_golf_calendar_feeds_updated_at
  BEFORE UPDATE ON golf_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Calendar Syncs
DROP TRIGGER IF EXISTS update_golf_calendar_syncs_updated_at ON golf_calendar_syncs;
CREATE TRIGGER update_golf_calendar_syncs_updated_at
  BEFORE UPDATE ON golf_calendar_syncs
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf RSVPs
DROP TRIGGER IF EXISTS update_golf_event_rsvps_updated_at ON golf_event_rsvps;
CREATE TRIGGER update_golf_event_rsvps_updated_at
  BEFORE UPDATE ON golf_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Coach Philosophy
DROP TRIGGER IF EXISTS update_golf_coach_philosophy_updated_at ON golf_coach_philosophy;
CREATE TRIGGER update_golf_coach_philosophy_updated_at
  BEFORE UPDATE ON golf_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Golf Coach Notes
DROP TRIGGER IF EXISTS update_golf_coach_notes_updated_at ON golf_coach_notes;
CREATE TRIGGER update_golf_coach_notes_updated_at
  BEFORE UPDATE ON golf_coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- ============================================================================
-- PART 7: GOLF RSVP COUNT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_event_rsvp_counts()
RETURNS TRIGGER AS $$
DECLARE
  target_event_id UUID;
BEGIN
  target_event_id := COALESCE(NEW.event_id, OLD.event_id);

  UPDATE golf_events
  SET
    rsvp_confirmed_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'confirmed'),
    rsvp_maybe_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'maybe'),
    rsvp_declined_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'declined'),
    rsvp_pending_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'pending'),
    rsvp_total_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id),
    updated_at = NOW()
  WHERE id = target_event_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_rsvp_counts ON golf_event_rsvps;
CREATE TRIGGER trigger_update_rsvp_counts
  AFTER INSERT OR UPDATE OR DELETE ON golf_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_event_rsvp_counts();

-- ============================================================================
-- PART 8: GOLF CALENDAR FEED TOKEN GENERATION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_feed_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_default_feed_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.feed_token IS NULL THEN
    NEW.feed_token = generate_feed_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_feed_token ON golf_calendar_feeds;
CREATE TRIGGER trigger_set_feed_token
  BEFORE INSERT ON golf_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION set_default_feed_token();

-- ============================================================================
-- PART 9: GOLF QUALIFIER LEADERBOARD FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_qualifier_leaderboard(qualifier_uuid UUID)
RETURNS TABLE (
  player_id UUID,
  player_name TEXT,
  total_score INTEGER,
  score_to_par INTEGER,
  rounds_played INTEGER,
  best_round INTEGER,
  avg_score NUMERIC,
  "position" INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH player_scores AS (
    SELECT
      gqe.player_id,
      gp.first_name || ' ' || gp.last_name AS pname,
      SUM(gr.total_score) AS tscore,
      SUM(gr.score_to_par) AS stp,
      COUNT(gr.id) AS rplayed,
      MIN(gr.total_score) AS bround,
      AVG(gr.total_score) AS ascore
    FROM golf_qualifier_entries gqe
    JOIN golf_players gp ON gp.id = gqe.player_id
    LEFT JOIN golf_rounds gr ON gr.qualifier_id = (
      SELECT id FROM golf_qualifiers WHERE id = qualifier_uuid
    ) AND gr.player_id = gqe.player_id AND gr.round_status = 'completed'
    WHERE gqe.qualifier_id = qualifier_uuid
    GROUP BY gqe.player_id, gp.first_name, gp.last_name
  )
  SELECT
    ps.player_id,
    ps.pname,
    ps.tscore::INTEGER,
    ps.stp::INTEGER,
    ps.rplayed::INTEGER,
    ps.bround::INTEGER,
    ROUND(ps.ascore, 1),
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN ps.tscore IS NULL THEN 1 ELSE 0 END,
        ps.tscore ASC,
        ps.bround ASC
    )::INTEGER
  FROM player_scores ps
  ORDER BY 8;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 10: GOLF TASK STATUS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_player_task_status(p_player_id UUID)
RETURNS TABLE (
  task_id UUID,
  title TEXT,
  due_date DATE,
  urgency golf_urgency_level,
  status golf_task_status,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.title,
    t.due_date,
    t.urgency,
    CASE
      WHEN tc.completed_at IS NOT NULL THEN 'completed'::golf_task_status
      WHEN t.due_date < CURRENT_DATE THEN 'overdue'::golf_task_status
      ELSE 'pending'::golf_task_status
    END as status,
    tc.completed_at
  FROM golf_tasks t
  LEFT JOIN golf_task_completions tc ON tc.task_id = t.id AND tc.player_id = p_player_id
  WHERE t.assigned_to IS NULL OR t.assigned_to = p_player_id
  ORDER BY
    CASE WHEN tc.completed_at IS NOT NULL THEN 1 ELSE 0 END,
    t.due_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 11: ANALYTICS HELPER FUNCTIONS
-- ============================================================================

-- Get engagement trends for a player
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
  FROM player_engagement_events pee
  WHERE pee.player_id = p_player_id
    AND pee.engagement_date >= CURRENT_DATE - p_days
  GROUP BY pee.engagement_date
  ORDER BY pee.engagement_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 12: BASEBALL STATS CALCULATION FUNCTIONS
-- ============================================================================

-- Calculate batting average
CREATE OR REPLACE FUNCTION calculate_batting_avg(hits INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(hits::NUMERIC / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate On-Base Percentage
CREATE OR REPLACE FUNCTION calculate_obp(hits INTEGER, walks INTEGER, hbp INTEGER, at_bats INTEGER, sac_flies INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  numerator NUMERIC;
  denominator NUMERIC;
BEGIN
  numerator := COALESCE(hits, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0);
  denominator := COALESCE(at_bats, 0) + COALESCE(walks, 0) + COALESCE(hbp, 0) + COALESCE(sac_flies, 0);
  IF denominator = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(numerator / denominator, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate Slugging Percentage
CREATE OR REPLACE FUNCTION calculate_slg(hits INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER, at_bats INTEGER)
RETURNS NUMERIC(4,3) AS $$
DECLARE
  singles INTEGER;
  total_bases NUMERIC;
BEGIN
  IF at_bats IS NULL OR at_bats = 0 THEN RETURN NULL; END IF;
  singles := COALESCE(hits, 0) - COALESCE(doubles, 0) - COALESCE(triples, 0) - COALESCE(home_runs, 0);
  total_bases := singles + (COALESCE(doubles, 0) * 2) + (COALESCE(triples, 0) * 3) + (COALESCE(home_runs, 0) * 4);
  RETURN ROUND(total_bases / at_bats::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PART 13: BASEBALL STATS TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_baseball_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS baseball_player_stats_updated_at ON baseball_player_stats;
CREATE TRIGGER baseball_player_stats_updated_at
  BEFORE UPDATE ON baseball_player_stats
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

DROP TRIGGER IF EXISTS baseball_player_aggregates_updated_at ON baseball_player_aggregates;
CREATE TRIGGER baseball_player_aggregates_updated_at
  BEFORE UPDATE ON baseball_player_aggregates
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

DROP TRIGGER IF EXISTS baseball_coach_philosophy_updated_at ON baseball_coach_philosophy;
CREATE TRIGGER baseball_coach_philosophy_updated_at
  BEFORE UPDATE ON baseball_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_baseball_stats_updated_at();

CREATE OR REPLACE FUNCTION update_philosophy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_philosophy_updated_at ON coach_recruiting_philosophy;
CREATE TRIGGER trigger_philosophy_updated_at
  BEFORE UPDATE ON coach_recruiting_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();

DROP TRIGGER IF EXISTS trigger_percentiles_updated_at ON player_percentiles;
CREATE TRIGGER trigger_percentiles_updated_at
  BEFORE UPDATE ON player_percentiles
  FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();

-- ============================================================================
-- PART 14: TEAM INVITE CODE GENERATION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 15: GOLF ROUND SUMMARY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_golf_round_summary(round_uuid UUID)
RETURNS TABLE (
  round_id UUID,
  player_id UUID,
  player_name TEXT,
  course_name TEXT,
  round_date DATE,
  total_score INTEGER,
  score_to_par INTEGER,
  front_nine INTEGER,
  back_nine INTEGER,
  total_putts INTEGER,
  fairways_hit INTEGER,
  greens_in_regulation INTEGER,
  total_holes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gr.id AS round_id,
    gr.player_id,
    gp.first_name || ' ' || gp.last_name AS player_name,
    gr.course_name,
    gr.round_date,
    gr.total_score,
    gr.score_to_par,
    gr.front_nine,
    gr.back_nine,
    gr.total_putts,
    gr.fairways_hit,
    gr.greens_in_regulation,
    gr.holes_played AS total_holes
  FROM golf_rounds gr
  JOIN golf_players gp ON gp.id = gr.player_id
  WHERE gr.id = round_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 16: GRANTS FOR AUTHENTICATED USERS
-- ============================================================================

-- Grant necessary permissions for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON FUNCTION update_updated_at() IS 'Generic trigger function to update updated_at column';
COMMENT ON FUNCTION handle_new_user() IS 'Creates user record when auth.users entry is created';
COMMENT ON FUNCTION calculate_profile_completion(players) IS 'Calculates player profile completion percentage';
COMMENT ON FUNCTION update_event_rsvp_counts() IS 'Maintains RSVP count denormalization on golf_events';
COMMENT ON FUNCTION get_qualifier_leaderboard(UUID) IS 'Returns leaderboard for a golf qualifier';
COMMENT ON FUNCTION get_player_engagement_trend(UUID, INTEGER) IS 'Returns engagement metrics over time for a player';
COMMENT ON FUNCTION calculate_batting_avg(INTEGER, INTEGER) IS 'Calculates batting average: hits / at_bats';
COMMENT ON FUNCTION calculate_obp(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) IS 'Calculates on-base percentage';
COMMENT ON FUNCTION calculate_slg(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) IS 'Calculates slugging percentage';
