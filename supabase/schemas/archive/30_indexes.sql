CREATE INDEX "baseball_availability_statuses_player_idx" ON "graveyard"."baseball_availability_statuses" USING "btree" ("player_id", "starts_at" DESC);

CREATE INDEX "baseball_availability_statuses_team_idx" ON "graveyard"."baseball_availability_statuses" USING "btree" ("team_id", "starts_at" DESC);

CREATE INDEX "baseball_bodyweight_entries_player_idx" ON "graveyard"."baseball_bodyweight_entries" USING "btree" ("player_id", "entry_date" DESC);

CREATE INDEX "baseball_import_field_mappings_team_idx" ON "graveyard"."baseball_import_field_mappings" USING "btree" ("team_id");

CREATE INDEX "baseball_lift_assignments_due_idx" ON "graveyard"."baseball_lift_assignments" USING "btree" ("team_id", "due_date");

CREATE INDEX "baseball_lift_assignments_player_idx" ON "graveyard"."baseball_lift_assignments" USING "btree" ("player_id");

CREATE INDEX "baseball_lift_assignments_source_signal_idx" ON "graveyard"."baseball_lift_assignments" USING "btree" ("source_signal_id");

CREATE INDEX "baseball_lift_assignments_team_idx" ON "graveyard"."baseball_lift_assignments" USING "btree" ("team_id");

CREATE INDEX "baseball_lift_days_week_idx" ON "graveyard"."baseball_lift_days" USING "btree" ("week_id");

CREATE INDEX "baseball_lift_exercise_subs_exercise_idx" ON "graveyard"."baseball_lift_exercise_substitutions" USING "btree" ("exercise_id");

CREATE INDEX "baseball_lift_exercises_global_idx" ON "graveyard"."baseball_lift_exercises" USING "btree" ("is_global") WHERE ("is_global" = true);

CREATE INDEX "baseball_lift_exercises_team_idx" ON "graveyard"."baseball_lift_exercises" USING "btree" ("team_id") WHERE ("is_active" = true);

CREATE UNIQUE INDEX "baseball_lift_exercises_team_name_uq" ON "graveyard"."baseball_lift_exercises" USING "btree" ("team_id", "lower"("name")) WHERE ("team_id" IS NOT NULL);

CREATE INDEX "baseball_lift_import_rows_run_idx" ON "graveyard"."baseball_lift_import_rows" USING "btree" ("import_run_id");

CREATE INDEX "baseball_lift_import_runs_team_idx" ON "graveyard"."baseball_lift_import_runs" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "baseball_lift_prescriptions_section_idx" ON "graveyard"."baseball_lift_prescriptions" USING "btree" ("section_id", "order_index");

CREATE INDEX "baseball_lift_program_assignments_event_idx" ON "graveyard"."baseball_lift_program_assignments" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);

CREATE INDEX "baseball_lift_program_assignments_team_idx" ON "graveyard"."baseball_lift_program_assignments" USING "btree" ("team_id", "scheduled_date");

CREATE INDEX "baseball_lift_programs_team_idx" ON "graveyard"."baseball_lift_programs" USING "btree" ("team_id", "status");

CREATE INDEX "baseball_lift_results_assignment_idx" ON "graveyard"."baseball_lift_results" USING "btree" ("assignment_id");

CREATE INDEX "baseball_lift_results_import_run_idx" ON "graveyard"."baseball_lift_results" USING "btree" ("import_run_id") WHERE ("import_run_id" IS NOT NULL);

CREATE INDEX "baseball_lift_results_player_idx" ON "graveyard"."baseball_lift_results" USING "btree" ("player_id");

CREATE INDEX "baseball_lift_results_team_idx" ON "graveyard"."baseball_lift_results" USING "btree" ("team_id");

CREATE INDEX "baseball_lift_sections_day_idx" ON "graveyard"."baseball_lift_sections" USING "btree" ("lift_day_id", "section_order");

CREATE INDEX "baseball_lift_session_exercises_exercise_idx" ON "graveyard"."baseball_lift_session_exercises" USING "btree" ("exercise_id") WHERE ("exercise_id" IS NOT NULL);

CREATE INDEX "baseball_lift_session_exercises_session_idx" ON "graveyard"."baseball_lift_session_exercises" USING "btree" ("session_id", "order_index");

CREATE INDEX "baseball_lift_sessions_player_idx" ON "graveyard"."baseball_lift_sessions" USING "btree" ("player_id", "scheduled_date" DESC);

