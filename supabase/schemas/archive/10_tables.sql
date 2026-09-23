CREATE TABLE IF NOT EXISTS "archive"."golf_events_momentic_20260731" (
    "id" "uuid",
    "team_id" "uuid",
    "created_by" "uuid",
    "title" "text",
    "description" "text",
    "event_type" "text",
    "location" "text",
    "course_id" "uuid",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "all_day" boolean,
    "recurring" boolean,
    "recurrence_rule" "text",
    "parent_event_id" "uuid",
    "status" "text",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "requires_rsvp" boolean,
    "rsvp_deadline" timestamp with time zone,
    "max_attendees" integer
);

ALTER TABLE "archive"."golf_events_momentic_20260731" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_availability_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "reason_category" "text",
    "note" "text",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_availability_statuses_reason_category_check" CHECK ((("reason_category" IS NULL) OR ("reason_category" = ANY (ARRAY['soreness'::"text", 'illness'::"text", 'injury_note'::"text", 'academic'::"text", 'travel'::"text", 'coach_decision'::"text", 'other'::"text"])))),
    CONSTRAINT "baseball_availability_statuses_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'limited'::"text", 'hold'::"text", 'return_to_play'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "baseball_availability_statuses_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "graveyard"."baseball_availability_statuses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_bodyweight_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "weight_lbs" numeric NOT NULL,
    "source" "text" DEFAULT 'player'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_bodyweight_entries_source_check" CHECK (("source" = ANY (ARRAY['player'::"text", 'coach'::"text", 'import'::"text"]))),
    CONSTRAINT "baseball_bodyweight_entries_weight_lbs_check" CHECK ((("weight_lbs" > (0)::numeric) AND ("weight_lbs" < (700)::numeric)))
);

