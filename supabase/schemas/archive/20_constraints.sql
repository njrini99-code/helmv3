ALTER TABLE ONLY "graveyard"."baseball_availability_statuses"
    ADD CONSTRAINT "baseball_availability_statuses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_bodyweight_entries"
    ADD CONSTRAINT "baseball_bodyweight_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_import_field_mappings"
    ADD CONSTRAINT "baseball_import_field_mappings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_assignments"
    ADD CONSTRAINT "baseball_lift_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_days"
    ADD CONSTRAINT "baseball_lift_days_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "baseball_lift_exercise_substitutions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_exercises"
    ADD CONSTRAINT "baseball_lift_exercises_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_import_rows"
    ADD CONSTRAINT "baseball_lift_import_rows_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_import_runs"
    ADD CONSTRAINT "baseball_lift_import_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_prescriptions"
    ADD CONSTRAINT "baseball_lift_prescriptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_programs"
    ADD CONSTRAINT "baseball_lift_programs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_sections"
    ADD CONSTRAINT "baseball_lift_sections_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_session_exercises"
    ADD CONSTRAINT "baseball_lift_session_exercises_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_set_results"
    ADD CONSTRAINT "baseball_lift_set_results_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_lift_weeks"
    ADD CONSTRAINT "baseball_lift_weeks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_readiness_checkins"
    ADD CONSTRAINT "baseball_readiness_checkins_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_soreness_maps"
    ADD CONSTRAINT "baseball_soreness_maps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_stat_facts"
    ADD CONSTRAINT "baseball_stat_facts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_strength_group_audit"
    ADD CONSTRAINT "baseball_strength_group_audit_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_strength_group_members"
    ADD CONSTRAINT "baseball_strength_group_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_strength_groups"
    ADD CONSTRAINT "baseball_strength_groups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_strength_maxes"
    ADD CONSTRAINT "baseball_strength_maxes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."golf_percentile_cache"
    ADD CONSTRAINT "golf_percentile_cache_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."golf_percentile_cache"
    ADD CONSTRAINT "golf_percentile_cache_player_id_metric_name_key" UNIQUE ("player_id", "metric_name");

ALTER TABLE ONLY "graveyard"."golf_player_attendance_stats"
    ADD CONSTRAINT "golf_player_attendance_stats_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."golf_player_attendance_stats"
    ADD CONSTRAINT "golf_player_attendance_stats_player_id_team_id_period_start_key" UNIQUE ("player_id", "team_id", "period_start", "period_end");

ALTER TABLE ONLY "graveyard"."golf_player_baselines"
    ADD CONSTRAINT "golf_player_baselines_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."golf_player_baselines"
    ADD CONSTRAINT "golf_player_baselines_player_id_metric_name_key" UNIQUE ("player_id", "metric_name");

ALTER TABLE ONLY "graveyard"."golf_tracer_health_snapshot"
    ADD CONSTRAINT "golf_tracer_health_snapshot_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."golf_validations"
    ADD CONSTRAINT "golf_validations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "graveyard"."baseball_bodyweight_entries"
    ADD CONSTRAINT "uq_baseball_bodyweight_entry" UNIQUE ("player_id", "entry_date");

ALTER TABLE ONLY "graveyard"."baseball_lift_days"
    ADD CONSTRAINT "uq_baseball_lift_day" UNIQUE ("week_id", "day_number");

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "uq_baseball_lift_session" UNIQUE ("program_assignment_id", "player_id");

ALTER TABLE ONLY "graveyard"."baseball_lift_set_results"
    ADD CONSTRAINT "uq_baseball_lift_set" UNIQUE ("session_exercise_id", "set_number");

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "uq_baseball_lift_substitution" UNIQUE ("exercise_id", "substitute_exercise_id");

ALTER TABLE ONLY "graveyard"."baseball_lift_weeks"
    ADD CONSTRAINT "uq_baseball_lift_week" UNIQUE ("program_id", "week_number");

