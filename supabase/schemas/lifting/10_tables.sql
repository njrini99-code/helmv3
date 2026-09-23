CREATE TABLE IF NOT EXISTS "public"."helm_lifting_athletes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "sport_player_id" "uuid",
    "user_id" "uuid",
    "team_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "position" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarded_at" timestamp with time zone,
    CONSTRAINT "helm_lifting_athletes_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_athletes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_availability_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "reason_category" "text",
    "note" "text",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by_coach_id" "uuid",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_availability_statuses_reason_category_check" CHECK ((("reason_category" IS NULL) OR ("reason_category" = ANY (ARRAY['soreness'::"text", 'illness'::"text", 'injury_note'::"text", 'academic'::"text", 'travel'::"text", 'coach_decision'::"text", 'other'::"text"])))),
    CONSTRAINT "helm_lifting_availability_statuses_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_availability_statuses_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'limited'::"text", 'hold'::"text", 'return_to_play'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "helm_lifting_availability_statuses_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "public"."helm_lifting_availability_statuses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_bodyweight_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "weight_lbs" numeric NOT NULL,
    "source" "text" DEFAULT 'player'::"text" NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_bodyweight_entries_source_check" CHECK (("source" = ANY (ARRAY['player'::"text", 'coach'::"text", 'import'::"text"]))),
    CONSTRAINT "helm_lifting_bodyweight_entries_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_bodyweight_entries_weight_lbs_check" CHECK ((("weight_lbs" > (0)::numeric) AND ("weight_lbs" < (700)::numeric)))
);

ALTER TABLE "public"."helm_lifting_bodyweight_entries" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_coach_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "team_name_snapshot" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "assigned_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_coach_assignments_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_coach_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_coach_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invited_by_user_id" "uuid",
    "invited_by_sport" "text" NOT NULL,
    "source_team_id" "uuid",
    "role_title" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_coach_invites_invited_by_sport_check" CHECK (("invited_by_sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_coach_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);

ALTER TABLE "public"."helm_lifting_coach_invites" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "full_name" "text",
    "title" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_coaches_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'removed'::"text"])))
);

ALTER TABLE "public"."helm_lifting_coaches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "name" "text",
    "day_type" "text" DEFAULT 'full_body'::"text" NOT NULL,
    "sport_context" "text",
    "estimated_minutes" integer,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_days_day_type_check" CHECK (("day_type" = ANY (ARRAY['lower'::"text", 'upper'::"text", 'full_body'::"text", 'recovery'::"text", 'arm_care'::"text", 'conditioning'::"text", 'testing'::"text", 'custom'::"text"])))
);

ALTER TABLE "public"."helm_lifting_days" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_exercise_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "substitute_exercise_id" "uuid" NOT NULL,
    "reason" "text",
    "created_by_coach_id" "uuid",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_exercise_substitutions_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_substitution_distinct" CHECK (("exercise_id" <> "substitute_exercise_id"))
);

