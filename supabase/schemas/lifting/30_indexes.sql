CREATE INDEX "helm_lifting_athletes_org_sport_idx" ON "public"."helm_lifting_athletes" USING "btree" ("organization_id", "sport") WHERE ("is_active" = true);

CREATE INDEX "helm_lifting_athletes_sport_player_idx" ON "public"."helm_lifting_athletes" USING "btree" ("sport_player_id") WHERE ("sport_player_id" IS NOT NULL);

CREATE INDEX "helm_lifting_athletes_user_idx" ON "public"."helm_lifting_athletes" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);

CREATE INDEX "helm_lifting_availability_statuses_athlete_idx" ON "public"."helm_lifting_availability_statuses" USING "btree" ("athlete_id", "starts_at" DESC);

CREATE INDEX "helm_lifting_availability_statuses_created_by_coach_id_idx" ON "public"."helm_lifting_availability_statuses" USING "btree" ("created_by_coach_id");

CREATE UNIQUE INDEX "helm_lifting_availability_statuses_legacy_uq" ON "public"."helm_lifting_availability_statuses" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_availability_statuses_org_idx" ON "public"."helm_lifting_availability_statuses" USING "btree" ("organization_id", "sport", "starts_at" DESC);

CREATE INDEX "helm_lifting_bodyweight_entries_athlete_idx" ON "public"."helm_lifting_bodyweight_entries" USING "btree" ("athlete_id", "entry_date" DESC);

CREATE UNIQUE INDEX "helm_lifting_bodyweight_entries_legacy_uq" ON "public"."helm_lifting_bodyweight_entries" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_bodyweight_entries_organization_id_idx" ON "public"."helm_lifting_bodyweight_entries" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_coach_assignments_assigned_by_user_id_idx" ON "public"."helm_lifting_coach_assignments" USING "btree" ("assigned_by_user_id");

CREATE INDEX "helm_lifting_coach_assignments_coach_idx" ON "public"."helm_lifting_coach_assignments" USING "btree" ("coach_id") WHERE ("is_active" = true);

CREATE INDEX "helm_lifting_coach_assignments_org_idx" ON "public"."helm_lifting_coach_assignments" USING "btree" ("organization_id", "sport") WHERE ("is_active" = true);

CREATE INDEX "helm_lifting_coach_invites_email_idx" ON "public"."helm_lifting_coach_invites" USING "btree" ("lower"("email"), "status");

CREATE INDEX "helm_lifting_coach_invites_invited_by_user_id_idx" ON "public"."helm_lifting_coach_invites" USING "btree" ("invited_by_user_id");

CREATE INDEX "helm_lifting_coach_invites_org_idx" ON "public"."helm_lifting_coach_invites" USING "btree" ("organization_id", "status");

CREATE UNIQUE INDEX "helm_lifting_coach_invites_token_uq" ON "public"."helm_lifting_coach_invites" USING "btree" ("token");

CREATE INDEX "helm_lifting_coaches_org_idx" ON "public"."helm_lifting_coaches" USING "btree" ("organization_id") WHERE ("status" = 'active'::"text");

CREATE INDEX "helm_lifting_coaches_user_idx" ON "public"."helm_lifting_coaches" USING "btree" ("user_id");

CREATE UNIQUE INDEX "helm_lifting_days_legacy_uq" ON "public"."helm_lifting_days" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_days_week_idx" ON "public"."helm_lifting_days" USING "btree" ("week_id");

CREATE INDEX "helm_lifting_exercise_subs_exercise_idx" ON "public"."helm_lifting_exercise_substitutions" USING "btree" ("exercise_id");

CREATE UNIQUE INDEX "helm_lifting_exercise_subs_legacy_uq" ON "public"."helm_lifting_exercise_substitutions" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_exercise_substitutions_created_by_coach_id_idx" ON "public"."helm_lifting_exercise_substitutions" USING "btree" ("created_by_coach_id");

CREATE INDEX "helm_lifting_exercise_substitutions_organization_id_idx" ON "public"."helm_lifting_exercise_substitutions" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_exercise_substitutions_substitute_exercise_id_idx" ON "public"."helm_lifting_exercise_substitutions" USING "btree" ("substitute_exercise_id");

CREATE INDEX "helm_lifting_exercises_created_by_coach_id_idx" ON "public"."helm_lifting_exercises" USING "btree" ("created_by_coach_id");

CREATE INDEX "helm_lifting_exercises_global_idx" ON "public"."helm_lifting_exercises" USING "btree" ("is_global") WHERE ("is_global" = true);

CREATE UNIQUE INDEX "helm_lifting_exercises_legacy_uq" ON "public"."helm_lifting_exercises" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE UNIQUE INDEX "helm_lifting_exercises_org_name_uq" ON "public"."helm_lifting_exercises" USING "btree" ("organization_id", "sport", "lower"("name"));

