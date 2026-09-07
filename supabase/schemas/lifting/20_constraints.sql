ALTER TABLE ONLY "public"."helm_lifting_athletes"
    ADD CONSTRAINT "helm_lifting_athletes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_availability_statuses"
    ADD CONSTRAINT "helm_lifting_availability_statuses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_bodyweight_entries"
    ADD CONSTRAINT "helm_lifting_bodyweight_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_coach_assignments"
    ADD CONSTRAINT "helm_lifting_coach_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_coach_invites"
    ADD CONSTRAINT "helm_lifting_coach_invites_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_coaches"
    ADD CONSTRAINT "helm_lifting_coaches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_days"
    ADD CONSTRAINT "helm_lifting_days_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "helm_lifting_exercise_substitutions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_exercises"
    ADD CONSTRAINT "helm_lifting_exercises_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_group_audit"
    ADD CONSTRAINT "helm_lifting_group_audit_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_group_members"
    ADD CONSTRAINT "helm_lifting_group_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_groups"
    ADD CONSTRAINT "helm_lifting_groups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_import_rows"
    ADD CONSTRAINT "helm_lifting_import_rows_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_import_runs"
    ADD CONSTRAINT "helm_lifting_import_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_maxes"
    ADD CONSTRAINT "helm_lifting_maxes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plans"
    ADD CONSTRAINT "helm_lifting_nutrition_plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_org_viewers"
    ADD CONSTRAINT "helm_lifting_org_viewers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_prescriptions"
    ADD CONSTRAINT "helm_lifting_prescriptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_programs"
    ADD CONSTRAINT "helm_lifting_programs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_readiness_checkins"
    ADD CONSTRAINT "helm_lifting_readiness_checkins_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_sections"
    ADD CONSTRAINT "helm_lifting_sections_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_session_exercises"
    ADD CONSTRAINT "helm_lifting_session_exercises_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_sessions"
    ADD CONSTRAINT "helm_lifting_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_set_results"
    ADD CONSTRAINT "helm_lifting_set_results_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_requests"
    ADD CONSTRAINT "helm_lifting_soreness_check_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_schedules"
    ADD CONSTRAINT "helm_lifting_soreness_check_schedules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_soreness_maps"
    ADD CONSTRAINT "helm_lifting_soreness_maps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_weeks"
    ADD CONSTRAINT "helm_lifting_weeks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "helm_lifting_weight_checkin_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_schedules"
    ADD CONSTRAINT "helm_lifting_weight_checkin_schedules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."helm_lifting_athletes"
    ADD CONSTRAINT "uq_helm_lifting_athlete" UNIQUE ("organization_id", "sport", "sport_player_id");

ALTER TABLE ONLY "public"."helm_lifting_bodyweight_entries"
    ADD CONSTRAINT "uq_helm_lifting_bodyweight" UNIQUE ("athlete_id", "entry_date");

ALTER TABLE ONLY "public"."helm_lifting_readiness_checkins"
    ADD CONSTRAINT "uq_helm_lifting_checkin" UNIQUE ("athlete_id", "checkin_date");

ALTER TABLE ONLY "public"."helm_lifting_coach_assignments"
    ADD CONSTRAINT "uq_helm_lifting_coach_assignment" UNIQUE ("coach_id", "sport", "team_id");

ALTER TABLE ONLY "public"."helm_lifting_coaches"
    ADD CONSTRAINT "uq_helm_lifting_coach_user_org" UNIQUE ("user_id", "organization_id");

ALTER TABLE ONLY "public"."helm_lifting_days"
    ADD CONSTRAINT "uq_helm_lifting_day" UNIQUE ("week_id", "day_number");

ALTER TABLE ONLY "public"."helm_lifting_group_members"
    ADD CONSTRAINT "uq_helm_lifting_group_member" UNIQUE ("group_id", "athlete_id");

ALTER TABLE ONLY "public"."helm_lifting_org_viewers"
    ADD CONSTRAINT "uq_helm_lifting_org_viewer" UNIQUE ("organization_id", "user_id", "sport");

ALTER TABLE ONLY "public"."helm_lifting_sessions"
    ADD CONSTRAINT "uq_helm_lifting_session" UNIQUE ("program_assignment_id", "athlete_id");

ALTER TABLE ONLY "public"."helm_lifting_set_results"
    ADD CONSTRAINT "uq_helm_lifting_set" UNIQUE ("session_exercise_id", "set_number");

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_requests"
    ADD CONSTRAINT "uq_helm_lifting_soreness_request" UNIQUE ("schedule_id", "athlete_id", "due_date");

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "uq_helm_lifting_substitution" UNIQUE ("exercise_id", "substitute_exercise_id");