ALTER TABLE "public"."helm_lifting_exercise_substitutions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "created_by_coach_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "primary_pattern" "text",
    "body_region" "text",
    "equipment" "text",
    "unilateral" boolean DEFAULT false NOT NULL,
    "sport_constraints" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sport_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "default_unit" "text" DEFAULT 'lb'::"text" NOT NULL,
    "track_load" boolean DEFAULT true NOT NULL,
    "track_reps" boolean DEFAULT true NOT NULL,
    "track_sets" boolean DEFAULT true NOT NULL,
    "track_velocity" boolean DEFAULT false NOT NULL,
    "track_distance" boolean DEFAULT false NOT NULL,
    "track_time" boolean DEFAULT false NOT NULL,
    "track_rpe" boolean DEFAULT true NOT NULL,
    "video_url" "text",
    "instructions" "text",
    "coaching_cues" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "contraindication_notes" "text",
    "is_global" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "throwing_arm_stress" "text" DEFAULT 'none'::"text" NOT NULL,
    "spine_loading" "text" DEFAULT 'none'::"text" NOT NULL,
    "lower_body_loading" "text" DEFAULT 'none'::"text" NOT NULL,
    "rotational_stress" "text" DEFAULT 'none'::"text" NOT NULL,
    "grip_stress" "text" DEFAULT 'none'::"text" NOT NULL,
    "is_pitcher_sensitive" boolean DEFAULT false NOT NULL,
    "primary_body_regions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "secondary_body_regions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stress_regions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "helm_lifting_exercises_body_region_check" CHECK ((("body_region" IS NULL) OR ("body_region" = ANY (ARRAY['lower'::"text", 'upper'::"text", 'trunk'::"text", 'arm'::"text", 'full_body'::"text"])))),
    CONSTRAINT "helm_lifting_exercises_category_check" CHECK (("category" = ANY (ARRAY['warmup'::"text", 'power'::"text", 'strength'::"text", 'accessory'::"text", 'arm_care'::"text", 'mobility'::"text", 'conditioning'::"text", 'recovery'::"text", 'test'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_default_unit_check" CHECK (("default_unit" = ANY (ARRAY['lb'::"text", 'kg'::"text", 'bodyweight'::"text", 'seconds'::"text", 'yards'::"text", 'reps'::"text", 'mph'::"text", 'watts'::"text", 'mps'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_grip_stress_check" CHECK (("grip_stress" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_lower_body_loading_check" CHECK (("lower_body_loading" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_primary_pattern_check" CHECK ((("primary_pattern" IS NULL) OR ("primary_pattern" = ANY (ARRAY['squat'::"text", 'hinge'::"text", 'push'::"text", 'pull'::"text", 'carry'::"text", 'rotate'::"text", 'anti_rotate'::"text", 'sprint'::"text", 'jump'::"text", 'throw'::"text", 'shoulder'::"text", 'elbow'::"text", 'hip'::"text", 'ankle'::"text"])))),
    CONSTRAINT "helm_lifting_exercises_rotational_stress_check" CHECK (("rotational_stress" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_scope_ck" CHECK (((("is_global" = true) AND ("organization_id" IS NOT NULL)) OR (("is_global" = false) AND ("organization_id" IS NOT NULL)))),
    CONSTRAINT "helm_lifting_exercises_spine_loading_check" CHECK (("spine_loading" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_exercises_throwing_arm_stress_check" CHECK (("throwing_arm_stress" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"])))
);

ALTER TABLE "public"."helm_lifting_exercises" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_group_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" DEFAULT 'baseball'::"text" NOT NULL,
    "team_id" "uuid",
    "group_id" "uuid",
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "target_athlete_id" "uuid",
    "before_state" "jsonb",
    "after_state" "jsonb",
    "note" "text",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."helm_lifting_group_audit" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "added_by_coach_id" "uuid",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_group_members_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'rule'::"text", 'import'::"text"])))
);