CREATE INDEX "helm_lifting_exercises_org_sport_idx" ON "public"."helm_lifting_exercises" USING "btree" ("organization_id", "sport") WHERE ("is_active" = true);

CREATE INDEX "helm_lifting_group_audit_target_athlete_id_idx" ON "public"."helm_lifting_group_audit" USING "btree" ("target_athlete_id");

CREATE INDEX "helm_lifting_group_members_added_by_coach_id_idx" ON "public"."helm_lifting_group_members" USING "btree" ("added_by_coach_id");

CREATE INDEX "helm_lifting_group_members_athlete_idx" ON "public"."helm_lifting_group_members" USING "btree" ("athlete_id");

CREATE INDEX "helm_lifting_group_members_group_idx" ON "public"."helm_lifting_group_members" USING "btree" ("group_id");

CREATE UNIQUE INDEX "helm_lifting_group_members_legacy_uq" ON "public"."helm_lifting_group_members" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_groups_created_by_coach_id_idx" ON "public"."helm_lifting_groups" USING "btree" ("created_by_coach_id");

CREATE UNIQUE INDEX "helm_lifting_groups_legacy_uq" ON "public"."helm_lifting_groups" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_groups_org_sport_idx" ON "public"."helm_lifting_groups" USING "btree" ("organization_id", "sport") WHERE ("is_active" = true);

CREATE UNIQUE INDEX "helm_lifting_import_rows_legacy_uq" ON "public"."helm_lifting_import_rows" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_import_rows_matched_athlete_id_idx" ON "public"."helm_lifting_import_rows" USING "btree" ("matched_athlete_id");

CREATE INDEX "helm_lifting_import_rows_organization_id_idx" ON "public"."helm_lifting_import_rows" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_import_rows_run_idx" ON "public"."helm_lifting_import_rows" USING "btree" ("import_run_id");

CREATE INDEX "helm_lifting_import_runs_created_by_coach_id_idx" ON "public"."helm_lifting_import_runs" USING "btree" ("created_by_coach_id");

CREATE UNIQUE INDEX "helm_lifting_import_runs_legacy_uq" ON "public"."helm_lifting_import_runs" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_import_runs_org_idx" ON "public"."helm_lifting_import_runs" USING "btree" ("organization_id", "sport", "created_at" DESC);

CREATE INDEX "helm_lifting_maxes_athlete_idx" ON "public"."helm_lifting_maxes" USING "btree" ("athlete_id", "exercise_id", "max_type");

CREATE INDEX "helm_lifting_maxes_exercise_id_idx" ON "public"."helm_lifting_maxes" USING "btree" ("exercise_id");

CREATE UNIQUE INDEX "helm_lifting_maxes_legacy_uq" ON "public"."helm_lifting_maxes" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_maxes_organization_id_idx" ON "public"."helm_lifting_maxes" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_nutrition_plan_assignmen_assigned_by_coach_id_idx" ON "public"."helm_lifting_nutrition_plan_assignments" USING "btree" ("assigned_by_coach_id");

CREATE INDEX "helm_lifting_org_viewers_org_idx" ON "public"."helm_lifting_org_viewers" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_org_viewers_user_idx" ON "public"."helm_lifting_org_viewers" USING "btree" ("user_id");

CREATE INDEX "helm_lifting_prescriptions_exercise_id_idx" ON "public"."helm_lifting_prescriptions" USING "btree" ("exercise_id");

CREATE UNIQUE INDEX "helm_lifting_prescriptions_legacy_uq" ON "public"."helm_lifting_prescriptions" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_prescriptions_section_idx" ON "public"."helm_lifting_prescriptions" USING "btree" ("section_id", "order_index");

CREATE INDEX "helm_lifting_prescriptions_substitution_group_id_idx" ON "public"."helm_lifting_prescriptions" USING "btree" ("substitution_group_id");

CREATE INDEX "helm_lifting_program_assignments_assigned_by_coach_id_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("assigned_by_coach_id");

CREATE INDEX "helm_lifting_program_assignments_athlete_id_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("athlete_id");

CREATE INDEX "helm_lifting_program_assignments_group_id_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("group_id");

CREATE UNIQUE INDEX "helm_lifting_program_assignments_legacy_uq" ON "public"."helm_lifting_program_assignments" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_program_assignments_lift_day_id_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("lift_day_id");

CREATE INDEX "helm_lifting_program_assignments_org_date_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("organization_id", "sport", "scheduled_date");

CREATE INDEX "helm_lifting_program_assignments_program_idx" ON "public"."helm_lifting_program_assignments" USING "btree" ("program_id");

CREATE INDEX "helm_lifting_programs_created_by_coach_id_idx" ON "public"."helm_lifting_programs" USING "btree" ("created_by_coach_id");

