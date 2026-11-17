-- Admin read policies call is_admin() once per query, not once per row.
-- STATUS: APPLIED to production 2026-11-17 00:13Z (owner go).
--   Record: supabase/migrations/HELD.md.
--
-- WHY. 42 permissive SELECT policies (39 public, 1 graveyard, all listed below)
--   say USING (public.is_admin()). Postgres ORs every permissive policy for a
--   table, so for an ordinary coach or player the bare call runs on EVERY row
--   the query looks at, even though its answer cannot change within a query
--   (it takes no argument; it reads users by auth.uid()). Wrapped as
--   (SELECT public.is_admin()) it becomes an InitPlan: once per query. This is
--   Supabase's documented RLS pattern and the form 207 auth.uid() calls here
--   already use.
--
-- MEASURED on production, read-only, 2026-11-16, as a coach (EXPLAIN ANALYZE):
--   golf_shots for 60 rounds (4,009 rows): 191ms with the bare call, 10.4ms
--   wrapped (18x). is_admin() alone costs about 16us per row.
--   pg_stat_statements:
--   shot reads by round average 381ms (403 calls, max 12.9s), 690ms (133) and
--   337ms (244). The same OR sits on golf_rounds, golf_events, golf_players,
--   golf_team_members, golf_teams, golf_messages, users and the rest below.
--
-- WHAT. ALTER POLICY ... USING (...) only: no policy is dropped or created, no
--   role, command or other OR branch changes, and who can read what is the same
--   (is_admin() returns the same value for every row of one statement). The six
--   tournament and season policies keep their coach/player terms; only their
--   is_admin() term is wrapped.
--   supabase/schemas/policies/{golf,shared,archive}.sql
--   carry the same 42 lines.
--
-- RISK: low. No data change. App change: none.
-- LOCKS: ALTER POLICY takes ACCESS EXCLUSIVE on each of the 42 tables until the
--   commit (golf_shots, golf_rounds, golf_events, users among them). The whole
--   file is catalog-only and takes milliseconds; lock_timeout gives up after 3s
--   with nothing changed. Apply off-peak and run again on a lock timeout.
-- ORDER: independent of every other held file.
--
-- VERIFY: select 1 where not exists (select 1 from pg_catalog.pg_policies
-- VERIFY: where schemaname in ('public', 'graveyard') and qual is not null
-- VERIFY: and regexp_replace(qual, 'SELECT (public\.)?is_admin\(\)', '', 'g')
-- VERIFY: ~ '(^|[^a-z_])is_admin\(\)');
-- VERIFY: select 1 from pg_catalog.pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'golf_shots' and policyname = 'admin_read_all'
-- VERIFY: and qual like '%SELECT is_admin()%';
--
-- ROLLBACK: supabase/rollbacks/
--   20261116190000_admin_read_policies_initplan.rollback.sql
--   (the 42 policies' USING clauses as production had them on 2026-11-16).

SET LOCAL lock_timeout = '3s';

ALTER POLICY "golf_tracer_health_snapshot_admin_read"
ON "graveyard"."golf_tracer_health_snapshot"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_announcements"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_attendance_summary"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_coach_insights"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_coach_philosophy"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_documents"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_events"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_insight_generation_log"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_messages"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_patterns_v2"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_player_stats_cache"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_players"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_predictions"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_qualifiers"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_round_reviews"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_rounds"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_shots"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_tasks"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_team_members"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_teams"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."golf_travel_itineraries"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "coach_behavior_admin_read"
ON "public"."golf_coach_behavior_log"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "effectiveness_select_admin"
ON "public"."golf_insight_effectiveness"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "golf_confidence_calibration_admin_read_all"
ON "public"."golf_confidence_calibration"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "golf_platform_metrics_daily_admin_read"
ON "public"."golf_platform_metrics_daily"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "golf_recruit_documents_select_coach"
ON "public"."golf_recruit_documents"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_team_seasons_select"
ON "public"."golf_team_seasons"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR "public"."is_golf_team_player"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tfs_select"
ON "public"."golf_tournament_field_scores"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournament_advice_givers_select"
ON "public"."golf_tournament_advice_givers"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR "public"."is_golf_team_player"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournament_entries_select"
ON "public"."golf_tournament_entries"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournament_field_teams_select"
ON "public"."golf_tournament_field_teams"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR "public"."is_golf_team_player"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournament_round_lineups_select"
ON "public"."golf_tournament_round_lineups"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournament_rounds_select"
ON "public"."golf_tournament_rounds"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR "public"."is_golf_team_player"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "golf_tournaments_select"
ON "public"."golf_tournaments"
USING (
    "public"."is_golf_team_coach"("team_id")
    OR "public"."is_golf_team_player"("team_id")
    OR (SELECT "public"."is_admin"())
);

ALTER POLICY "Admins can read audit logs"
ON "public"."audit_log"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "Admins can read error logs"
ON "public"."error_logs"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "Admins can read login attempts"
ON "public"."login_attempts"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "admin_read_all"
ON "public"."users"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "api_call_logs_admin_read"
ON "public"."api_call_logs"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "auth_metrics_hourly_admin_read"
ON "public"."auth_metrics_hourly"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "background_job_logs_admin_read"
ON "public"."background_job_logs"
USING ((SELECT "public"."is_admin"()));

ALTER POLICY "error_rate_hourly_admin_read"
ON "public"."error_rate_hourly"
USING ((SELECT "public"."is_admin"()));
