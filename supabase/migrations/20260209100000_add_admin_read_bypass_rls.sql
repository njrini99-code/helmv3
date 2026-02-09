-- Helper function: check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Admin read-bypass policies for all tables queried by the admin dashboard
-- (Skipping tables that already have open SELECT: golf_coaches, golf_insight_effectiveness,
--  golf_prediction_model_performance, organizations)

CREATE POLICY "admin_read_all" ON users
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_players
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_teams
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_team_members
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_rounds
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_shots
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_round_reviews
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_insight_generation_log
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_player_stats_cache
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_coach_philosophy
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_coach_insights
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_patterns_v2
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_predictions
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_qualifiers
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_events
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_tasks
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_announcements
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_messages
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_documents
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_travel_itineraries
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_read_all" ON golf_attendance_summary
  FOR SELECT TO authenticated
  USING (is_admin());