ALTER TABLE ONLY "public"."helm_lifting_weeks"
    ADD CONSTRAINT "uq_helm_lifting_week" UNIQUE ("program_id", "week_number");

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "uq_helm_lifting_weight_request" UNIQUE ("schedule_id", "athlete_id", "due_date");

ALTER TABLE ONLY "public"."helm_lifting_athletes"
    ADD CONSTRAINT "helm_lifting_athletes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_athletes"
    ADD CONSTRAINT "helm_lifting_athletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_availability_statuses"
    ADD CONSTRAINT "helm_lifting_availability_statuses_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_availability_statuses"
    ADD CONSTRAINT "helm_lifting_availability_statuses_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_availability_statuses"
    ADD CONSTRAINT "helm_lifting_availability_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_bodyweight_entries"
    ADD CONSTRAINT "helm_lifting_bodyweight_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_bodyweight_entries"
    ADD CONSTRAINT "helm_lifting_bodyweight_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_coach_assignments"
    ADD CONSTRAINT "helm_lifting_coach_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_coach_assignments"
    ADD CONSTRAINT "helm_lifting_coach_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_coach_assignments"
    ADD CONSTRAINT "helm_lifting_coach_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_coach_invites"
    ADD CONSTRAINT "helm_lifting_coach_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_coach_invites"
    ADD CONSTRAINT "helm_lifting_coach_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_coaches"
    ADD CONSTRAINT "helm_lifting_coaches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_coaches"
    ADD CONSTRAINT "helm_lifting_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_days"
    ADD CONSTRAINT "helm_lifting_days_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "public"."helm_lifting_weeks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "helm_lifting_exercise_substitutions_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "helm_lifting_exercise_substitutions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "helm_lifting_exercise_substitutions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_exercise_substitutions"
    ADD CONSTRAINT "helm_lifting_exercise_substitutions_substitute_exercise_id_fkey" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_exercises"
    ADD CONSTRAINT "helm_lifting_exercises_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_exercises"
    ADD CONSTRAINT "helm_lifting_exercises_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_group_audit"
    ADD CONSTRAINT "helm_lifting_group_audit_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_group_audit"
    ADD CONSTRAINT "helm_lifting_group_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_group_audit"
    ADD CONSTRAINT "helm_lifting_group_audit_target_athlete_id_fkey" FOREIGN KEY ("target_athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_group_members"
    ADD CONSTRAINT "helm_lifting_group_members_added_by_coach_id_fkey" FOREIGN KEY ("added_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_group_members"
    ADD CONSTRAINT "helm_lifting_group_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_group_members"
    ADD CONSTRAINT "helm_lifting_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_groups"
    ADD CONSTRAINT "helm_lifting_groups_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_groups"
    ADD CONSTRAINT "helm_lifting_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_import_rows"
    ADD CONSTRAINT "helm_lifting_import_rows_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."helm_lifting_import_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_import_rows"
    ADD CONSTRAINT "helm_lifting_import_rows_matched_athlete_id_fkey" FOREIGN KEY ("matched_athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_import_rows"
    ADD CONSTRAINT "helm_lifting_import_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_import_runs"
    ADD CONSTRAINT "helm_lifting_import_runs_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_import_runs"
    ADD CONSTRAINT "helm_lifting_import_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_maxes"
    ADD CONSTRAINT "helm_lifting_maxes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_maxes"
    ADD CONSTRAINT "helm_lifting_maxes_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_maxes"
    ADD CONSTRAINT "helm_lifting_maxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignmen_assigned_by_coach_id_fkey" FOREIGN KEY ("assigned_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plan_assignments"
    ADD CONSTRAINT "helm_lifting_nutrition_plan_assignments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."helm_lifting_nutrition_plans"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plans"
    ADD CONSTRAINT "helm_lifting_nutrition_plans_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_nutrition_plans"
    ADD CONSTRAINT "helm_lifting_nutrition_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_org_viewers"
    ADD CONSTRAINT "helm_lifting_org_viewers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_org_viewers"
    ADD CONSTRAINT "helm_lifting_org_viewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prescriptions"
    ADD CONSTRAINT "helm_lifting_prescriptions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_prescriptions"
    ADD CONSTRAINT "helm_lifting_prescriptions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."helm_lifting_sections"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prescriptions"
    ADD CONSTRAINT "helm_lifting_prescriptions_substitution_group_id_fkey" FOREIGN KEY ("substitution_group_id") REFERENCES "public"."helm_lifting_exercise_substitutions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_assigned_by_coach_id_fkey" FOREIGN KEY ("assigned_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_lift_day_id_fkey" FOREIGN KEY ("lift_day_id") REFERENCES "public"."helm_lifting_days"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_program_assignments"
    ADD CONSTRAINT "helm_lifting_program_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."helm_lifting_programs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_programs"
    ADD CONSTRAINT "helm_lifting_programs_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_programs"
    ADD CONSTRAINT "helm_lifting_programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_lift_session_id_fkey" FOREIGN KEY ("lift_session_id") REFERENCES "public"."helm_lifting_sessions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_prs"
    ADD CONSTRAINT "helm_lifting_prs_verified_by_coach_id_fkey" FOREIGN KEY ("verified_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_readiness_checkins"
    ADD CONSTRAINT "helm_lifting_readiness_checkins_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_readiness_checkins"
    ADD CONSTRAINT "helm_lifting_readiness_checkins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_sections"
    ADD CONSTRAINT "helm_lifting_sections_lift_day_id_fkey" FOREIGN KEY ("lift_day_id") REFERENCES "public"."helm_lifting_days"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_session_exercises"
    ADD CONSTRAINT "helm_lifting_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."helm_lifting_exercises"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_session_exercises"
    ADD CONSTRAINT "helm_lifting_session_exercises_modified_by_coach_id_fkey" FOREIGN KEY ("modified_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_session_exercises"
    ADD CONSTRAINT "helm_lifting_session_exercises_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."helm_lifting_prescriptions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_session_exercises"
    ADD CONSTRAINT "helm_lifting_session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."helm_lifting_sessions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_sessions"
    ADD CONSTRAINT "helm_lifting_sessions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_sessions"
    ADD CONSTRAINT "helm_lifting_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_sessions"
    ADD CONSTRAINT "helm_lifting_sessions_program_assignment_id_fkey" FOREIGN KEY ("program_assignment_id") REFERENCES "public"."helm_lifting_program_assignments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_set_results"
    ADD CONSTRAINT "helm_lifting_set_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_set_results"
    ADD CONSTRAINT "helm_lifting_set_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_set_results"
    ADD CONSTRAINT "helm_lifting_set_results_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."helm_lifting_session_exercises"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_requests"
    ADD CONSTRAINT "helm_lifting_soreness_check_requests_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_requests"
    ADD CONSTRAINT "helm_lifting_soreness_check_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_requests"
    ADD CONSTRAINT "helm_lifting_soreness_check_requests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."helm_lifting_soreness_check_schedules"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_schedules"
    ADD CONSTRAINT "helm_lifting_soreness_check_schedules_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_schedules"
    ADD CONSTRAINT "helm_lifting_soreness_check_schedules_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_schedules"
    ADD CONSTRAINT "helm_lifting_soreness_check_schedules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_soreness_check_schedules"
    ADD CONSTRAINT "helm_lifting_soreness_check_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_maps"
    ADD CONSTRAINT "helm_lifting_soreness_maps_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_maps"
    ADD CONSTRAINT "helm_lifting_soreness_maps_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "public"."helm_lifting_readiness_checkins"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_soreness_maps"
    ADD CONSTRAINT "helm_lifting_soreness_maps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_weeks"
    ADD CONSTRAINT "helm_lifting_weeks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."helm_lifting_programs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "helm_lifting_weight_checkin_requests_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "helm_lifting_weight_checkin_requests_bodyweight_entry_id_fkey" FOREIGN KEY ("bodyweight_entry_id") REFERENCES "public"."helm_lifting_bodyweight_entries"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "helm_lifting_weight_checkin_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_requests"
    ADD CONSTRAINT "helm_lifting_weight_checkin_requests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."helm_lifting_weight_checkin_schedules"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_schedules"
    ADD CONSTRAINT "helm_lifting_weight_checkin_schedules_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."helm_lifting_athletes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_schedules"
    ADD CONSTRAINT "helm_lifting_weight_checkin_schedules_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."helm_lifting_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_schedules"
    ADD CONSTRAINT "helm_lifting_weight_checkin_schedules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."helm_lifting_groups"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."helm_lifting_weight_checkin_schedules"
    ADD CONSTRAINT "helm_lifting_weight_checkin_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