ALTER TABLE "public"."helm_lifting_group_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "group_type" "text" DEFAULT 'static'::"text" NOT NULL,
    "rule_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by_coach_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_groups_group_type_check" CHECK (("group_type" = ANY (ARRAY['static'::"text", 'dynamic'::"text", 'imported'::"text", 'temporary'::"text"]))),
    CONSTRAINT "helm_lifting_groups_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_run_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "row_number" integer NOT NULL,
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "matched_athlete_id" "uuid",
    "match_status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "validation_error" "text",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_import_rows_match_status_check" CHECK (("match_status" = ANY (ARRAY['matched'::"text", 'unmatched'::"text", 'ambiguous'::"text", 'skipped'::"text"]))),
    CONSTRAINT "helm_lifting_import_rows_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_import_rows" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_import_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "created_by_coach_id" "uuid",
    "source" "text" DEFAULT 'csv'::"text" NOT NULL,
    "import_kind" "text" DEFAULT 'lift_result'::"text" NOT NULL,
    "file_name" "text",
    "file_hash" "text",
    "mapping_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "units_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "matched_rows" integer DEFAULT 0 NOT NULL,
    "unmatched_rows" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'staged'::"text" NOT NULL,
    "source_confidence" "text" DEFAULT 'reported'::"text" NOT NULL,
    "committed_at" timestamp with time zone,
    "rolled_back_at" timestamp with time zone,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_import_runs_import_kind_check" CHECK (("import_kind" = ANY (ARRAY['lift_assignment'::"text", 'lift_result'::"text", 'testing'::"text", 'wellness'::"text", 'attendance'::"text"]))),
    CONSTRAINT "helm_lifting_import_runs_source_check" CHECK (("source" = ANY (ARRAY['teambuildr'::"text", 'trainheroic'::"text", 'bridge'::"text", 'volt'::"text", 'google_sheets'::"text", 'csv'::"text", 'manual'::"text"]))),
    CONSTRAINT "helm_lifting_import_runs_source_confidence_check" CHECK (("source_confidence" = ANY (ARRAY['verified'::"text", 'reported'::"text", 'inferred'::"text"]))),
    CONSTRAINT "helm_lifting_import_runs_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_import_runs_status_check" CHECK (("status" = ANY (ARRAY['staged'::"text", 'validated'::"text", 'committed'::"text", 'rolled_back'::"text", 'failed'::"text"])))
);

ALTER TABLE "public"."helm_lifting_import_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_maxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "max_type" "text" DEFAULT 'training_max'::"text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" DEFAULT 'lb'::"text" NOT NULL,
    "test_date" "date",
    "source" "text" DEFAULT 'coach_test'::"text" NOT NULL,
    "confidence" numeric,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_maxes_max_type_check" CHECK (("max_type" = ANY (ARRAY['estimated_1rm'::"text", 'tested_1rm'::"text", 'training_max'::"text", 'velocity_profile'::"text"]))),
    CONSTRAINT "helm_lifting_maxes_source_check" CHECK (("source" = ANY (ARRAY['coach_test'::"text", 'player_entry'::"text", 'import'::"text", 'calculated'::"text"]))),
    CONSTRAINT "helm_lifting_maxes_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_maxes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_nutrition_plan_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "assignment_type" "text" NOT NULL,
    "team_id" "uuid",
    "group_id" "uuid",
    "athlete_id" "uuid",
    "assigned_by_coach_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_nutrition_plan_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['team'::"text", 'group'::"text", 'athlete'::"text"]))),
    CONSTRAINT "helm_lifting_nutrition_plan_assignments_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_nutrition_plan_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_nutrition_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "created_by_coach_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "plan_type" "text" DEFAULT 'document'::"text" NOT NULL,
    "storage_path" "text",
    "file_name" "text",
    "file_type" "text",
    "file_size" integer,
    "external_url" "text",
    "visibility" "text" DEFAULT 'athlete_and_performance_staff'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_nutrition_plans_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['document'::"text", 'link'::"text", 'note'::"text"]))),
    CONSTRAINT "helm_lifting_nutrition_plans_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_nutrition_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "helm_lifting_nutrition_plans_visibility_check" CHECK (("visibility" = ANY (ARRAY['athlete_and_performance_staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "public"."helm_lifting_nutrition_plans" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_org_viewers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "source_team_id" "uuid",
    "granted_by" "text" DEFAULT 'invite_accept'::"text" NOT NULL,
    "can_edit" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_org_viewers_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_org_viewers" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_id" "uuid" NOT NULL,
    "exercise_id" "uuid",
    "order_index" integer DEFAULT 0 NOT NULL,
    "prescription_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "sets" integer,
    "reps" integer,
    "load_value" numeric,
    "load_unit" "text",
    "percent_1rm" numeric,
    "target_rpe" numeric,
    "target_rir" numeric,
    "target_velocity_min" numeric,
    "target_velocity_max" numeric,
    "rest_seconds" integer,
    "tempo" "text",
    "coaching_note" "text",
    "substitution_group_id" "uuid",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_prescriptions_prescription_type_check" CHECK (("prescription_type" = ANY (ARRAY['fixed'::"text", 'percent_1rm'::"text", 'rpe'::"text", 'velocity'::"text", 'coach_load'::"text", 'player_select'::"text"])))
);