ALTER TABLE "graveyard"."baseball_bodyweight_entries" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_import_field_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "source_id" "uuid",
    "source_field" "text" NOT NULL,
    "target_field" "text" NOT NULL,
    "transform_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "graveyard"."baseball_import_field_mappings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "group_scope" "uuid"[],
    "assigned_by_coach_id" "uuid",
    "exercise_id" "uuid",
    "title" "text",
    "due_date" "date",
    "prescription" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_signal_id" "uuid",
    "source_reason" "text",
    CONSTRAINT "baseball_lift_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text", 'archived'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "name" "text",
    "day_type" "text" DEFAULT 'full_body'::"text" NOT NULL,
    "baseball_context" "text",
    "estimated_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_days_baseball_context_check" CHECK ((("baseball_context" IS NULL) OR ("baseball_context" = ANY (ARRAY['pre_game'::"text", 'post_game'::"text", 'bullpen_day'::"text", 'starter_plus_1'::"text", 'starter_plus_2'::"text", 'travel_day'::"text", 'off_day'::"text", 'practice_day'::"text"])))),
    CONSTRAINT "baseball_lift_days_day_type_check" CHECK (("day_type" = ANY (ARRAY['lower'::"text", 'upper'::"text", 'full_body'::"text", 'recovery'::"text", 'arm_care'::"text", 'conditioning'::"text", 'testing'::"text", 'custom'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_days" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_exercise_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "substitute_exercise_id" "uuid" NOT NULL,
    "reason" "text",
    "created_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_substitution_distinct" CHECK (("exercise_id" <> "substitute_exercise_id"))
);

ALTER TABLE "graveyard"."baseball_lift_exercise_substitutions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "created_by_coach_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "primary_pattern" "text",
    "body_region" "text",
    "equipment" "text",
    "unilateral" boolean DEFAULT false NOT NULL,
    "baseball_constraints" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "baseball_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_exercises_body_region_check" CHECK ((("body_region" IS NULL) OR ("body_region" = ANY (ARRAY['lower'::"text", 'upper'::"text", 'trunk'::"text", 'arm'::"text", 'full_body'::"text"])))),
    CONSTRAINT "baseball_lift_exercises_category_check" CHECK (("category" = ANY (ARRAY['warmup'::"text", 'power'::"text", 'strength'::"text", 'accessory'::"text", 'arm_care'::"text", 'mobility'::"text", 'conditioning'::"text", 'recovery'::"text", 'test'::"text"]))),
    CONSTRAINT "baseball_lift_exercises_default_unit_check" CHECK (("default_unit" = ANY (ARRAY['lb'::"text", 'kg'::"text", 'bodyweight'::"text", 'seconds'::"text", 'yards'::"text", 'reps'::"text", 'mph'::"text", 'watts'::"text", 'mps'::"text"]))),
    CONSTRAINT "baseball_lift_exercises_primary_pattern_check" CHECK ((("primary_pattern" IS NULL) OR ("primary_pattern" = ANY (ARRAY['squat'::"text", 'hinge'::"text", 'push'::"text", 'pull'::"text", 'carry'::"text", 'rotate'::"text", 'anti_rotate'::"text", 'sprint'::"text", 'jump'::"text", 'throw'::"text", 'shoulder'::"text", 'elbow'::"text", 'hip'::"text", 'ankle'::"text"])))),
    CONSTRAINT "baseball_lift_exercises_scope_ck" CHECK ((("is_global" AND ("team_id" IS NULL)) OR ((NOT "is_global") AND ("team_id" IS NOT NULL))))
);

ALTER TABLE "graveyard"."baseball_lift_exercises" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_run_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "row_number" integer NOT NULL,
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "matched_player_id" "uuid",
    "match_status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "validation_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_import_rows_match_status_check" CHECK (("match_status" = ANY (ARRAY['matched'::"text", 'unmatched'::"text", 'ambiguous'::"text", 'skipped'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_import_rows" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_import_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_import_runs_import_kind_check" CHECK (("import_kind" = ANY (ARRAY['lift_assignment'::"text", 'lift_result'::"text", 'testing'::"text", 'wellness'::"text", 'attendance'::"text"]))),
    CONSTRAINT "baseball_lift_import_runs_source_check" CHECK (("source" = ANY (ARRAY['teambuildr'::"text", 'trainheroic'::"text", 'bridge'::"text", 'volt'::"text", 'google_sheets'::"text", 'csv'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_lift_import_runs_source_confidence_check" CHECK (("source_confidence" = ANY (ARRAY['verified'::"text", 'reported'::"text", 'inferred'::"text"]))),
    CONSTRAINT "baseball_lift_import_runs_status_check" CHECK (("status" = ANY (ARRAY['staged'::"text", 'validated'::"text", 'committed'::"text", 'rolled_back'::"text", 'failed'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_import_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_prescriptions" (
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_prescriptions_prescription_type_check" CHECK (("prescription_type" = ANY (ARRAY['fixed'::"text", 'percent_1rm'::"text", 'rpe'::"text", 'velocity'::"text", 'coach_load'::"text", 'player_select'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_prescriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_program_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "lift_day_id" "uuid" NOT NULL,
    "assigned_by_coach_id" "uuid",
    "assignment_type" "text" DEFAULT 'group'::"text" NOT NULL,
    "group_id" "uuid",
    "player_id" "uuid",
    "event_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "scheduled_start" timestamp with time zone,
    "scheduled_end" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "player_visible_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_program_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['team'::"text", 'group'::"text", 'player'::"text"]))),
    CONSTRAINT "baseball_lift_program_assignments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_program_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_programs_goal_check" CHECK (("goal" = ANY (ARRAY['strength'::"text", 'power'::"text", 'hypertrophy'::"text", 'speed'::"text", 'maintenance'::"text", 'recovery'::"text", 'arm_care'::"text", 'testing'::"text"]))),
    CONSTRAINT "baseball_lift_programs_phase_check" CHECK (("phase" = ANY (ARRAY['fall'::"text", 'winter'::"text", 'preseason'::"text", 'in_season'::"text", 'postseason'::"text", 'summer'::"text", 'return_to_play'::"text", 'testing'::"text"]))),
    CONSTRAINT "baseball_lift_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"]))),
    CONSTRAINT "baseball_lift_programs_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'assigned_players'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_programs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "assignment_id" "uuid",
    "exercise_id" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sets" integer,
    "reps" integer,
    "weight" numeric,
    "rpe" numeric,
    "notes" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "import_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_results_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'import'::"text", 'system'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_results" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lift_day_id" "uuid" NOT NULL,
    "section_order" integer DEFAULT 0 NOT NULL,
    "name" "text" NOT NULL,
    "section_type" "text" DEFAULT 'main_strength'::"text" NOT NULL,
    "instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_sections_section_type_check" CHECK (("section_type" = ANY (ARRAY['warmup'::"text", 'movement_prep'::"text", 'power'::"text", 'main_strength'::"text", 'accessory'::"text", 'arm_care'::"text", 'mobility'::"text", 'conditioning'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_sections" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_session_exercises" (
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_session_exercises_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'completed'::"text", 'skipped'::"text", 'substituted'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_session_exercises" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_assignment_id" "uuid",
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "title" "text",
    "day_type" "text",
    "baseball_context" "text",
    "scheduled_date" "date" NOT NULL,
    "estimated_minutes" integer,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "readiness_checkin_id" "uuid",
    "coach_review_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "player_note" "text",
    "coach_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_lift_sessions_coach_review_status_check" CHECK (("coach_review_status" = ANY (ARRAY['none'::"text", 'needs_review'::"text", 'reviewed'::"text"]))),
    CONSTRAINT "baseball_lift_sessions_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'started'::"text", 'completed'::"text", 'missed'::"text", 'excused'::"text", 'modified'::"text"])))
);

ALTER TABLE "graveyard"."baseball_lift_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_set_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_exercise_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "graveyard"."baseball_lift_set_results" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_lift_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "name" "text",
    "theme" "text",
    "deload" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "graveyard"."baseball_lift_weeks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_readiness_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "check_date" "date" NOT NULL,
    "sleep_hours" numeric,
    "energy_level" integer,
    "soreness_level" integer,
    "arm_status" "text",
    "mood" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stress_level" integer,
    "lower_body_status" integer,
    "illness_flag" boolean DEFAULT false NOT NULL,
    "readiness_score" numeric,
    "readiness_band" "text",
    "lift_session_id" "uuid",
    "visibility" "text" DEFAULT 'performance_staff'::"text" NOT NULL,
    CONSTRAINT "baseball_readiness_checkins_arm_status_check" CHECK ((("arm_status" IS NULL) OR ("arm_status" = ANY (ARRAY['fresh'::"text", 'normal'::"text", 'tight'::"text", 'sore'::"text", 'pain'::"text"])))),
    CONSTRAINT "baseball_readiness_checkins_energy_level_check" CHECK ((("energy_level" IS NULL) OR (("energy_level" >= 1) AND ("energy_level" <= 5)))),
    CONSTRAINT "baseball_readiness_checkins_lower_body_status_check" CHECK ((("lower_body_status" IS NULL) OR (("lower_body_status" >= 1) AND ("lower_body_status" <= 5)))),
    CONSTRAINT "baseball_readiness_checkins_readiness_band_check" CHECK ((("readiness_band" IS NULL) OR ("readiness_band" = ANY (ARRAY['green'::"text", 'yellow'::"text", 'orange_lower'::"text", 'orange_upper'::"text", 'red'::"text", 'blue'::"text"])))),
    CONSTRAINT "baseball_readiness_checkins_sleep_hours_check" CHECK ((("sleep_hours" IS NULL) OR (("sleep_hours" >= (0)::numeric) AND ("sleep_hours" <= (24)::numeric)))),
    CONSTRAINT "baseball_readiness_checkins_soreness_level_check" CHECK ((("soreness_level" IS NULL) OR (("soreness_level" >= 1) AND ("soreness_level" <= 5)))),
    CONSTRAINT "baseball_readiness_checkins_stress_level_check" CHECK ((("stress_level" IS NULL) OR (("stress_level" >= 1) AND ("stress_level" <= 5)))),
    CONSTRAINT "baseball_readiness_checkins_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff'::"text", 'performance_staff'::"text", 'head_coach_only'::"text"])))
);

ALTER TABLE "graveyard"."baseball_readiness_checkins" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_soreness_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checkin_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "body_region" "text" NOT NULL,
    "side" "text" DEFAULT 'both'::"text" NOT NULL,
    "severity" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_soreness_maps_severity_check" CHECK ((("severity" >= 0) AND ("severity" <= 10))),
    CONSTRAINT "baseball_soreness_maps_side_check" CHECK (("side" = ANY (ARRAY['left'::"text", 'right'::"text", 'both'::"text", 'center'::"text"])))
);

ALTER TABLE "graveyard"."baseball_soreness_maps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_stat_facts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "import_run_id" "uuid",
    "stat_key" "text" NOT NULL,
    "stat_value" numeric NOT NULL,
    "stat_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "period_type" "text" DEFAULT 'game'::"text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "source_trust_level" "text",
    "source_visibility" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_stat_facts_period_type_check" CHECK (("period_type" = ANY (ARRAY['pitch'::"text", 'pa'::"text", 'game'::"text", 'season'::"text", 'career'::"text", 'practice'::"text", 'scrimmage'::"text", 'custom'::"text"])))
);

ALTER TABLE "graveyard"."baseball_stat_facts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_strength_group_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "target_player_id" "uuid",
    "before_state" "jsonb",
    "after_state" "jsonb",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_strength_group_audit_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'renamed'::"text", 'archived'::"text", 'member_added'::"text", 'member_removed'::"text", 'program_assigned'::"text", 'program_removed'::"text"])))
);

ALTER TABLE "graveyard"."baseball_strength_group_audit" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_strength_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "added_by_coach_id" "uuid",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_strength_group_members_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'rule'::"text", 'import'::"text"])))
);

