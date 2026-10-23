-- ROLLBACK CAPTURE for
-- supabase/migrations/20261023130000_anon_surface_grants.sql
-- Captured from Helm-Production pg_class.relacl on 2026-10-23 (read-only).
-- Restores the exact anon/authenticated grants the migration removes.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

GRANT ALL ON TABLE graveyard.baseball_availability_statuses TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_bodyweight_entries TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_import_field_mappings TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_assignments TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_days TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_exercise_substitutions TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_exercises TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_import_rows TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_import_runs TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_prescriptions TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_program_assignments TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_programs TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_results TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_sections TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_session_exercises TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_sessions TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_set_results TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_lift_weeks TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_readiness_checkins TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_soreness_maps TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_stat_facts TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_strength_group_audit TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_strength_group_members TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_strength_groups TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_strength_maxes TO authenticated;
GRANT ALL ON TABLE graveyard.baseball_strength_prs TO authenticated;
GRANT ALL ON TABLE graveyard.crm_activity_log TO authenticated;
GRANT ALL ON TABLE graveyard.golf_percentile_cache TO authenticated;
GRANT ALL ON TABLE graveyard.golf_player_attendance_stats TO authenticated;
GRANT ALL ON TABLE graveyard.golf_player_baselines TO authenticated;
GRANT ALL ON TABLE graveyard.golf_tracer_health_snapshot TO authenticated;
GRANT ALL ON TABLE graveyard.golf_validations TO authenticated;

GRANT ALL ON TABLE graveyard.crm_activity_log TO anon;
GRANT ALL ON TABLE graveyard.golf_percentile_cache TO anon;
GRANT ALL ON TABLE graveyard.golf_player_attendance_stats TO anon;
GRANT ALL ON TABLE graveyard.golf_player_baselines TO anon;
GRANT ALL ON TABLE graveyard.golf_tracer_health_snapshot TO anon;
GRANT ALL ON TABLE graveyard.golf_validations TO anon;