ALTER TABLE "public"."helm_lifting_prescriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_program_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "program_id" "uuid" NOT NULL,
    "lift_day_id" "uuid" NOT NULL,
    "assigned_by_coach_id" "uuid",
    "assignment_type" "text" DEFAULT 'group'::"text" NOT NULL,
    "group_id" "uuid",
    "athlete_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "scheduled_start" timestamp with time zone,
    "scheduled_end" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "player_visible_at" timestamp with time zone,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_program_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['team'::"text", 'group'::"text", 'player'::"text"]))),
    CONSTRAINT "helm_lifting_program_assignments_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_program_assignments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "public"."helm_lifting_program_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "phase" "text" DEFAULT 'in_season'::"text" NOT NULL,
    "goal" "text" DEFAULT 'strength'::"text" NOT NULL,
    "created_by_coach_id" "uuid",
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_template" boolean DEFAULT false NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_programs_goal_check" CHECK (("goal" = ANY (ARRAY['strength'::"text", 'power'::"text", 'hypertrophy'::"text", 'speed'::"text", 'maintenance'::"text", 'recovery'::"text", 'arm_care'::"text", 'testing'::"text"]))),
    CONSTRAINT "helm_lifting_programs_phase_check" CHECK (("phase" = ANY (ARRAY['fall'::"text", 'winter'::"text", 'preseason'::"text", 'in_season'::"text", 'postseason'::"text", 'summer'::"text", 'return_to_play'::"text", 'testing'::"text"]))),
    CONSTRAINT "helm_lifting_programs_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"]))),
    CONSTRAINT "helm_lifting_programs_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'assigned_players'::"text"])))
);