ALTER TABLE "graveyard"."baseball_strength_group_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_strength_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "group_type" "text" DEFAULT 'static'::"text" NOT NULL,
    "rule_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by_coach_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_strength_groups_group_type_check" CHECK (("group_type" = ANY (ARRAY['static'::"text", 'dynamic'::"text", 'imported'::"text", 'temporary'::"text"])))
);

ALTER TABLE "graveyard"."baseball_strength_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_strength_maxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "max_type" "text" DEFAULT 'training_max'::"text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" DEFAULT 'lb'::"text" NOT NULL,
    "test_date" "date",
    "source" "text" DEFAULT 'coach_test'::"text" NOT NULL,
    "confidence" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_strength_maxes_max_type_check" CHECK (("max_type" = ANY (ARRAY['estimated_1rm'::"text", 'tested_1rm'::"text", 'training_max'::"text", 'velocity_profile'::"text"]))),
    CONSTRAINT "baseball_strength_maxes_source_check" CHECK (("source" = ANY (ARRAY['coach_test'::"text", 'player_entry'::"text", 'import'::"text", 'calculated'::"text"])))
);

ALTER TABLE "graveyard"."baseball_strength_maxes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."baseball_strength_prs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "pr_type" "text" DEFAULT 'load'::"text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" DEFAULT 'lb'::"text" NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lift_session_id" "uuid",
    "verified_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_strength_prs_pr_type_check" CHECK (("pr_type" = ANY (ARRAY['load'::"text", 'reps'::"text", 'estimated_1rm'::"text", 'velocity'::"text", 'volume'::"text"])))
);