CREATE UNIQUE INDEX "helm_lifting_programs_legacy_uq" ON "public"."helm_lifting_programs" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_programs_org_sport_idx" ON "public"."helm_lifting_programs" USING "btree" ("organization_id", "sport", "status");

CREATE INDEX "helm_lifting_prs_athlete_idx" ON "public"."helm_lifting_prs" USING "btree" ("athlete_id", "achieved_at" DESC);

CREATE INDEX "helm_lifting_prs_exercise_id_idx" ON "public"."helm_lifting_prs" USING "btree" ("exercise_id");

CREATE UNIQUE INDEX "helm_lifting_prs_legacy_uq" ON "public"."helm_lifting_prs" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_prs_lift_session_id_idx" ON "public"."helm_lifting_prs" USING "btree" ("lift_session_id");

CREATE INDEX "helm_lifting_prs_organization_id_idx" ON "public"."helm_lifting_prs" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_prs_verified_by_coach_id_idx" ON "public"."helm_lifting_prs" USING "btree" ("verified_by_coach_id");

CREATE INDEX "helm_lifting_readiness_checkins_athlete_idx" ON "public"."helm_lifting_readiness_checkins" USING "btree" ("athlete_id", "checkin_date" DESC);

CREATE UNIQUE INDEX "helm_lifting_readiness_checkins_legacy_uq" ON "public"."helm_lifting_readiness_checkins" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_readiness_checkins_org_idx" ON "public"."helm_lifting_readiness_checkins" USING "btree" ("organization_id", "sport", "checkin_date");

CREATE INDEX "helm_lifting_sections_day_idx" ON "public"."helm_lifting_sections" USING "btree" ("lift_day_id", "section_order");

CREATE UNIQUE INDEX "helm_lifting_sections_legacy_uq" ON "public"."helm_lifting_sections" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_session_exercises_exercise_idx" ON "public"."helm_lifting_session_exercises" USING "btree" ("exercise_id") WHERE ("exercise_id" IS NOT NULL);

CREATE UNIQUE INDEX "helm_lifting_session_exercises_legacy_uq" ON "public"."helm_lifting_session_exercises" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_session_exercises_modified_by_coach_id_idx" ON "public"."helm_lifting_session_exercises" USING "btree" ("modified_by_coach_id");

CREATE INDEX "helm_lifting_session_exercises_prescription_id_idx" ON "public"."helm_lifting_session_exercises" USING "btree" ("prescription_id");

CREATE INDEX "helm_lifting_session_exercises_session_idx" ON "public"."helm_lifting_session_exercises" USING "btree" ("session_id", "order_index");

CREATE INDEX "helm_lifting_sessions_athlete_idx" ON "public"."helm_lifting_sessions" USING "btree" ("athlete_id", "scheduled_date" DESC);

CREATE UNIQUE INDEX "helm_lifting_sessions_legacy_uq" ON "public"."helm_lifting_sessions" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE UNIQUE INDEX "helm_lifting_sessions_null_program_dedupe_uq" ON "public"."helm_lifting_sessions" USING "btree" ("athlete_id", "scheduled_date", "title") WHERE ("program_assignment_id" IS NULL);

CREATE INDEX "helm_lifting_sessions_org_date_idx" ON "public"."helm_lifting_sessions" USING "btree" ("organization_id", "sport", "scheduled_date");

CREATE INDEX "helm_lifting_sessions_status_idx" ON "public"."helm_lifting_sessions" USING "btree" ("organization_id", "scheduled_date", "status");

CREATE INDEX "helm_lifting_set_results_athlete_idx" ON "public"."helm_lifting_set_results" USING "btree" ("athlete_id");

CREATE UNIQUE INDEX "helm_lifting_set_results_legacy_uq" ON "public"."helm_lifting_set_results" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_set_results_organization_id_idx" ON "public"."helm_lifting_set_results" USING "btree" ("organization_id");

CREATE INDEX "helm_lifting_set_results_session_exercise_idx" ON "public"."helm_lifting_set_results" USING "btree" ("session_exercise_id");

CREATE INDEX "helm_lifting_soreness_check_schedules_created_by_coach_id_idx" ON "public"."helm_lifting_soreness_check_schedules" USING "btree" ("created_by_coach_id");

CREATE INDEX "helm_lifting_soreness_maps_athlete_idx" ON "public"."helm_lifting_soreness_maps" USING "btree" ("athlete_id");

CREATE INDEX "helm_lifting_soreness_maps_checkin_idx" ON "public"."helm_lifting_soreness_maps" USING "btree" ("checkin_id");

CREATE UNIQUE INDEX "helm_lifting_soreness_maps_legacy_uq" ON "public"."helm_lifting_soreness_maps" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_soreness_maps_organization_id_idx" ON "public"."helm_lifting_soreness_maps" USING "btree" ("organization_id");

