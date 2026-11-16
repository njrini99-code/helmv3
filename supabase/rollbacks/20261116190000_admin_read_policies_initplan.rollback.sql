-- Rollback for 20261116190000_admin_read_policies_initplan.sql
--
-- PRIOR DEFINITION: captured from production (qmnssrrolpinvwjjnufo)
--   pg_policies on 2026-11-16, read-only: each of the 42 policies below had
--   USING (is_admin()) or (team terms OR is_admin()), SELECT only, no WITH CHECK.
--   They match supabase/schemas/policies/*.sql at main 5fb7111b.
-- FORWARD COMMIT: the commit adding the migration above (branch
--   perf/admin-policies-initplan).
-- WHAT ROLLING BACK COSTS: nothing functional; reads that hit these tables go
--   back to running is_admin() once per row (the slower plans measured in the
--   migration header).
-- VERIFY after rollback:
--   select count(*) from pg_catalog.pg_policies
--   where qual like '%SELECT is_admin()%' and policyname in
--   (the 42 names below);  -- expect 0
-- On apply: update the migration's row in supabase/migrations/HELD.md.

SET LOCAL lock_timeout = '3s';

ALTER POLICY "golf_tracer_health_snapshot_admin_read" ON "graveyard"."golf_tracer_health_snapshot" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_announcements" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_attendance_summary" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_coach_insights" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_coach_philosophy" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_documents" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_events" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_insight_generation_log" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_messages" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_patterns_v2" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_player_stats_cache" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_players" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_predictions" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_qualifiers" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_round_reviews" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_rounds" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_shots" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_tasks" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_team_members" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_teams" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."golf_travel_itineraries" USING ("public"."is_admin"());
ALTER POLICY "coach_behavior_admin_read" ON "public"."golf_coach_behavior_log" USING ("public"."is_admin"());
ALTER POLICY "effectiveness_select_admin" ON "public"."golf_insight_effectiveness" USING ("public"."is_admin"());
ALTER POLICY "golf_confidence_calibration_admin_read_all" ON "public"."golf_confidence_calibration" USING ("public"."is_admin"());
ALTER POLICY "golf_platform_metrics_daily_admin_read" ON "public"."golf_platform_metrics_daily" USING ("public"."is_admin"());
ALTER POLICY "golf_recruit_documents_select_coach" ON "public"."golf_recruit_documents" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_team_seasons_select" ON "public"."golf_team_seasons" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tfs_select" ON "public"."golf_tournament_field_scores" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournament_advice_givers_select" ON "public"."golf_tournament_advice_givers" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournament_entries_select" ON "public"."golf_tournament_entries" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournament_field_teams_select" ON "public"."golf_tournament_field_teams" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournament_round_lineups_select" ON "public"."golf_tournament_round_lineups" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournament_rounds_select" ON "public"."golf_tournament_rounds" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id") OR "public"."is_admin"()));
ALTER POLICY "golf_tournaments_select" ON "public"."golf_tournaments" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id") OR "public"."is_admin"()));
ALTER POLICY "Admins can read audit logs" ON "public"."audit_log" USING ("public"."is_admin"());
ALTER POLICY "Admins can read error logs" ON "public"."error_logs" USING ("public"."is_admin"());
ALTER POLICY "Admins can read login attempts" ON "public"."login_attempts" USING ("public"."is_admin"());
ALTER POLICY "admin_read_all" ON "public"."users" USING ("public"."is_admin"());
ALTER POLICY "api_call_logs_admin_read" ON "public"."api_call_logs" USING ("public"."is_admin"());
ALTER POLICY "auth_metrics_hourly_admin_read" ON "public"."auth_metrics_hourly" USING ("public"."is_admin"());
ALTER POLICY "background_job_logs_admin_read" ON "public"."background_job_logs" USING ("public"."is_admin"());
ALTER POLICY "error_rate_hourly_admin_read" ON "public"."error_rate_hourly" USING ("public"."is_admin"());