ALTER TABLE ONLY "graveyard"."baseball_readiness_checkins"
    ADD CONSTRAINT "uq_baseball_readiness_checkins" UNIQUE ("player_id", "check_date");

ALTER TABLE ONLY "graveyard"."baseball_strength_group_members"
    ADD CONSTRAINT "uq_baseball_strength_group_member" UNIQUE ("group_id", "player_id");

ALTER TABLE ONLY "graveyard"."baseball_availability_statuses"
    ADD CONSTRAINT "baseball_availability_statuses_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_availability_statuses"
    ADD CONSTRAINT "baseball_availability_statuses_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_availability_statuses"
    ADD CONSTRAINT "baseball_availability_statuses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_bodyweight_entries"
    ADD CONSTRAINT "baseball_bodyweight_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_bodyweight_entries"
    ADD CONSTRAINT "baseball_bodyweight_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_import_field_mappings"
    ADD CONSTRAINT "baseball_import_field_mappings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."baseball_stat_sources"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_import_field_mappings"
    ADD CONSTRAINT "baseball_import_field_mappings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_assignments"
    ADD CONSTRAINT "baseball_lift_assignments_assigned_by_coach_id_fkey" FOREIGN KEY ("assigned_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_assignments"
    ADD CONSTRAINT "baseball_lift_assignments_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."baseball_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_assignments"
    ADD CONSTRAINT "baseball_lift_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_assignments"
    ADD CONSTRAINT "baseball_lift_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_days"
    ADD CONSTRAINT "baseball_lift_days_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "graveyard"."baseball_lift_weeks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "baseball_lift_exercise_substitution_substitute_exercise_id_fkey" FOREIGN KEY ("substitute_exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "baseball_lift_exercise_substitutions_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "baseball_lift_exercise_substitutions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercise_substitutions"
    ADD CONSTRAINT "baseball_lift_exercise_substitutions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercises"
    ADD CONSTRAINT "baseball_lift_exercises_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_exercises"
    ADD CONSTRAINT "baseball_lift_exercises_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_import_rows"
    ADD CONSTRAINT "baseball_lift_import_rows_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "graveyard"."baseball_lift_import_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_import_rows"
    ADD CONSTRAINT "baseball_lift_import_rows_matched_player_id_fkey" FOREIGN KEY ("matched_player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_import_rows"
    ADD CONSTRAINT "baseball_lift_import_rows_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_import_runs"
    ADD CONSTRAINT "baseball_lift_import_runs_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_import_runs"
    ADD CONSTRAINT "baseball_lift_import_runs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_prescriptions"
    ADD CONSTRAINT "baseball_lift_prescriptions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_prescriptions"
    ADD CONSTRAINT "baseball_lift_prescriptions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "graveyard"."baseball_lift_sections"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_prescriptions"
    ADD CONSTRAINT "baseball_lift_prescriptions_substitution_group_id_fkey" FOREIGN KEY ("substitution_group_id") REFERENCES "graveyard"."baseball_lift_exercise_substitutions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_assigned_by_coach_id_fkey" FOREIGN KEY ("assigned_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "graveyard"."baseball_strength_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_lift_day_id_fkey" FOREIGN KEY ("lift_day_id") REFERENCES "graveyard"."baseball_lift_days"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "graveyard"."baseball_lift_programs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_program_assignments"
    ADD CONSTRAINT "baseball_lift_program_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_programs"
    ADD CONSTRAINT "baseball_lift_programs_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_programs"
    ADD CONSTRAINT "baseball_lift_programs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "graveyard"."baseball_lift_assignments"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."baseball_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_results"
    ADD CONSTRAINT "baseball_lift_results_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_sections"
    ADD CONSTRAINT "baseball_lift_sections_lift_day_id_fkey" FOREIGN KEY ("lift_day_id") REFERENCES "graveyard"."baseball_lift_days"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_session_exercises"
    ADD CONSTRAINT "baseball_lift_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_session_exercises"
    ADD CONSTRAINT "baseball_lift_session_exercises_modified_by_coach_id_fkey" FOREIGN KEY ("modified_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_session_exercises"
    ADD CONSTRAINT "baseball_lift_session_exercises_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "graveyard"."baseball_lift_prescriptions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_session_exercises"
    ADD CONSTRAINT "baseball_lift_session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "graveyard"."baseball_lift_sessions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_program_assignment_id_fkey" FOREIGN KEY ("program_assignment_id") REFERENCES "graveyard"."baseball_lift_program_assignments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_readiness_checkin_id_fkey" FOREIGN KEY ("readiness_checkin_id") REFERENCES "graveyard"."baseball_readiness_checkins"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_lift_sessions"
    ADD CONSTRAINT "baseball_lift_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_set_results"
    ADD CONSTRAINT "baseball_lift_set_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_set_results"
    ADD CONSTRAINT "baseball_lift_set_results_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "graveyard"."baseball_lift_session_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_set_results"
    ADD CONSTRAINT "baseball_lift_set_results_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_lift_weeks"
    ADD CONSTRAINT "baseball_lift_weeks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "graveyard"."baseball_lift_programs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_readiness_checkins"
    ADD CONSTRAINT "baseball_readiness_checkins_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_readiness_checkins"
    ADD CONSTRAINT "baseball_readiness_checkins_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_soreness_maps"
    ADD CONSTRAINT "baseball_soreness_maps_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "graveyard"."baseball_readiness_checkins"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_soreness_maps"
    ADD CONSTRAINT "baseball_soreness_maps_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_soreness_maps"
    ADD CONSTRAINT "baseball_soreness_maps_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_stat_facts"
    ADD CONSTRAINT "baseball_stat_facts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_stat_facts"
    ADD CONSTRAINT "baseball_stat_facts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_stat_facts"
    ADD CONSTRAINT "baseball_stat_facts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_audit"
    ADD CONSTRAINT "baseball_strength_group_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_audit"
    ADD CONSTRAINT "baseball_strength_group_audit_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "graveyard"."baseball_strength_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_audit"
    ADD CONSTRAINT "baseball_strength_group_audit_target_player_id_fkey" FOREIGN KEY ("target_player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_audit"
    ADD CONSTRAINT "baseball_strength_group_audit_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_members"
    ADD CONSTRAINT "baseball_strength_group_members_added_by_coach_id_fkey" FOREIGN KEY ("added_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_members"
    ADD CONSTRAINT "baseball_strength_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "graveyard"."baseball_strength_groups"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_group_members"
    ADD CONSTRAINT "baseball_strength_group_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_groups"
    ADD CONSTRAINT "baseball_strength_groups_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_groups"
    ADD CONSTRAINT "baseball_strength_groups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_maxes"
    ADD CONSTRAINT "baseball_strength_maxes_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_maxes"
    ADD CONSTRAINT "baseball_strength_maxes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_maxes"
    ADD CONSTRAINT "baseball_strength_maxes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "graveyard"."baseball_lift_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_lift_session_id_fkey" FOREIGN KEY ("lift_session_id") REFERENCES "graveyard"."baseball_lift_sessions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."baseball_strength_prs"
    ADD CONSTRAINT "baseball_strength_prs_verified_by_coach_id_fkey" FOREIGN KEY ("verified_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "graveyard"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "graveyard"."golf_percentile_cache"
    ADD CONSTRAINT "golf_percentile_cache_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."golf_player_attendance_stats"
    ADD CONSTRAINT "golf_player_attendance_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."golf_player_attendance_stats"
    ADD CONSTRAINT "golf_player_attendance_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."golf_player_baselines"
    ADD CONSTRAINT "golf_player_baselines_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."golf_validations"
    ADD CONSTRAINT "golf_validations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "graveyard"."golf_validations"
    ADD CONSTRAINT "golf_validations_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "public"."golf_predictions"("id") ON DELETE CASCADE;