CREATE UNIQUE INDEX "helm_lifting_weeks_legacy_uq" ON "public"."helm_lifting_weeks" USING "btree" ("legacy_baseball_id") WHERE ("legacy_baseball_id" IS NOT NULL);

CREATE INDEX "helm_lifting_weeks_program_idx" ON "public"."helm_lifting_weeks" USING "btree" ("program_id");

CREATE INDEX "helm_lifting_weight_checkin_schedules_created_by_coach_id_idx" ON "public"."helm_lifting_weight_checkin_schedules" USING "btree" ("created_by_coach_id");

CREATE INDEX "hlnp_created_by_idx" ON "public"."helm_lifting_nutrition_plans" USING "btree" ("created_by_coach_id") WHERE ("created_by_coach_id" IS NOT NULL);

CREATE INDEX "hlnp_org_sport_idx" ON "public"."helm_lifting_nutrition_plans" USING "btree" ("organization_id", "sport", "status");

CREATE INDEX "hlnpa_athlete_idx" ON "public"."helm_lifting_nutrition_plan_assignments" USING "btree" ("athlete_id") WHERE ("athlete_id" IS NOT NULL);

CREATE INDEX "hlnpa_group_idx" ON "public"."helm_lifting_nutrition_plan_assignments" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);

CREATE INDEX "hlnpa_org_sport_idx" ON "public"."helm_lifting_nutrition_plan_assignments" USING "btree" ("organization_id", "sport");

CREATE INDEX "hlnpa_plan_idx" ON "public"."helm_lifting_nutrition_plan_assignments" USING "btree" ("plan_id");

CREATE INDEX "hlscr_athlete_due_idx" ON "public"."helm_lifting_soreness_check_requests" USING "btree" ("athlete_id", "due_date" DESC);

CREATE INDEX "hlscr_org_due_idx" ON "public"."helm_lifting_soreness_check_requests" USING "btree" ("organization_id", "due_date", "status");

CREATE INDEX "hlscr_schedule_idx" ON "public"."helm_lifting_soreness_check_requests" USING "btree" ("schedule_id");

CREATE INDEX "hlscr_status_due_idx" ON "public"."helm_lifting_soreness_check_requests" USING "btree" ("status", "due_date") WHERE ("status" = ANY (ARRAY['pending'::"text", 'missed'::"text"]));

CREATE INDEX "hlscs_athlete_idx" ON "public"."helm_lifting_soreness_check_schedules" USING "btree" ("athlete_id") WHERE ("athlete_id" IS NOT NULL);

CREATE INDEX "hlscs_group_idx" ON "public"."helm_lifting_soreness_check_schedules" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);

CREATE INDEX "hlscs_org_sport_idx" ON "public"."helm_lifting_soreness_check_schedules" USING "btree" ("organization_id", "sport", "status");

CREATE INDEX "hlscs_start_date_idx" ON "public"."helm_lifting_soreness_check_schedules" USING "btree" ("start_date") WHERE ("status" = 'published'::"text");

CREATE INDEX "hlwcr_athlete_due_idx" ON "public"."helm_lifting_weight_checkin_requests" USING "btree" ("athlete_id", "due_date" DESC);

CREATE INDEX "hlwcr_bodyweight_entry_idx" ON "public"."helm_lifting_weight_checkin_requests" USING "btree" ("bodyweight_entry_id") WHERE ("bodyweight_entry_id" IS NOT NULL);

CREATE INDEX "hlwcr_org_due_idx" ON "public"."helm_lifting_weight_checkin_requests" USING "btree" ("organization_id", "due_date", "status");

CREATE INDEX "hlwcr_schedule_idx" ON "public"."helm_lifting_weight_checkin_requests" USING "btree" ("schedule_id");

CREATE INDEX "hlwcs_athlete_idx" ON "public"."helm_lifting_weight_checkin_schedules" USING "btree" ("athlete_id") WHERE ("athlete_id" IS NOT NULL);

CREATE INDEX "hlwcs_group_idx" ON "public"."helm_lifting_weight_checkin_schedules" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);

CREATE INDEX "hlwcs_org_sport_idx" ON "public"."helm_lifting_weight_checkin_schedules" USING "btree" ("organization_id", "sport", "status");

CREATE INDEX "hlwcs_start_date_idx" ON "public"."helm_lifting_weight_checkin_schedules" USING "btree" ("start_date") WHERE ("status" = 'published'::"text");

CREATE INDEX "idx_hlga_group" ON "public"."helm_lifting_group_audit" USING "btree" ("group_id", "created_at" DESC);

CREATE INDEX "idx_hlga_org" ON "public"."helm_lifting_group_audit" USING "btree" ("organization_id", "created_at" DESC);
