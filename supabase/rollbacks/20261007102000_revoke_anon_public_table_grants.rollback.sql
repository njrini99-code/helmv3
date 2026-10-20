-- ROLLBACK CAPTURE for supabase/migrations/20261007102000_revoke_anon_public_table_grants.sql
--
-- Forward change (held, not applied): REVOKE ALL ON ALL TABLES / SEQUENCES IN
-- SCHEMA public FROM anon, re-grant the four legitimate anon privileges, and
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON
-- TABLES / SEQUENCES FROM anon.
--
-- This file restores EXACTLY the anon privileges production held at capture
-- time, not the broader `GRANT ALL ON ALL TABLES ... TO anon` the forward
-- file's header used to suggest (that would also grant tables anon never had,
-- e.g. TRUNCATE on the five golf_event* / golf_calendar* tables).
--
-- Captured VERBATIM from the live production catalog (read-only transaction,
-- `begin read only; ... rollback;`, 2026-10-12 04:31 UTC):
--   * relation ACLs: aclexplode(pg_class.relacl) for grantee anon in schema
--     public -> 119 relations (115 tables + 4 views). 115 tables carry SELECT,
--     110 carry TRUNCATE; every row grantor postgres, none WITH GRANT OPTION.
--     The 4 views carry SELECT; one of them (not the three public-profile
--     views) carries the full table set.
--   * column ACLs (pg_attribute.attacl) for anon in public: none.
--   * sequences: anon holds none.
--   * default ACLs (pg_default_acl, schema public, grantee anon):
--       postgres       r: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--       postgres       S: SELECT, UPDATE, USAGE
--       postgres       f: EXECUTE          (NOT touched by the forward file; left alone here)
--       supabase_admin r/S/f               (NOT touched by the forward file; left alone here)
--   * function EXECUTE for anon in public: 124 grants (NOT touched by the
--     forward file; left alone here).
-- Production server_version 17.6 (MAINTAIN exists from PG17).
--
-- RE-CAPTURE IMMEDIATELY BEFORE APPLYING THE FORWARD FILE. A table created or
-- dropped between 2026-10-12 and the apply is not reflected below: a new table
-- would be missing from the restore, a dropped one makes its GRANT fail (and,
-- run as one transaction, aborts the whole rollback). Generator (read-only):
--
--   with anon as (select oid from pg_roles where rolname='anon'),
--   rel as (
--    select c.relname, c.relkind, a.privilege_type, a.is_grantable
--    from pg_class c cross join lateral aclexplode(c.relacl) a
--    where c.relnamespace='public'::regnamespace and a.grantee=(select oid from anon)),
--   grp as (
--    select relname, relkind, is_grantable,
--      string_agg(privilege_type, ', ' order by privilege_type) privs
--    from rel group by 1,2,3)
--   select format('GRANT %s ON %s public.%I TO anon%s;', privs,
--     case when relkind = 'S' then 'SEQUENCE' else 'TABLE' end,
--     relname, case when is_grantable then ' WITH GRANT OPTION' else '' end) stmt
--   from grp order by relname, is_grantable;
--
-- APPLY ORDER CAVEAT: files that sort before this one also revoke anon, and
-- this snapshot predates them: 20260929200000 (golf_qualifiers,
-- golf_qualifier_entries, golf_qualifier_selections) and 20261005120000
-- (golf_rounds, golf_holes, golf_shots, putt_details, approach_miss_details,
-- golf_player_stats_cache). Run as captured, this file would re-grant anon on
-- those nine tables too and undo part of those files. Re-capture right before
-- applying the forward file, after the earlier files are live; if that was
-- skipped, delete those nine GRANT lines before running this.
--
-- WHAT THIS ROLLBACK COSTS: it re-opens full anon DML, including TRUNCATE (not
-- governed by RLS), on 115 public tables, and the 125
-- pg_graphql_anon_table_exposed advisor findings. RLS still returns no rows to
-- anon except demo_requests INSERT. Use only if the forward revoke breaks a
-- signed-out flow that cannot be fixed by a targeted grant instead.
--
-- Metadata (fill on apply):
--   forward commit:          (the commit carrying the forward migration on main)
--   forward applied to prod: ____________________ (timestamp, by owner)
--   rollback applied:        ____________________ (timestamp, by owner)
--   approval:                owner (Nick)
--   sentry watch:            42501 / PostgREST 401-403 on /rest/v1/*, 1h after either apply

-- -- Revert SQL (exact prior production state; run as one transaction) -------

SET LOCAL lock_timeout = '3s';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_analytics_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_api_perf_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_client_errors TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_call_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.approach_miss_details TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.auth_metrics_hourly TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.auth_rate_limits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.baseball_demo_sessions TO anon;
GRANT SELECT ON TABLE public.baseball_team_coach_staff_public TO anon;
GRANT SELECT ON TABLE public.baseball_teams_public_profile TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_automations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_contact_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_email_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_email_suppressions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_email_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_google_calendar_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_replies TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_segments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_sequence_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_sequence_steps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_sequences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crm_unmatched_inbound TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.demo_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_clicks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.emails TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.error_rate_hourly TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_academic_exclusions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_announcement_acknowledgements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_announcement_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_announcement_recipients TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_announcement_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_attendance_summary TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.golf_calendar_feeds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.golf_calendar_notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_causal_relationships TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coach_behavior_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coach_blocked_time TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coach_insights TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coach_philosophy TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coach_player_intent TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coaches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coachhelm_coach_weights TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coachhelm_llm_budget TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coachhelm_llm_calls TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_coachhelm_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_confidence_calibration TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_conversation_participants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_conversations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_course_holes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_courses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_demo_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_document_versions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_drills TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.golf_event_attendance TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.golf_event_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.golf_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_global_patterns TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_goal_suggestions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_goals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_holes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_ingest_connections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_ingest_sync_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_insight_drill_attachments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_insight_effectiveness TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_insight_generation_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_insight_outcome_attribution TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_insight_player_feedback TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_learned_behavior TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_metrics TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_pga_standards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_platform_metrics_daily TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_classes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_courses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_focus_areas TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_genome TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_notification_state TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_standing TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_player_stats_cache TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_players TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_practice_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_prediction_model_performance TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_prediction_validations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_predictions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_qualifier_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_qualifier_selections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_qualifiers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_recruit_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_recruits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_review_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_round_stats_cache TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_rounds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_shots TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_task_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_task_reminders TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_task_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_team_coach_staff TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_team_coachhelm_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_team_join_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_team_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_team_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_teams TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_travel_budgets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_travel_expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.golf_travel_itineraries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organizations TO anon;
GRANT SELECT ON TABLE public.organizations_public_profile TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.putt_details TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.users TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;

-- -- Verification (expect one row each) ---------------------------------------
-- Relation counts match the capture: 119 relations, 115 tables with SELECT,
-- 110 tables with TRUNCATE, 4 views with SELECT, no grant option.
--   select 1 where (
--     select count(distinct c.oid) from pg_class c
--     cross join lateral aclexplode(c.relacl) a
--     where c.relnamespace = 'public'::regnamespace
--       and a.grantee = 'anon'::regrole) = 119
--   and (select count(*) from pg_class c cross join lateral aclexplode(c.relacl) a
--     where c.relnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole
--       and c.relkind = 'r' and a.privilege_type = 'SELECT') = 115
--   and (select count(*) from pg_class c cross join lateral aclexplode(c.relacl) a
--     where c.relnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole
--       and c.relkind = 'r' and a.privilege_type = 'TRUNCATE') = 110
--   and (select count(*) from pg_class c cross join lateral aclexplode(c.relacl) a
--     where c.relnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole
--       and c.relkind = 'v' and a.privilege_type = 'SELECT') = 4
--   and not exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
--     where c.relnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole
--       and a.is_grantable);
-- Default privileges restored for postgres (8 table + 3 sequence entries):
--   select 1 where (select count(*) from pg_default_acl d
--     cross join lateral aclexplode(d.defaclacl) a
--     where d.defaclnamespace = 'public'::regnamespace
--       and d.defaclrole = 'postgres'::regrole and d.defaclobjtype in ('r', 'S')
--       and a.grantee = 'anon'::regrole) = 11;