ALTER TABLE "graveyard"."baseball_strength_prs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."crm_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changed_by" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "crm_activity_log_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text", 'status_change'::"text", 'email_sent'::"text", 'contact_logged'::"text"])))
);

ALTER TABLE "graveyard"."crm_activity_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."golf_percentile_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric_name" "text" NOT NULL,
    "team_percentile" numeric(5,2),
    "platform_percentile" numeric(5,2),
    "division_percentile" numeric(5,2),
    "calculated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "graveyard"."golf_percentile_cache" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."golf_player_attendance_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_events" integer DEFAULT 0,
    "attended_events" integer DEFAULT 0,
    "excused_absences" integer DEFAULT 0,
    "unexcused_absences" integer DEFAULT 0,
    "attendance_rate" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "graveyard"."golf_player_attendance_stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."golf_player_baselines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric_name" "text" NOT NULL,
    "ewma_value" numeric(10,4),
    "rolling_mean" numeric(10,4),
    "rolling_stddev" numeric(10,4),
    "sample_size" integer DEFAULT 0,
    "decay_factor" numeric(5,4) DEFAULT 0.15,
    "last_updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "graveyard"."golf_player_baselines" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."golf_tracer_health_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapped_at" timestamp with time zone DEFAULT "now"(),
    "health_score" numeric(5,2),
    "completion_pct" numeric(5,2),
    "quality_score" numeric(5,2),
    "error_count_7d" integer DEFAULT 0,
    "players_with_stale_cache" integer DEFAULT 0,
    "avg_round_quality_score" numeric(5,2),
    "stuck_rounds" integer DEFAULT 0,
    "total_rounds_tracked" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "graveyard"."golf_tracer_health_snapshot" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "graveyard"."golf_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prediction_id" "uuid",
    "player_id" "uuid" NOT NULL,
    "stated_confidence" numeric NOT NULL,
    "actual_value" numeric,
    "predicted_value" numeric NOT NULL,
    "was_correct" boolean,
    "error_margin" numeric,
    "calibration_bucket" "text",
    "validated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "graveyard"."golf_validations" OWNER TO "postgres";