ALTER TABLE "public"."helm_lifting_programs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_prs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "pr_type" "text" DEFAULT 'load'::"text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" DEFAULT 'lb'::"text" NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lift_session_id" "uuid",
    "verified_by_coach_id" "uuid",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_prs_pr_type_check" CHECK (("pr_type" = ANY (ARRAY['load'::"text", 'reps'::"text", 'estimated_1rm'::"text", 'velocity'::"text", 'volume'::"text"]))),
    CONSTRAINT "helm_lifting_prs_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_prs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_readiness_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "checkin_date" "date" NOT NULL,
    "sleep_quality" integer,
    "energy_level" integer,
    "soreness_overall" integer,
    "stress_level" integer,
    "lower_body_status" integer,
    "illness_flag" boolean DEFAULT false NOT NULL,
    "mood" integer,
    "notes" "text",
    "readiness_score" numeric,
    "readiness_band" "text",
    "lift_session_id" "uuid",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "soreness_status" "text",
    "submitted_from" "text",
    CONSTRAINT "helm_lifting_readiness_checkins_energy_level_check" CHECK ((("energy_level" IS NULL) OR (("energy_level" >= 1) AND ("energy_level" <= 5)))),
    CONSTRAINT "helm_lifting_readiness_checkins_lower_body_status_check" CHECK ((("lower_body_status" IS NULL) OR (("lower_body_status" >= 1) AND ("lower_body_status" <= 5)))),
    CONSTRAINT "helm_lifting_readiness_checkins_mood_check" CHECK ((("mood" IS NULL) OR (("mood" >= 1) AND ("mood" <= 5)))),
    CONSTRAINT "helm_lifting_readiness_checkins_readiness_band_check" CHECK ((("readiness_band" IS NULL) OR ("readiness_band" = ANY (ARRAY['green'::"text", 'yellow'::"text", 'orange_lower'::"text", 'orange_upper'::"text", 'red'::"text", 'blue'::"text"])))),
    CONSTRAINT "helm_lifting_readiness_checkins_sleep_quality_check" CHECK ((("sleep_quality" IS NULL) OR (("sleep_quality" >= 1) AND ("sleep_quality" <= 5)))),
    CONSTRAINT "helm_lifting_readiness_checkins_soreness_overall_check" CHECK ((("soreness_overall" IS NULL) OR (("soreness_overall" >= 0) AND ("soreness_overall" <= 10)))),
    CONSTRAINT "helm_lifting_readiness_checkins_soreness_status_check" CHECK ((("soreness_status" IS NULL) OR ("soreness_status" = ANY (ARRAY['ready_to_go'::"text", 'reported_soreness'::"text"])))),
    CONSTRAINT "helm_lifting_readiness_checkins_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_readiness_checkins_stress_level_check" CHECK ((("stress_level" IS NULL) OR (("stress_level" >= 1) AND ("stress_level" <= 5)))),
    CONSTRAINT "helm_lifting_readiness_checkins_submitted_from_check" CHECK ((("submitted_from" IS NULL) OR ("submitted_from" = ANY (ARRAY['player_today'::"text", 'lift_session'::"text", 'coach_entry'::"text"])))),
    CONSTRAINT "helm_lifting_readiness_checkins_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "public"."helm_lifting_readiness_checkins" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lift_day_id" "uuid" NOT NULL,
    "section_order" integer DEFAULT 0 NOT NULL,
    "name" "text" NOT NULL,
    "section_type" "text" DEFAULT 'main_strength'::"text" NOT NULL,
    "instructions" "text",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_sections_section_type_check" CHECK (("section_type" = ANY (ARRAY['warmup'::"text", 'movement_prep'::"text", 'power'::"text", 'main_strength'::"text", 'accessory'::"text", 'arm_care'::"text", 'mobility'::"text", 'conditioning'::"text"])))
);

ALTER TABLE "public"."helm_lifting_sections" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_session_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "prescription_id" "uuid",
    "exercise_id" "uuid",
    "exercise_name_snapshot" "text" NOT NULL,
    "section_name_snapshot" "text",
    "section_type_snapshot" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "prescribed_sets" integer,
    "prescribed_reps" integer,
    "prescribed_load" numeric,
    "prescribed_load_unit" "text",
    "prescribed_rpe" numeric,
    "modified_by_coach_id" "uuid",
    "modification_reason" "text",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_session_exercises_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'completed'::"text", 'skipped'::"text", 'substituted'::"text"])))
);

ALTER TABLE "public"."helm_lifting_session_exercises" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_assignment_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "athlete_id" "uuid" NOT NULL,
    "title" "text",
    "day_type" "text",
    "sport_context" "text",
    "scheduled_date" "date" NOT NULL,
    "estimated_minutes" integer,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "readiness_checkin_id" "uuid",
    "coach_review_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "player_note" "text",
    "coach_note" "text",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_sessions_coach_review_status_check" CHECK (("coach_review_status" = ANY (ARRAY['none'::"text", 'needs_review'::"text", 'reviewed'::"text"]))),
    CONSTRAINT "helm_lifting_sessions_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_sessions_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'started'::"text", 'completed'::"text", 'missed'::"text", 'excused'::"text", 'modified'::"text"])))
);