CREATE INDEX "baseball_lift_sessions_status_idx" ON "graveyard"."baseball_lift_sessions" USING "btree" ("team_id", "scheduled_date", "status");

CREATE INDEX "baseball_lift_sessions_team_date_idx" ON "graveyard"."baseball_lift_sessions" USING "btree" ("team_id", "scheduled_date");

CREATE INDEX "baseball_lift_set_results_player_idx" ON "graveyard"."baseball_lift_set_results" USING "btree" ("player_id");

CREATE INDEX "baseball_lift_set_results_session_exercise_idx" ON "graveyard"."baseball_lift_set_results" USING "btree" ("session_exercise_id");

CREATE INDEX "baseball_lift_weeks_program_idx" ON "graveyard"."baseball_lift_weeks" USING "btree" ("program_id");

CREATE INDEX "baseball_readiness_checkins_player_idx" ON "graveyard"."baseball_readiness_checkins" USING "btree" ("player_id", "check_date" DESC);

CREATE INDEX "baseball_readiness_checkins_team_idx" ON "graveyard"."baseball_readiness_checkins" USING "btree" ("team_id");

CREATE INDEX "baseball_soreness_maps_checkin_idx" ON "graveyard"."baseball_soreness_maps" USING "btree" ("checkin_id");

CREATE INDEX "baseball_soreness_maps_player_idx" ON "graveyard"."baseball_soreness_maps" USING "btree" ("player_id");

CREATE INDEX "baseball_stat_facts_key_idx" ON "graveyard"."baseball_stat_facts" USING "btree" ("team_id", "player_id", "stat_key");

CREATE INDEX "baseball_stat_facts_team_player_idx" ON "graveyard"."baseball_stat_facts" USING "btree" ("team_id", "player_id");

CREATE INDEX "baseball_strength_group_audit_actor_idx" ON "graveyard"."baseball_strength_group_audit" USING "btree" ("actor_id");

CREATE INDEX "baseball_strength_group_audit_team_group_idx" ON "graveyard"."baseball_strength_group_audit" USING "btree" ("team_id", "group_id", "created_at" DESC);

CREATE INDEX "baseball_strength_group_members_group_idx" ON "graveyard"."baseball_strength_group_members" USING "btree" ("group_id");

CREATE INDEX "baseball_strength_group_members_player_idx" ON "graveyard"."baseball_strength_group_members" USING "btree" ("player_id");

CREATE INDEX "baseball_strength_groups_team_idx" ON "graveyard"."baseball_strength_groups" USING "btree" ("team_id") WHERE ("is_active" = true);

CREATE INDEX "baseball_strength_maxes_player_idx" ON "graveyard"."baseball_strength_maxes" USING "btree" ("player_id", "exercise_id", "max_type");

CREATE INDEX "baseball_strength_prs_player_idx" ON "graveyard"."baseball_strength_prs" USING "btree" ("player_id", "achieved_at" DESC);

CREATE INDEX "idx_crm_activity_log_action" ON "graveyard"."crm_activity_log" USING "btree" ("action");

CREATE INDEX "idx_crm_activity_log_created" ON "graveyard"."crm_activity_log" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_crm_activity_log_record" ON "graveyard"."crm_activity_log" USING "btree" ("record_id");

CREATE INDEX "idx_golf_player_attendance_stats_player" ON "graveyard"."golf_player_attendance_stats" USING "btree" ("player_id");

CREATE INDEX "idx_golf_player_attendance_stats_team" ON "graveyard"."golf_player_attendance_stats" USING "btree" ("team_id");

CREATE INDEX "idx_golf_validations_player_id" ON "graveyard"."golf_validations" USING "btree" ("player_id");

CREATE INDEX "idx_golf_validations_prediction_id" ON "graveyard"."golf_validations" USING "btree" ("prediction_id") WHERE ("prediction_id" IS NOT NULL);

CREATE INDEX "idx_golf_validations_stated_confidence" ON "graveyard"."golf_validations" USING "btree" ("stated_confidence", "was_correct");

CREATE INDEX "idx_percentile_cache_player" ON "graveyard"."golf_percentile_cache" USING "btree" ("player_id");

CREATE INDEX "idx_player_baselines_player" ON "graveyard"."golf_player_baselines" USING "btree" ("player_id");

CREATE INDEX "idx_tracer_health_snapped" ON "graveyard"."golf_tracer_health_snapshot" USING "btree" ("snapped_at" DESC);

CREATE UNIQUE INDEX "uq_baseball_strength_max" ON "graveyard"."baseball_strength_maxes" USING "btree" ("player_id", "exercise_id", "max_type", "test_date");