ALTER TABLE "public"."helm_lifting_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_set_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_exercise_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "prescribed_reps" integer,
    "actual_reps" integer,
    "prescribed_load" numeric,
    "actual_load" numeric,
    "load_unit" "text",
    "rpe" numeric,
    "rir" numeric,
    "velocity" numeric,
    "completed_at" timestamp with time zone,
    "player_note" "text",
    "coach_observed" boolean DEFAULT false NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_set_results_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_set_results" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_soreness_check_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "athlete_id" "uuid" NOT NULL,
    "due_date" "date" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "readiness_checkin_id" "uuid",
    "completed_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_soreness_check_requests_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready_to_go'::"text", 'completed'::"text", 'missed'::"text", 'excused'::"text"])))
);

ALTER TABLE "public"."helm_lifting_soreness_check_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_soreness_check_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "created_by_coach_id" "uuid",
    "title" "text" NOT NULL,
    "assignment_type" "text" NOT NULL,
    "group_id" "uuid",
    "athlete_id" "uuid",
    "frequency_type" "text" NOT NULL,
    "days_of_week" integer[],
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "due_time" time without time zone,
    "due_window_start" time without time zone,
    "due_window_end" time without time zone,
    "body_focus" "text" DEFAULT 'full_body'::"text" NOT NULL,
    "custom_regions" "text"[],
    "instructions" "text",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_soreness_check_schedules_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['team'::"text", 'group'::"text", 'athlete'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_schedules_body_focus_check" CHECK (("body_focus" = ANY (ARRAY['full_body'::"text", 'throwing_arm'::"text", 'lower_body'::"text", 'custom'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_schedules_frequency_type_check" CHECK (("frequency_type" = ANY (ARRAY['once'::"text", 'daily'::"text", 'weekly'::"text", 'custom'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_schedules_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_schedules_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_check_schedules_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "public"."helm_lifting_soreness_check_schedules" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_soreness_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checkin_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "body_region" "text" NOT NULL,
    "side" "text" DEFAULT 'both'::"text" NOT NULL,
    "severity" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_soreness_maps_severity_check" CHECK ((("severity" >= 0) AND ("severity" <= 10))),
    CONSTRAINT "helm_lifting_soreness_maps_side_check" CHECK (("side" = ANY (ARRAY['left'::"text", 'right'::"text", 'both'::"text", 'center'::"text"]))),
    CONSTRAINT "helm_lifting_soreness_maps_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"])))
);

ALTER TABLE "public"."helm_lifting_soreness_maps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "name" "text",
    "theme" "text",
    "deload" boolean DEFAULT false NOT NULL,
    "legacy_baseball_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."helm_lifting_weeks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_weight_checkin_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "athlete_id" "uuid" NOT NULL,
    "due_date" "date" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "bodyweight_entry_id" "uuid",
    "completed_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_weight_checkin_requests_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_weight_checkin_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'missed'::"text", 'excused'::"text"])))
);

ALTER TABLE "public"."helm_lifting_weight_checkin_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."helm_lifting_weight_checkin_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "team_id" "uuid",
    "created_by_coach_id" "uuid",
    "title" "text" NOT NULL,
    "assignment_type" "text" NOT NULL,
    "group_id" "uuid",
    "athlete_id" "uuid",
    "frequency_type" "text" NOT NULL,
    "days_of_week" integer[],
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "due_time" time without time zone,
    "due_window_start" time without time zone,
    "due_window_end" time without time zone,
    "instructions" "text",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "helm_lifting_weight_checkin_schedules_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['team'::"text", 'group'::"text", 'athlete'::"text"]))),
    CONSTRAINT "helm_lifting_weight_checkin_schedules_frequency_type_check" CHECK (("frequency_type" = ANY (ARRAY['once'::"text", 'daily'::"text", 'weekly'::"text", 'custom'::"text"]))),
    CONSTRAINT "helm_lifting_weight_checkin_schedules_sport_check" CHECK (("sport" = ANY (ARRAY['baseball'::"text", 'golf'::"text"]))),
    CONSTRAINT "helm_lifting_weight_checkin_schedules_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "helm_lifting_weight_checkin_schedules_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "public"."helm_lifting_weight_checkin_schedules" OWNER TO "postgres";
