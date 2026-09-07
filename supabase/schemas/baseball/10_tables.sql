CREATE TYPE "public"."baseball_coach_type" AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);

ALTER TYPE "public"."baseball_coach_type" OWNER TO "postgres";

CREATE TYPE "public"."baseball_note_scope" AS ENUM (
    'staff_public',
    'coach_group',
    'strength',
    'academic',
    'player_visible',
    'hidden_from_player'
);

ALTER TYPE "public"."baseball_note_scope" OWNER TO "postgres";

CREATE TYPE "public"."baseball_pipeline_stage" AS ENUM (
    'watchlist',
    'high_priority',
    'offer_extended',
    'committed',
    'uninterested'
);

ALTER TYPE "public"."baseball_pipeline_stage" OWNER TO "postgres";

CREATE TYPE "public"."baseball_player_type" AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);

ALTER TYPE "public"."baseball_player_type" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_academic_eligibility" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "semester" "text" NOT NULL,
    "gpa" numeric(4,2),
    "credits_completed" integer,
    "credits_required" integer,
    "is_eligible" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "updated_by" "uuid",
    "academic_standing" "text",
    CONSTRAINT "baseball_academic_eligibility_academic_standing_check" CHECK (("academic_standing" = ANY (ARRAY['good'::"text", 'warning'::"text", 'probation'::"text"])))
);

ALTER TABLE "public"."baseball_academic_eligibility" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "signal_id" "uuid",
    "player_id" "uuid",
    "action_type" "text" DEFAULT 'player_task'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "target_table" "text",
    "target_id" "uuid",
    "outcome_metric" "text",
    "outcome_baseline_value" numeric,
    "outcome_observed_value" numeric,
    "outcome_sample_n" integer,
    "outcome_movement" "text",
    "outcome_verdict" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "detail" "text",
    "owner_coach_id" "uuid",
    "assignee_coach_id" "uuid",
    "assignee_player_id" "uuid",
    "due_date" "date",
    "confidence" numeric,
    "visibility" "text",
    "outcome" "text",
    "outcome_recorded_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "baseball_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['player_task'::"text", 'meeting_item'::"text", 'practice_block'::"text", 'player_note'::"text", 'message'::"text", 'lift_modification'::"text", 'other'::"text"]))),
    CONSTRAINT "baseball_actions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'completed'::"text", 'dismissed'::"text", 'archived'::"text"]))),
    CONSTRAINT "baseball_actions_visibility_check" CHECK ((("visibility" IS NULL) OR ("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"]))))
);

ALTER TABLE "public"."baseball_actions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_ai_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "output_kind" "text" NOT NULL,
    "model_id" "text",
    "prompt_hash" "text",
    "output_hash" "text",
    "dedupe_key" "text",
    "input_token_count" integer,
    "output_token_count" integer,
    "latency_ms" integer,
    "cost_usd" numeric,
    "outcome" "text",
    "outcome_at" timestamp with time zone,
    "outcome_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generator" "text",
    "output_table" "text",
    "output_id" "uuid",
    "model" "text",
    "provider" "text",
    "prompt_version" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "confidence" numeric,
    "visibility" "text",
    "desired_visibility" "text",
    "disposition" "text",
    "withheld_reason" "text",
    "guardrail_redacted" boolean DEFAULT false NOT NULL,
    "guardrail_medical" boolean DEFAULT false NOT NULL,
    "guardrail_academic" boolean DEFAULT false NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_ai_audit_outcome_check" CHECK (("outcome" = ANY (ARRAY['accepted'::"text", 'modified'::"text", 'dismissed'::"text", 'error'::"text", 'pending'::"text"]))),
    CONSTRAINT "baseball_ai_audit_output_kind_check" CHECK (("output_kind" = ANY (ARRAY['insight'::"text", 'signal'::"text", 'action'::"text", 'meeting_item'::"text", 'practice_block'::"text", 'lift_assignment'::"text", 'coach_note'::"text", 'passport'::"text", 'class_conflict'::"text", 'summary'::"text", 'recommendation'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."baseball_ai_audit" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_announcement_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_announcement_acknowledgements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_announcement_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL
);

ALTER TABLE "public"."baseball_announcement_recipients" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "urgency" "text" DEFAULT 'normal'::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false,
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_announcements_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"])))
);

ALTER TABLE "public"."baseball_announcements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_baserunning_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "pa_id" "uuid",
    "event_type" "text",
    "from_base" "text",
    "to_base" "text",
    "result" "text",
    "sprint_speed" numeric,
    "reaction_time" numeric,
    "stolen_base_attempt" boolean DEFAULT false NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "runner_id" "uuid",
    "home_to_first" numeric,
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    "decision_quality" "text",
    "measured_at" timestamp with time zone,
    CONSTRAINT "baseball_baserunning_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_baserunning_events_from_base_check" CHECK ((("from_base" IS NULL) OR ("from_base" = ANY (ARRAY['1B'::"text", '2B'::"text", '3B'::"text", 'Home'::"text"])))),
    CONSTRAINT "baseball_baserunning_events_to_base_check" CHECK ((("to_base" IS NULL) OR ("to_base" = ANY (ARRAY['1B'::"text", '2B'::"text", '3B'::"text", 'Home'::"text", 'Out'::"text"]))))
);

ALTER TABLE "public"."baseball_baserunning_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_batted_ball_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "pa_id" "uuid",
    "game_id" "uuid",
    "exit_velocity" numeric,
    "launch_angle" numeric,
    "spray_angle" numeric,
    "hit_distance" numeric,
    "batted_ball_type" "text",
    "field_region" "text",
    "hit_result" "text",
    "xba" numeric,
    "xslg" numeric,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_by_run_id" "uuid",
    "superseded_at" timestamp with time zone,
    "batter_id" "uuid",
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    "distance" numeric,
    "hang_time" numeric,
    "is_hard_hit" boolean,
    "is_barrel" boolean,
    "is_sweet_spot" boolean,
    "result" "text",
    "pitch_type" "text",
    "external_event_id" "text",
    "import_run_id" "uuid",
    "source_id" "uuid",
    "trust_tier" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "measured_at" timestamp with time zone,
    CONSTRAINT "baseball_batted_ball_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_batted_ball_events_trust_tier_check" CHECK (("trust_tier" = ANY (ARRAY['official'::"text", 'verified_vendor'::"text", 'coach_reviewed'::"text", 'player_submitted'::"text", 'unverified'::"text", 'inferred'::"text"]))),
    CONSTRAINT "baseball_batted_ball_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_batted_ball_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_box_score_batting" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "ab" integer DEFAULT 0 NOT NULL,
    "r" integer DEFAULT 0 NOT NULL,
    "h" integer DEFAULT 0 NOT NULL,
    "doubles" integer DEFAULT 0 NOT NULL,
    "triples" integer DEFAULT 0 NOT NULL,
    "hr" integer DEFAULT 0 NOT NULL,
    "rbi" integer DEFAULT 0 NOT NULL,
    "bb" integer DEFAULT 0 NOT NULL,
    "k" integer DEFAULT 0 NOT NULL,
    "sb" integer DEFAULT 0 NOT NULL,
    "cs" integer DEFAULT 0 NOT NULL,
    "hbp" integer DEFAULT 0 NOT NULL,
    "sac" integer DEFAULT 0 NOT NULL,
    "sf" integer DEFAULT 0 NOT NULL,
    "lob" integer DEFAULT 0 NOT NULL,
    "batting_order" integer,
    "avg" numeric(5,3),
    "obp" numeric(5,3),
    "slg" numeric(5,3),
    "ops" numeric(5,3),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ibb" integer,
    "gidp" integer,
    "roe" integer,
    "ci" integer,
    "pickoffs" integer,
    "two_out_rbi" integer,
    "productive_outs" integer,
    "runners_advanced" integer,
    "ph_ab" integer,
    "ph_h" integer,
    "pr_app" integer,
    "def_position" "text"
);

ALTER TABLE "public"."baseball_box_score_batting" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_box_score_pitching" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "ip" numeric(4,1) DEFAULT 0 NOT NULL,
    "h" integer DEFAULT 0 NOT NULL,
    "r" integer DEFAULT 0 NOT NULL,
    "er" integer DEFAULT 0 NOT NULL,
    "bb" integer DEFAULT 0 NOT NULL,
    "k" integer DEFAULT 0 NOT NULL,
    "hr" integer DEFAULT 0 NOT NULL,
    "pitch_count" integer,
    "strikes" integer,
    "result" "text",
    "era" numeric(5,2),
    "whip" numeric(5,3),
    "k9" numeric(5,2),
    "bb9" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "gs" integer,
    "gf" integer,
    "holds" integer,
    "blown_saves" integer,
    "complete_game" boolean,
    "shutout" boolean,
    "bf" integer,
    "hbp" integer,
    "ibb" integer,
    "wp" integer,
    "balk" integer,
    "doubles_allowed" integer,
    "triples_allowed" integer,
    "first_pitch_strikes" integer,
    "inherited_runners" integer,
    "inherited_runners_scored" integer,
    CONSTRAINT "baseball_box_score_pitching_result_check" CHECK (("result" = ANY (ARRAY['W'::"text", 'L'::"text", 'S'::"text", 'H'::"text", 'BS'::"text", 'ND'::"text"])))
);

ALTER TABLE "public"."baseball_box_score_pitching" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_box_score_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "coach_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "upload_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "raw_content" "text",
    "parsed_data" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "matched_players" "jsonb" DEFAULT '[]'::"jsonb",
    "unmatched_players" "jsonb" DEFAULT '[]'::"jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_box_score_uploads_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'review_needed'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "baseball_box_score_uploads_upload_type_check" CHECK (("upload_type" = ANY (ARRAY['csv'::"text", 'pdf'::"text", 'manual'::"text"])))
);

ALTER TABLE "public"."baseball_box_score_uploads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_camp_registrations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "camp_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'registered'::"text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_camp_registrations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_camps" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "registration_deadline" "date",
    "capacity" integer,
    "price_cents" integer,
    "is_free" boolean DEFAULT false,
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_camps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_catching_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "pitch_event_id" "uuid",
    "framing_result" "text",
    "framing_value" numeric,
    "blocking_result" "text",
    "stolen_base_attempt" boolean DEFAULT false NOT NULL,
    "caught_stealing" boolean DEFAULT false NOT NULL,
    "throw_velocity" numeric,
    "pop_time_seconds" numeric,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "catcher_id" "uuid",
    "block_result" "text",
    "steal_result" "text",
    "pop_time" numeric,
    "throw_accuracy" "text",
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    "measured_at" timestamp with time zone,
    "event_type" "text",
    CONSTRAINT "baseball_catching_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_catching_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['receive'::"text", 'block'::"text", 'throwdown'::"text", 'game_call'::"text", 'mound_visit'::"text"])))
);

ALTER TABLE "public"."baseball_catching_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_class_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "class_id" "uuid",
    "class_name" "text",
    "class_day" "text",
    "class_start" time without time zone,
    "class_end" time without time zone,
    "obligation_kind" "text" DEFAULT 'event'::"text" NOT NULL,
    "event_id" "uuid",
    "game_id" "uuid",
    "practice_id" "uuid",
    "obligation_label" "text",
    "obligation_start" timestamp with time zone,
    "obligation_end" timestamp with time zone,
    "is_mandatory" boolean DEFAULT false,
    "severity" "text" DEFAULT 'informational'::"text" NOT NULL,
    "overlap_minutes" integer,
    "confidence" numeric,
    "why_it_matters" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommended_action_label" "text",
    "recommended_action_type" "text",
    "signal_id" "uuid",
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "disposition" "text" DEFAULT 'open'::"text" NOT NULL,
    "dedupe_key" "text",
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_class_conflicts_disposition_check" CHECK (("disposition" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text", 'dismissed'::"text", 'expired'::"text"]))),
    CONSTRAINT "baseball_class_conflicts_obligation_kind_check" CHECK (("obligation_kind" = ANY (ARRAY['event'::"text", 'game'::"text", 'practice'::"text", 'lift'::"text", 'travel'::"text", 'study_hall'::"text"]))),
    CONSTRAINT "baseball_class_conflicts_recommended_action_type_check" CHECK ((("recommended_action_type" IS NULL) OR ("recommended_action_type" = ANY (ARRAY['player_task'::"text", 'meeting_item'::"text", 'message'::"text", 'player_note'::"text", 'practice_block'::"text", 'none'::"text"])))),
    CONSTRAINT "baseball_class_conflicts_severity_check" CHECK (("severity" = ANY (ARRAY['hard'::"text", 'soft'::"text", 'watch'::"text", 'informational'::"text"]))),
    CONSTRAINT "baseball_class_conflicts_visibility_check" CHECK (("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"])))
);

ALTER TABLE "public"."baseball_class_conflicts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coach_insights" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "insight_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "confidence" numeric,
    "lifecycle_state" "text",
    "player_visible" boolean DEFAULT false NOT NULL,
    "generated_by" "text",
    "dedupe_key" "text",
    "last_generated_at" timestamp with time zone,
    "rank_score" numeric,
    "ranked_at" timestamp with time zone,
    "observation_count" integer DEFAULT 1 NOT NULL,
    "first_detected_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone
);

ALTER TABLE "public"."baseball_coach_insights" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "author_coach_id" "uuid",
    "scope" "public"."baseball_note_scope" DEFAULT 'staff_public'::"public"."baseball_note_scope" NOT NULL,
    "title" "text",
    "body" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."baseball_coach_notes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coach_philosophy" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "alert_sensitivity" "text" DEFAULT 'balanced'::"text",
    "decline_threshold" numeric DEFAULT 3.0,
    "pressure_gap_threshold" numeric DEFAULT 2.0,
    "bubble_zone_range" numeric DEFAULT 1.5,
    "priority_hitting" integer DEFAULT 1,
    "priority_power" integer DEFAULT 2,
    "priority_plate_discipline" integer DEFAULT 3,
    "priority_speed" integer DEFAULT 4,
    "priority_defense" integer DEFAULT 5,
    "looking_for_offense" "text",
    "looking_for_defense" "text",
    "looking_for_intangibles" "text",
    "program_values" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_coach_philosophy" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coach_player_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "source_signal_id" "uuid",
    "source_action_id" "uuid",
    "title" "text",
    "body" "text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "author_coach_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_coach_player_notes_visibility_check" CHECK (("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"])))
);

ALTER TABLE "public"."baseball_coach_player_notes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coach_recruiting_philosophy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "weight_exit_velocity" integer DEFAULT 20,
    "weight_pitch_velocity" integer DEFAULT 20,
    "weight_sixty_time" integer DEFAULT 15,
    "weight_gpa" integer DEFAULT 15,
    "weight_height" integer DEFAULT 10,
    "weight_weight" integer DEFAULT 10,
    "weight_arm_strength" integer DEFAULT 10,
    "position_priorities" "jsonb" DEFAULT '[]'::"jsonb",
    "min_gpa" numeric(3,2),
    "min_exit_velocity" integer,
    "min_pitch_velocity" integer,
    "max_sixty_time" numeric(4,2),
    "preferred_states" "jsonb" DEFAULT '[]'::"jsonb",
    "max_distance_miles" integer,
    "target_grad_years" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_coach_recruiting_philosophy" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_coaches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "coach_type" "public"."baseball_coach_type" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "title" "text",
    "bio" "text",
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_coaches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_conversation_participants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone
);

ALTER TABLE "public"."baseball_conversation_participants" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid",
    "is_team_chat" boolean DEFAULT false,
    "title" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_decision_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "meeting_item_id" "uuid",
    "signal_id" "uuid",
    "action_id" "uuid",
    "decision_kind" "text" DEFAULT 'program'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "rationale" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "participants" "uuid"[] DEFAULT '{}'::"uuid"[],
    "outcome_summary" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "detail" "text",
    CONSTRAINT "baseball_decision_log_decision_kind_check" CHECK (("decision_kind" = ANY (ARRAY['program'::"text", 'player'::"text", 'staff'::"text", 'roster'::"text", 'travel'::"text", 'scheduling'::"text", 'administrative'::"text", 'discussed'::"text", 'resolved'::"text", 'converted_task'::"text", 'converted_note'::"text", 'converted_practice'::"text", 'raised'::"text", 'reopened'::"text", 'note'::"text"])))
);

ALTER TABLE "public"."baseball_decision_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_demo_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "program" "text",
    "ip" "text",
    "user_agent" "text",
    "referrer" "text",
    "entered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "traffic_quality" "text",
    "quality_reason" "text",
    "crm_coach_id" "uuid",
    CONSTRAINT "baseball_demo_sessions_traffic_quality_check" CHECK (("traffic_quality" = ANY (ARRAY['automated'::"text", 'likely_human'::"text", 'unknown'::"text"])))
);

ALTER TABLE "public"."baseball_demo_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_developmental_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "start_date" "date",
    "end_date" "date",
    "goals" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_developmental_plans" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "version_number" integer DEFAULT 1 NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "file_name" "text",
    "file_size" integer,
    "mime_type" "text",
    "storage_path" "text",
    "change_notes" "text"
);

ALTER TABLE "public"."baseball_document_versions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "file_size" integer,
    "category" "text" DEFAULT 'general'::"text",
    "is_player_visible" boolean DEFAULT true,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version_count" integer DEFAULT 1,
    "folder" "text",
    CONSTRAINT "baseball_documents_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'playbook'::"text", 'rules'::"text", 'conditioning'::"text", 'scouting'::"text", 'academic'::"text", 'administrative'::"text", 'media'::"text"])))
);

ALTER TABLE "public"."baseball_documents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_event_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."baseball_event_acknowledgements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_event_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "check_in_at" timestamp with time zone,
    "absence_reason" "text",
    "responded_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_event_attendance_status_check" CHECK (("status" = ANY (ARRAY['going'::"text", 'maybe'::"text", 'not_going'::"text", 'pending'::"text"])))
);

ALTER TABLE "public"."baseball_event_attendance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" NOT NULL,
    "location" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "all_day" boolean DEFAULT false,
    "recurring" boolean DEFAULT false,
    "recurrence_rule" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_attendees" integer,
    "is_mandatory" boolean DEFAULT false,
    "rsvp_deadline" timestamp with time zone,
    "cancellation_reason" "text",
    "is_recurring" boolean DEFAULT false,
    "created_by_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text",
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "baseball_events_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "public"."baseball_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text",
    "description" "text",
    "is_global" boolean DEFAULT false NOT NULL,
    "created_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_exercises_scope_ck" CHECK ((("is_global" AND ("team_id" IS NULL)) OR ((NOT "is_global") AND ("team_id" IS NOT NULL))))
);

ALTER TABLE "public"."baseball_exercises" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_fielding_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "inning" integer,
    "position" "text",
    "event_type" "text",
    "result" "text",
    "error_type" "text",
    "pop_time" numeric,
    "exchange_time" numeric,
    "arm_velocity" numeric,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "chance_difficulty" "text",
    "measured_at" timestamp with time zone,
    "arm_accuracy" "text",
    "throw_velocity" numeric,
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    CONSTRAINT "baseball_fielding_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"])))
);

ALTER TABLE "public"."baseball_fielding_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "game_date" "date" NOT NULL,
    "game_type" "text" DEFAULT 'game'::"text" NOT NULL,
    "opponent_name" "text",
    "location" "text",
    "home_away" "text",
    "our_score" integer,
    "opponent_score" integer,
    "innings_played" integer DEFAULT 9,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "notes" "text",
    "weather" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_games_game_type_check" CHECK (("game_type" = ANY (ARRAY['game'::"text", 'scrimmage'::"text"]))),
    CONSTRAINT "baseball_games_home_away_check" CHECK (("home_away" = ANY (ARRAY['home'::"text", 'away'::"text", 'neutral'::"text"]))),
    CONSTRAINT "baseball_games_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'postponed'::"text"])))
);

ALTER TABLE "public"."baseball_games" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_import_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "source_id" "text" NOT NULL,
    "source_label" "text" DEFAULT ''::"text" NOT NULL,
    "import_type" "text" DEFAULT 'stats'::"text" NOT NULL,
    "file_name" "text",
    "file_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "matched_rows" integer DEFAULT 0 NOT NULL,
    "unmatched_rows" integer DEFAULT 0 NOT NULL,
    "valid_row_count" integer DEFAULT 0 NOT NULL,
    "warning_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "committed_at" timestamp with time zone,
    "rolled_back_at" timestamp with time zone,
    "review_state" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "source_config_id" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "file_hash" "text",
    "file_bytes" integer,
    CONSTRAINT "baseball_import_runs_review_state_check" CHECK (("review_state" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "baseball_import_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'parsing'::"text", 'matching'::"text", 'review'::"text", 'committed'::"text", 'rolled_back'::"text", 'failed'::"text"])))
);

ALTER TABLE "public"."baseball_import_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_import_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "source_name" "text" NOT NULL,
    "adapter_key" "text" NOT NULL,
    "trust_level" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "default_visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "required_review" boolean DEFAULT false NOT NULL,
    "dedupe_strictness" "text" DEFAULT 'strict'::"text" NOT NULL,
    "player_match_strategy" "text" DEFAULT 'name_fuzzy'::"text" NOT NULL,
    "external_id_namespace" "text",
    "config_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_import_sources_dedupe_strictness_check" CHECK (("dedupe_strictness" = ANY (ARRAY['strict'::"text", 'loose'::"text", 'off'::"text"]))),
    CONSTRAINT "baseball_import_sources_default_visibility_check" CHECK (("default_visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"]))),
    CONSTRAINT "baseball_import_sources_player_match_strategy_check" CHECK (("player_match_strategy" = ANY (ARRAY['name_exact'::"text", 'name_fuzzy'::"text", 'jersey_number'::"text", 'external_id'::"text"]))),
    CONSTRAINT "baseball_import_sources_trust_level_check" CHECK (("trust_level" = ANY (ARRAY['official'::"text", 'device_export'::"text", 'staff_entered'::"text", 'player_entered'::"text", 'ai_derived'::"text", 'unreviewed'::"text"])))
);

ALTER TABLE "public"."baseball_import_sources" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_integration_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "integration_key" "text",
    "config_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_key" "text",
    "display_name" "text",
    "integration_level" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "last_sync_status" "text",
    "created_by" "uuid",
    CONSTRAINT "baseball_integration_configs_integration_level_check" CHECK ((("integration_level" >= 1) AND ("integration_level" <= 4))),
    CONSTRAINT "baseball_integration_configs_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'configured'::"text", 'pending_pilot'::"text", 'disabled'::"text"])))
);

ALTER TABLE "public"."baseball_integration_configs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_lineup_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lineup_id" "uuid" NOT NULL,
    "batting_order" integer NOT NULL,
    "player_id" "uuid" NOT NULL,
    "position" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_lineup_positions_batting_order_check" CHECK ((("batting_order" >= 1) AND ("batting_order" <= 9)))
);

ALTER TABLE "public"."baseball_lineup_positions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_meeting_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "source_signal_id" "uuid",
    "source_action_id" "uuid",
    "player_id" "uuid",
    "title" "text" NOT NULL,
    "detail" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "owner_coach_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "discussed_at" timestamp with time zone,
    "discussed_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_meeting_items_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'discussed'::"text", 'resolved'::"text", 'archived'::"text"])))
);

ALTER TABLE "public"."baseball_meeting_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_pitch_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "pa_id" "uuid",
    "game_id" "uuid",
    "pitch_number" integer,
    "pitch_type" "text",
    "velocity" numeric,
    "spin_rate" numeric,
    "location_x" numeric,
    "location_y" numeric,
    "result" "text",
    "called_strike" boolean DEFAULT false NOT NULL,
    "swinging_strike" boolean DEFAULT false NOT NULL,
    "foul" boolean DEFAULT false NOT NULL,
    "in_play" boolean DEFAULT false NOT NULL,
    "source_trust_level" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_by_run_id" "uuid",
    "superseded_at" timestamp with time zone,
    "pitcher_id" "uuid",
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    "pitch_call" "text",
    "pitch_result" "text",
    "spin_axis" numeric,
    "spin_efficiency" numeric,
    "induced_vertical_break" numeric,
    "horizontal_break" numeric,
    "release_height" numeric,
    "release_side" numeric,
    "extension" numeric,
    "plate_height" numeric,
    "plate_side" numeric,
    "is_in_zone" boolean,
    "is_swing" boolean,
    "is_whiff" boolean,
    "batter_handedness" "text",
    "external_pitch_id" "text",
    "import_run_id" "uuid",
    "source_id" "uuid",
    "trust_tier" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "measured_at" timestamp with time zone,
    CONSTRAINT "baseball_pitch_events_batter_handedness_check" CHECK (("batter_handedness" = ANY (ARRAY['L'::"text", 'R'::"text", 'S'::"text"]))),
    CONSTRAINT "baseball_pitch_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_pitch_events_trust_tier_check" CHECK (("trust_tier" = ANY (ARRAY['official'::"text", 'verified_vendor'::"text", 'coach_reviewed'::"text", 'player_submitted'::"text", 'unverified'::"text", 'inferred'::"text"]))),
    CONSTRAINT "baseball_pitch_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_pitch_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_plate_appearances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "import_run_id" "uuid",
    "pa_number" integer,
    "inning" integer,
    "inning_half" "text",
    "result" "text",
    "rbi" integer DEFAULT 0 NOT NULL,
    "runs_scored" integer DEFAULT 0 NOT NULL,
    "men_on_base" integer DEFAULT 0 NOT NULL,
    "outs_before" integer DEFAULT 0 NOT NULL,
    "pitcher_id" "uuid",
    "source_trust_level" "text",
    "source_visibility" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_context" "text" DEFAULT 'official_game'::"text" NOT NULL,
    CONSTRAINT "baseball_plate_appearances_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_plate_appearances_inning_half_check" CHECK ((("inning_half" IS NULL) OR ("inning_half" = ANY (ARRAY['top'::"text", 'bottom'::"text"]))))
);

ALTER TABLE "public"."baseball_plate_appearances" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_aggregates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "career_avg" numeric,
    "last_5_avg" numeric,
    "last_10_avg" numeric,
    "practice_avg" numeric,
    "game_avg" numeric,
    "pressure_gap" numeric,
    "total_at_bats" integer DEFAULT 0,
    "total_hits" integer DEFAULT 0,
    "total_sessions" integer DEFAULT 0,
    "recent_trend" "text",
    "trend_data" "jsonb" DEFAULT '{}'::"jsonb",
    "last_session_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "career_obp" numeric,
    "career_slg" numeric,
    "career_ops" numeric
);

ALTER TABLE "public"."baseball_player_aggregates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "class_name" "text" NOT NULL,
    "instructor" "text",
    "days" "text"[] DEFAULT '{}'::"text"[],
    "start_time" time without time zone,
    "end_time" time without time zone,
    "building" "text",
    "room" "text",
    "credits" numeric(3,1),
    "semester" "text",
    "color" "text" DEFAULT '#16A34A'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "notes" "text"
);

ALTER TABLE "public"."baseball_player_classes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_comparisons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text",
    "player_ids" "uuid"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_player_comparisons" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_daily_contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "contract_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reflection" "text",
    "committed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "visibility" "text" DEFAULT 'player_only'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "missed_at" timestamp with time zone,
    "coach_acknowledged_at" timestamp with time zone,
    "coach_acknowledged_by" "uuid",
    CONSTRAINT "baseball_daily_contract_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'committed'::"text", 'completed'::"text", 'missed'::"text"]))),
    CONSTRAINT "baseball_daily_contract_visibility_check" CHECK (("visibility" = ANY (ARRAY['player_only'::"text", 'team'::"text", 'staff_only'::"text"])))
);

ALTER TABLE "public"."baseball_player_daily_contracts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_development_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric_key" "text" NOT NULL,
    "metric_value" numeric NOT NULL,
    "metric_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "measured_at" "date",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_player_development_metrics_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'team'::"text"])))
);

ALTER TABLE "public"."baseball_player_development_metrics" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_engagement_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "engagement_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "engagement_date" timestamp with time zone GENERATED ALWAYS AS ("created_at") STORED
);

ALTER TABLE "public"."baseball_player_engagement_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_external_ids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "source_id" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "source_display_name" "text",
    "confidence" numeric DEFAULT 1.0,
    "verified" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE "public"."baseball_player_external_ids" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_passport_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "visibility_state" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "field_visibility" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "headline" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_passport_settings_visibility_check" CHECK (("visibility_state" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'public_profile'::"text", 'scout_packet'::"text"])))
);

ALTER TABLE "public"."baseball_player_passport_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_passport_share_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "label" "text",
    "packet_kind" "text" DEFAULT 'passport'::"text" NOT NULL,
    "section_allowlist" "text"[],
    "expires_at" timestamp with time zone,
    "max_views" integer,
    "view_count" integer DEFAULT 0 NOT NULL,
    "last_viewed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_player_passport_share_tokens_packet_kind_check" CHECK (("packet_kind" = ANY (ARRAY['passport'::"text", 'scout_packet'::"text", 'recruiting_profile'::"text", 'custom'::"text"])))
);

ALTER TABLE "public"."baseball_player_passport_share_tokens" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_percentiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "grad_year" integer NOT NULL,
    "percentile_exit_velocity" integer,
    "percentile_pitch_velocity" integer,
    "percentile_sixty_time" integer,
    "percentile_gpa" integer,
    "composite_athletic" integer,
    "composite_academic" integer,
    "is_stale" boolean DEFAULT false,
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_player_percentiles_composite_academic_check" CHECK ((("composite_academic" >= 0) AND ("composite_academic" <= 100))),
    CONSTRAINT "baseball_player_percentiles_composite_athletic_check" CHECK ((("composite_athletic" >= 0) AND ("composite_athletic" <= 100))),
    CONSTRAINT "baseball_player_percentiles_percentile_exit_velocity_check" CHECK ((("percentile_exit_velocity" >= 0) AND ("percentile_exit_velocity" <= 100))),
    CONSTRAINT "baseball_player_percentiles_percentile_gpa_check" CHECK ((("percentile_gpa" >= 0) AND ("percentile_gpa" <= 100))),
    CONSTRAINT "baseball_player_percentiles_percentile_pitch_velocity_check" CHECK ((("percentile_pitch_velocity" >= 0) AND ("percentile_pitch_velocity" <= 100))),
    CONSTRAINT "baseball_player_percentiles_percentile_sixty_time_check" CHECK ((("percentile_sixty_time" >= 0) AND ("percentile_sixty_time" <= 100)))
);

ALTER TABLE "public"."baseball_player_percentiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_season_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "season_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer NOT NULL,
    "g" integer DEFAULT 0 NOT NULL,
    "ab" integer DEFAULT 0 NOT NULL,
    "r" integer DEFAULT 0 NOT NULL,
    "h" integer DEFAULT 0 NOT NULL,
    "doubles" integer DEFAULT 0 NOT NULL,
    "triples" integer DEFAULT 0 NOT NULL,
    "hr" integer DEFAULT 0 NOT NULL,
    "rbi" integer DEFAULT 0 NOT NULL,
    "bb" integer DEFAULT 0 NOT NULL,
    "k" integer DEFAULT 0 NOT NULL,
    "sb" integer DEFAULT 0 NOT NULL,
    "cs" integer DEFAULT 0 NOT NULL,
    "hbp" integer DEFAULT 0 NOT NULL,
    "sac" integer DEFAULT 0 NOT NULL,
    "sf" integer DEFAULT 0 NOT NULL,
    "avg" numeric(5,3),
    "obp" numeric(5,3),
    "slg" numeric(5,3),
    "ops" numeric(5,3),
    "g_p" integer DEFAULT 0 NOT NULL,
    "gs" integer DEFAULT 0 NOT NULL,
    "w" integer DEFAULT 0 NOT NULL,
    "l" integer DEFAULT 0 NOT NULL,
    "sv" integer DEFAULT 0 NOT NULL,
    "ip" numeric(6,1) DEFAULT 0 NOT NULL,
    "h_allowed" integer DEFAULT 0 NOT NULL,
    "r_allowed" integer DEFAULT 0 NOT NULL,
    "er" integer DEFAULT 0 NOT NULL,
    "bb_allowed" integer DEFAULT 0 NOT NULL,
    "k_thrown" integer DEFAULT 0 NOT NULL,
    "hr_allowed" integer DEFAULT 0 NOT NULL,
    "era" numeric(5,2),
    "whip" numeric(5,3),
    "k9" numeric(5,2),
    "bb9" numeric(5,2),
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "ibb" integer,
    "gidp" integer,
    "roe" integer,
    "two_out_rbi" integer,
    "lob" integer,
    "gf" integer,
    "holds" integer,
    "blown_saves" integer,
    "bf" integer,
    "p_hbp" integer,
    "wp" integer
);

ALTER TABLE "public"."baseball_player_season_stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "profile_visibility" "text" DEFAULT 'public'::"text",
    "show_academics" boolean DEFAULT true,
    "show_contact_info" boolean DEFAULT false,
    "show_dream_schools" boolean DEFAULT true,
    "email_notifications" boolean DEFAULT true,
    "push_notifications" boolean DEFAULT true,
    "notify_profile_views" boolean DEFAULT true,
    "notify_watchlist_adds" boolean DEFAULT true,
    "notify_messages" boolean DEFAULT true,
    "notify_team_activity" boolean DEFAULT true,
    "timezone" "text" DEFAULT 'America/Chicago'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_player_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "stat_type" "text" NOT NULL,
    "session_date" "date" NOT NULL,
    "session_name" "text",
    "at_bats" integer DEFAULT 0,
    "hits" integer DEFAULT 0,
    "doubles" integer DEFAULT 0,
    "triples" integer DEFAULT 0,
    "home_runs" integer DEFAULT 0,
    "rbis" integer DEFAULT 0,
    "walks" integer DEFAULT 0,
    "strikeouts" integer DEFAULT 0,
    "stolen_bases" integer DEFAULT 0,
    "innings_pitched" numeric(4,1) DEFAULT 0,
    "earned_runs" integer DEFAULT 0,
    "hits_allowed" integer DEFAULT 0,
    "walks_allowed" integer DEFAULT 0,
    "strikeouts_thrown" integer DEFAULT 0,
    "putouts" integer DEFAULT 0,
    "assists" integer DEFAULT 0,
    "errors" integer DEFAULT 0,
    "exit_velocity" numeric(5,1),
    "pitch_velocity" numeric(5,1),
    "source" "text" DEFAULT 'manual'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_trust_level" "text",
    "source_visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "source_match_confidence" numeric,
    "source_match_tier" "text",
    "source_external_id" "text",
    "import_run_id" "uuid",
    "hit_by_pitch" integer DEFAULT 0 NOT NULL,
    "sacrifice_flies" integer DEFAULT 0 NOT NULL,
    "caught_stealing" integer,
    "sacrifice_bunts" integer,
    "runs_allowed" integer,
    "pitches_thrown" integer,
    "strikes_thrown" integer,
    "launch_angle" numeric,
    "spin_rate" numeric,
    CONSTRAINT "baseball_player_stats_stat_type_check" CHECK (("stat_type" = ANY (ARRAY['practice'::"text", 'game'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."baseball_player_stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_player_timeline_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "source_type" "text",
    "source_id" "uuid",
    "confidence" numeric,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "text" DEFAULT 'team'::"text" NOT NULL,
    CONSTRAINT "baseball_player_timeline_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['team'::"text", 'staff_only'::"text", 'player_only'::"text"])))
);

ALTER TABLE "public"."baseball_player_timeline_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_players" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "player_type" "public"."baseball_player_type" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "city" "text",
    "state" "text",
    "primary_position" "text",
    "secondary_position" "text",
    "grad_year" integer,
    "bats" "text",
    "throws" "text",
    "height_feet" integer,
    "height_inches" integer,
    "weight_lbs" integer,
    "pitch_velo" numeric,
    "exit_velo" numeric,
    "sixty_time" numeric,
    "pop_time" numeric,
    "arm_strength" numeric,
    "gpa" numeric,
    "sat_score" integer,
    "act_score" integer,
    "high_school_name" "text",
    "high_school_city" "text",
    "high_school_state" "text",
    "instagram" "text",
    "twitter" "text",
    "about_me" "text",
    "has_video" boolean DEFAULT false,
    "recruiting_activated" boolean DEFAULT false,
    "recruiting_activated_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    "profile_completion_percent" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_players_college_no_recruiting" CHECK ((("player_type" <> 'college'::"public"."baseball_player_type") OR ("recruiting_activated" IS NOT TRUE))),
    CONSTRAINT "baseball_players_college_recruiting_check" CHECK ((NOT (("player_type" = 'college'::"public"."baseball_player_type") AND ("recruiting_activated" = true))))
);

ALTER TABLE "public"."baseball_players" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_postgame_review_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "item_type" "text" DEFAULT 'observation'::"text" NOT NULL,
    "body" "text",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_kind" "text",
    "signal_source" "text",
    "title" "text",
    "detail" "text",
    "action_label" "text",
    "action_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "owner_role" "text",
    "priority" "text" DEFAULT 'low'::"text" NOT NULL,
    "confidence" numeric,
    "player_visible" boolean DEFAULT false NOT NULL,
    "timeline_event_id" "uuid",
    "disposition" "text" DEFAULT 'new'::"text" NOT NULL,
    "dedupe_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_postgame_review_items_action_type_check" CHECK (("action_type" = ANY (ARRAY['task'::"text", 'note'::"text", 'practice_adjustment'::"text", 'meeting_topic'::"text", 'none'::"text"]))),
    CONSTRAINT "baseball_postgame_review_items_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "baseball_postgame_review_items_disposition_check" CHECK (("disposition" = ANY (ARRAY['new'::"text", 'converted_to_task'::"text", 'converted_to_timeline'::"text", 'dismissed'::"text", 'resolved'::"text"]))),
    CONSTRAINT "baseball_postgame_review_items_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['timeline_update'::"text", 'staff_decision'::"text", 'practice_focus'::"text", 'workload_update'::"text", 'video_evidence'::"text"]))),
    CONSTRAINT "baseball_postgame_review_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['observation'::"text", 'positive'::"text", 'improvement'::"text", 'signal_raised'::"text", 'action_created'::"text"]))),
    CONSTRAINT "baseball_postgame_review_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "baseball_postgame_review_items_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'team'::"text"])))
);

ALTER TABLE "public"."baseball_postgame_review_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_postgame_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "created_by_coach_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "overall_grade" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coach_id" "uuid",
    "source_status" "text" DEFAULT 'official'::"text" NOT NULL,
    "batting_lines_n" integer DEFAULT 0 NOT NULL,
    "pitching_lines_n" integer DEFAULT 0 NOT NULL,
    "import_warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "title" "text",
    "summary" "text",
    "confidence" numeric,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "disposition" "text" DEFAULT 'new'::"text" NOT NULL,
    "generated_by_model" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "baseball_postgame_reviews_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "baseball_postgame_reviews_disposition_check" CHECK (("disposition" = ANY (ARRAY['new'::"text", 'reviewed'::"text", 'dismissed'::"text", 'resolved'::"text"]))),
    CONSTRAINT "baseball_postgame_reviews_source_status_check" CHECK (("source_status" = ANY (ARRAY['official'::"text", 'partial'::"text", 'imported'::"text", 'manual'::"text", 'missing'::"text"]))),
    CONSTRAINT "baseball_postgame_reviews_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "baseball_postgame_reviews_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_postgame_reviews" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_practice_attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'limited'::"text", 'absent'::"text", 'excused'::"text"])))
);

ALTER TABLE "public"."baseball_practice_attendance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_block_objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "block_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "objective" "text" NOT NULL,
    "focus_area" "text",
    "player_group_ids" "uuid"[],
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."baseball_practice_block_objectives" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "start_offset_min" integer NOT NULL,
    "duration_min" integer NOT NULL,
    "activity" "text" NOT NULL,
    "location" "text",
    "coach_owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "visibility" "text" DEFAULT 'player_visible'::"text" NOT NULL,
    "target_group_ids" "uuid"[],
    "source_reason" "text",
    "source_insight_id" "uuid",
    "completion_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completion_notes" "text",
    "actual_duration_minutes" integer,
    "reps_completed" integer,
    "quality_grade" "text",
    "source_signal_id" "uuid",
    "source_postgame_item_id" "uuid",
    "description" "text",
    "station_type" "text",
    "group_label" "text",
    "equipment" "text",
    "measurement_target" "text",
    "is_measured" boolean DEFAULT false NOT NULL,
    CONSTRAINT "baseball_practice_blocks_completion_status_check" CHECK (("completion_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'skipped'::"text", 'partial'::"text"]))),
    CONSTRAINT "baseball_practice_blocks_quality_grade_check" CHECK ((("quality_grade" IS NULL) OR ("quality_grade" = ANY (ARRAY['excellent'::"text", 'good'::"text", 'fair'::"text", 'poor'::"text"])))),
    CONSTRAINT "baseball_practice_blocks_visibility_check" CHECK (("visibility" = ANY (ARRAY['player_visible'::"text", 'staff_only'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_practice_blocks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_effectiveness_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "block_id" "uuid",
    "reviewed_by_coach_id" "uuid",
    "overall_grade" "text",
    "reps_quality" integer,
    "energy_level" integer,
    "focus_level" integer,
    "objective_completion_pct" integer,
    "notes" "text",
    "signal_raised" boolean DEFAULT false NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verdict" "text",
    "objective_id" "uuid",
    "focus_area" "text",
    "metric_id" "text",
    "player_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "linked_signal_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "metric_before" numeric,
    "metric_after" numeric,
    "sample_before" integer DEFAULT 0 NOT NULL,
    "sample_after" integer DEFAULT 0 NOT NULL,
    "window_before_days" integer DEFAULT 0 NOT NULL,
    "window_after_days" integer DEFAULT 0 NOT NULL,
    "direction" "text" DEFAULT 'insufficient_sample'::"text" NOT NULL,
    "after_scope" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "confidence" numeric,
    "confidence_tier" "text" DEFAULT 'not_enough_sample'::"text" NOT NULL,
    "confounders" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "conclusion" "text",
    "recommended_next_action" "jsonb",
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "disposition" "text" DEFAULT 'new'::"text" NOT NULL,
    "generated_by" "text",
    "generated_by_model" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "dedupe_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_practice_effectiveness__objective_completion_pct_check" CHECK ((("objective_completion_pct" IS NULL) OR (("objective_completion_pct" >= 0) AND ("objective_completion_pct" <= 100)))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_after_scope_check" CHECK (("after_scope" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'mixed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_confidence_tier_check" CHECK (("confidence_tier" = ANY (ARRAY['too_early'::"text", 'not_enough_sample'::"text", 'correlated_not_proven'::"text", 'no_signal'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_direction_check" CHECK (("direction" = ANY (ARRAY['improved'::"text", 'stable'::"text", 'worse'::"text", 'insufficient_sample'::"text", 'too_early'::"text", 'not_tracked'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_disposition_check" CHECK (("disposition" = ANY (ARRAY['new'::"text", 'dismissed'::"text", 'resolved'::"text", 'converted_to_task'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_energy_level_check" CHECK ((("energy_level" IS NULL) OR (("energy_level" >= 1) AND ("energy_level" <= 5)))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_focus_level_check" CHECK ((("focus_level" IS NULL) OR (("focus_level" >= 1) AND ("focus_level" <= 5)))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_overall_grade_check" CHECK (("overall_grade" = ANY (ARRAY['excellent'::"text", 'good'::"text", 'satisfactory'::"text", 'needs_work'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_reps_quality_check" CHECK ((("reps_quality" IS NULL) OR (("reps_quality" >= 1) AND ("reps_quality" <= 5)))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_verdict_check" CHECK (("verdict" = ANY (ARRAY['worked'::"text", 'needs_more_time'::"text", 'not_enough_data'::"text"]))),
    CONSTRAINT "baseball_practice_effectiveness_reviews_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_practice_effectiveness_reviews" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_lineup_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scrimmage_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "side" "text" DEFAULT 'blue'::"text" NOT NULL,
    "batting_order" integer,
    "position" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_practice_lineup_slots_side_check" CHECK (("side" = ANY (ARRAY['blue'::"text", 'white'::"text", 'both'::"text"])))
);

ALTER TABLE "public"."baseball_practice_lineup_slots" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practice_scrimmages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "block_id" "uuid",
    "title" "text",
    "format" "text" DEFAULT 'intrasquad'::"text" NOT NULL,
    "innings_planned" integer,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "notes" "text",
    "blue_score" integer,
    "white_score" integer,
    "innings_played" integer,
    "result_note" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_practice_scrimmages_blue_score_check" CHECK ((("blue_score" IS NULL) OR ("blue_score" >= 0))),
    CONSTRAINT "baseball_practice_scrimmages_format_check" CHECK (("format" = ANY (ARRAY['intrasquad'::"text", 'live_ab'::"text", 'situational'::"text", 'bp_live'::"text", 'custom'::"text"]))),
    CONSTRAINT "baseball_practice_scrimmages_innings_played_check" CHECK ((("innings_played" IS NULL) OR ("innings_played" >= 0))),
    CONSTRAINT "baseball_practice_scrimmages_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "baseball_practice_scrimmages_white_score_check" CHECK ((("white_score" IS NULL) OR ("white_score" >= 0)))
);

ALTER TABLE "public"."baseball_practice_scrimmages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_practices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "title" "text" NOT NULL,
    "focus" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_backlog" boolean DEFAULT false NOT NULL,
    CONSTRAINT "baseball_practices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'completed'::"text"])))
);

ALTER TABLE "public"."baseball_practices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_program_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "ai_stale_after_days" integer DEFAULT 7 NOT NULL,
    "player_visible_ai_enabled" boolean DEFAULT false NOT NULL,
    "require_coach_review" boolean DEFAULT true NOT NULL,
    "announcement_tone" "text" DEFAULT 'professional'::"text" NOT NULL,
    "default_task_priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "max_roster_size" integer,
    "recruiting_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "required_document_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notification_defaults" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "quiet_hours_start" "text",
    "quiet_hours_end" "text",
    "players_require_invite" boolean DEFAULT true NOT NULL,
    "players_can_self_join" boolean DEFAULT false NOT NULL,
    "players_can_edit_profile" boolean DEFAULT false NOT NULL,
    "players_can_edit_public_profile" boolean DEFAULT false NOT NULL,
    "players_can_view_team_stats" boolean DEFAULT true NOT NULL,
    "players_can_self_log_lift" boolean DEFAULT true NOT NULL,
    "players_can_self_report_availability" boolean DEFAULT true NOT NULL,
    "players_can_upload_video" boolean DEFAULT false NOT NULL,
    "players_can_see_ai_summaries" boolean DEFAULT false NOT NULL,
    "academics_module_enabled" boolean DEFAULT true NOT NULL,
    "travel_module_enabled" boolean DEFAULT true NOT NULL,
    "performance_module_depth" "text" DEFAULT 'standard'::"text" NOT NULL,
    "recruiting_exposure_enabled" boolean DEFAULT false NOT NULL,
    "public_profiles_enabled" boolean DEFAULT false NOT NULL,
    "guardian_access_enabled" boolean DEFAULT false NOT NULL,
    "guardian_can_view_schedule" boolean DEFAULT true NOT NULL,
    "guardian_can_view_announcements" boolean DEFAULT true NOT NULL,
    "guardian_can_view_travel" boolean DEFAULT true NOT NULL,
    "scout_access_enabled" boolean DEFAULT false NOT NULL,
    "scout_packet_visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "scout_can_export" boolean DEFAULT false NOT NULL,
    "scout_show_unverified_metrics" boolean DEFAULT false NOT NULL,
    "default_visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "ai_staff_enabled" boolean DEFAULT true NOT NULL,
    "ai_player_visible_enabled" boolean DEFAULT false NOT NULL,
    "ai_require_staff_approval" boolean DEFAULT true NOT NULL,
    "ai_require_source_refs" boolean DEFAULT true NOT NULL,
    "ai_confidence_threshold" numeric DEFAULT 0.6 NOT NULL,
    "ai_medical_guardrail" boolean DEFAULT true NOT NULL,
    "ai_academic_privacy_guardrail" boolean DEFAULT true NOT NULL,
    "brand_accent" "text",
    "appearance_theme" "text" DEFAULT 'light'::"text" NOT NULL,
    "season_archive_policy" "text" DEFAULT 'keep'::"text" NOT NULL,
    "import_retention_days" integer,
    "audit_retention_days" integer DEFAULT 365 NOT NULL,
    "demo_mode_enabled" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "baseball_program_settings_ai_confidence_threshold_check" CHECK ((("ai_confidence_threshold" >= (0)::numeric) AND ("ai_confidence_threshold" <= (1)::numeric))),
    CONSTRAINT "baseball_program_settings_appearance_theme_check" CHECK (("appearance_theme" = ANY (ARRAY['light'::"text", 'dark'::"text", 'system'::"text"]))),
    CONSTRAINT "baseball_program_settings_audit_retention_days_check" CHECK (("audit_retention_days" > 0)),
    CONSTRAINT "baseball_program_settings_default_visibility_check" CHECK (("default_visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"]))),
    CONSTRAINT "baseball_program_settings_performance_module_depth_check" CHECK (("performance_module_depth" = ANY (ARRAY['lite'::"text", 'standard'::"text", 'full'::"text"]))),
    CONSTRAINT "baseball_program_settings_scout_packet_visibility_check" CHECK (("scout_packet_visibility" = ANY (ARRAY['private'::"text", 'event_only'::"text", 'public'::"text"]))),
    CONSTRAINT "baseball_program_settings_season_archive_policy_check" CHECK (("season_archive_policy" = ANY (ARRAY['keep'::"text", 'archive_after_season'::"text"])))
);

ALTER TABLE "public"."baseball_program_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_recruiting_interests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "interest_level" "text",
    "notes" "text",
    "status" "text" DEFAULT 'interested'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_recruiting_interests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "season_year" integer NOT NULL,
    "season_name" "text",
    "phase" "text" DEFAULT 'preseason'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "recruiting_enabled" boolean DEFAULT true NOT NULL,
    "lifting_enabled" boolean DEFAULT true NOT NULL,
    "public_profiles_enabled" boolean DEFAULT false NOT NULL,
    "created_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_seasons_phase_check" CHECK (("phase" = ANY (ARRAY['fall'::"text", 'winter'::"text", 'preseason'::"text", 'in_season'::"text", 'postseason'::"text", 'summer'::"text", 'offseason'::"text"]))),
    CONSTRAINT "baseball_seasons_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'planned'::"text"])))
);

ALTER TABLE "public"."baseball_seasons" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_settings_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "changed_by" "uuid",
    "setting_key" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_coach_id" "uuid",
    "event_type" "text",
    "summary" "text",
    "before_value" "jsonb",
    "after_value" "jsonb",
    CONSTRAINT "baseball_settings_audit_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['program_type_changed'::"text", 'role_changed'::"text", 'capability_changed'::"text", 'visibility_changed'::"text", 'public_profile_changed'::"text", 'guardian_access_changed'::"text", 'scout_access_changed'::"text", 'ai_settings_changed'::"text", 'import_source_changed'::"text", 'integration_changed'::"text", 'notification_settings_changed'::"text", 'data_retention_changed'::"text", 'demo_mode_changed'::"text", 'data_exported'::"text", 'settings_changed'::"text"])))
);

ALTER TABLE "public"."baseball_settings_audit_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "signal_type" "text" NOT NULL,
    "category" "text" DEFAULT 'performance'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "source_kind" "text" DEFAULT 'system'::"text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "confidence" numeric,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "disposition" "text" DEFAULT 'open'::"text" NOT NULL,
    "dedupe_key" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "why_it_matters" "text",
    "evidence" "text",
    "sample_n" integer,
    "recommended_action_label" "text",
    "recommended_action_type" "text",
    "recommended_owner_role" "text",
    "owner_coach_id" "uuid",
    "generated_by" "text",
    "feedback" "text",
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_by" "uuid",
    CONSTRAINT "baseball_signals_category_check" CHECK (("category" = ANY (ARRAY['hitting'::"text", 'pitching'::"text", 'catching'::"text", 'defense'::"text", 'baserunning'::"text", 'strength'::"text", 'readiness'::"text", 'workload'::"text", 'practice'::"text", 'academics'::"text", 'operations'::"text", 'recruiting'::"text", 'import_quality'::"text", 'video_evidence'::"text", 'roster'::"text"]))),
    CONSTRAINT "baseball_signals_disposition_check" CHECK (("disposition" = ANY (ARRAY['new'::"text", 'acknowledged'::"text", 'sample_too_small'::"text", 'converted'::"text", 'dismissed'::"text", 'resolved'::"text", 'expired'::"text"]))),
    CONSTRAINT "baseball_signals_feedback_check" CHECK ((("feedback" IS NULL) OR ("feedback" = ANY (ARRAY['useful'::"text", 'not_useful'::"text", 'wrong'::"text"])))),
    CONSTRAINT "baseball_signals_recommended_action_type_check" CHECK ((("recommended_action_type" IS NULL) OR ("recommended_action_type" = ANY (ARRAY['practice_block'::"text", 'player_task'::"text", 'video_request'::"text", 'lift_modification'::"text", 'meeting_item'::"text", 'message'::"text", 'player_note'::"text", 'import_review'::"text", 'none'::"text"])))),
    CONSTRAINT "baseball_signals_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'warning'::"text", 'info'::"text", 'positive'::"text"]))),
    CONSTRAINT "baseball_signals_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['system'::"text", 'ai'::"text", 'coach'::"text", 'import'::"text"]))),
    CONSTRAINT "baseball_signals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'dismissed'::"text", 'resolved'::"text", 'archived'::"text"]))),
    CONSTRAINT "baseball_signals_visibility_check" CHECK (("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"])))
);

ALTER TABLE "public"."baseball_signals" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_staff_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "event_type" "text" DEFAULT 'role_changed'::"text" NOT NULL,
    "actor_coach_id" "uuid",
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_staff_audit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['invited'::"text", 'accepted'::"text", 'role_changed'::"text", 'removed'::"text", 'capability_changed'::"text", 'scope_changed'::"text", 'deactivated'::"text", 'reactivated'::"text"])))
);

ALTER TABLE "public"."baseball_staff_audit_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_staff_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text",
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "invited_by" "uuid",
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(24), 'hex'::"text") NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by_user_id" "uuid",
    "invitee_name" "text",
    "message" "text",
    "invited_by_coach_id" "uuid",
    CONSTRAINT "baseball_staff_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);

ALTER TABLE "public"."baseball_staff_invitations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_stat_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text",
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "trust_level" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "external_id_namespace" "text",
    "config_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_key" "text",
    "source_name" "text" NOT NULL,
    "source_category" "text",
    "trust_tier" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "default_visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "requires_review" boolean DEFAULT true NOT NULL,
    "ai_can_use" boolean DEFAULT false NOT NULL,
    "expected_cadence_days" integer,
    "field_mapping_profile" "jsonb",
    "created_by" "uuid",
    CONSTRAINT "baseball_stat_sources_default_visibility_check" CHECK (("default_visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"]))),
    CONSTRAINT "baseball_stat_sources_source_category_check" CHECK (("source_category" = ANY (ARRAY['official_game'::"text", 'player_development'::"text", 'tracking'::"text", 'video'::"text", 'strength'::"text", 'academics'::"text", 'operations'::"text"]))),
    CONSTRAINT "baseball_stat_sources_source_key_check" CHECK (("source_key" = ANY (ARRAY['manual'::"text", 'gamechanger_xml'::"text", 'statcrew_xml'::"text", 'ncaa_live_stats'::"text", 'prestosports_xml'::"text", 'sidearm_xml'::"text", 'statbroadcast_xml'::"text", 'trackman_csv'::"text", 'rapsodo_csv'::"text", 'yakkertech_csv'::"text", 'hittrax_csv'::"text", 'pocket_radar_csv'::"text", 'blast_csv'::"text", 'diamond_kinetics_csv'::"text", 'synergy_export'::"text", 'six_four_three_export'::"text", 'awre_video'::"text", 'onform_export'::"text", 'armcare_csv'::"text", 'teambuildr_csv'::"text", 'teamworks_csv'::"text", 'google_sheets'::"text", 'generic_csv'::"text", 'generic_xlsx'::"text", 'pdf_extract'::"text"]))),
    CONSTRAINT "baseball_stat_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'device'::"text", 'api'::"text", 'import'::"text", 'official'::"text", 'partner'::"text"]))),
    CONSTRAINT "baseball_stat_sources_trust_level_check" CHECK (("trust_level" = ANY (ARRAY['official'::"text", 'device_export'::"text", 'staff_entered'::"text", 'player_entered'::"text", 'ai_derived'::"text", 'unreviewed'::"text"]))),
    CONSTRAINT "baseball_stat_sources_trust_tier_check" CHECK (("trust_tier" = ANY (ARRAY['official'::"text", 'verified_vendor'::"text", 'coach_reviewed'::"text", 'player_submitted'::"text", 'unverified'::"text", 'inferred'::"text"])))
);

ALTER TABLE "public"."baseball_stat_sources" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_stat_uploads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "file_url" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "row_count" integer,
    "processed_count" integer DEFAULT 0,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "stat_type" "text",
    "session_date" "date",
    "session_name" "text",
    "total_rows" integer DEFAULT 0,
    "matched_rows" integer DEFAULT 0,
    "unmatched_rows" integer DEFAULT 0,
    "unmatched_data" "jsonb" DEFAULT '[]'::"jsonb",
    "import_run_id" "uuid",
    "source_id" "text",
    "mapping_config" "jsonb",
    "match_confidence" numeric,
    CONSTRAINT "baseball_stat_uploads_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'needs_review'::"text"])))
);

ALTER TABLE "public"."baseball_stat_uploads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_stat_visual_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "created_by_coach_id" "uuid",
    "view_name" "text" NOT NULL,
    "view_type" "text" DEFAULT 'chart'::"text" NOT NULL,
    "config_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stat_keys" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "period_type" "text" DEFAULT 'season'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "is_template" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_stat_visual_views_period_type_check" CHECK (("period_type" = ANY (ARRAY['game'::"text", 'season'::"text", 'career'::"text", 'custom'::"text", 'rolling'::"text"]))),
    CONSTRAINT "baseball_stat_visual_views_view_type_check" CHECK (("view_type" = ANY (ARRAY['chart'::"text", 'table'::"text", 'heatmap'::"text", 'spray_chart'::"text", 'zone_map'::"text", 'trend'::"text", 'comparison'::"text", 'custom'::"text"]))),
    CONSTRAINT "baseball_stat_visual_views_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'team'::"text"])))
);

ALTER TABLE "public"."baseball_stat_visual_views" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_swing_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "pa_id" "uuid",
    "pitch_event_id" "uuid",
    "bat_speed" numeric,
    "attack_angle" numeric,
    "contact_rate" numeric,
    "chase_swing" boolean DEFAULT false NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_by_run_id" "uuid",
    "superseded_at" timestamp with time zone,
    "game_id" "uuid",
    "data_context" "text" DEFAULT 'sensor'::"text" NOT NULL,
    "vertical_bat_angle" numeric,
    "on_plane_efficiency" numeric,
    "time_to_contact" numeric,
    "rotational_acceleration" numeric,
    "connection_score" numeric,
    "early_connection" numeric,
    "connection_at_impact" numeric,
    "peak_hand_speed" numeric,
    "power_score" numeric,
    "max_barrel_speed" numeric,
    "max_acceleration" numeric,
    "impact_momentum" numeric,
    "contact_point" "text",
    "external_swing_id" "text",
    "import_run_id" "uuid",
    "source_id" "uuid",
    "trust_tier" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "measured_at" timestamp with time zone,
    CONSTRAINT "baseball_swing_events_data_context_check" CHECK (("data_context" = ANY (ARRAY['official_game'::"text", 'scrimmage'::"text", 'practice'::"text", 'bullpen'::"text", 'cage'::"text", 'showcase'::"text", 'sensor'::"text", 'video'::"text", 'lift'::"text", 'readiness'::"text", 'manual'::"text"]))),
    CONSTRAINT "baseball_swing_events_trust_tier_check" CHECK (("trust_tier" <> 'official'::"text")),
    CONSTRAINT "baseball_swing_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))
);

ALTER TABLE "public"."baseball_swing_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_task_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "notes" "text",
    CONSTRAINT "baseball_task_assignments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"])))
);

ALTER TABLE "public"."baseball_task_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'general'::"text",
    "created_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_task_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "priority" "text" DEFAULT 'normal'::"text",
    "reminder_at" timestamp with time zone,
    "is_recurring" boolean DEFAULT false,
    "recurrence_rule" "text",
    "created_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "reminder_sent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "baseball_tasks_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'conditioning'::"text", 'academic'::"text", 'administrative'::"text", 'practice'::"text", 'game_prep'::"text"]))),
    CONSTRAINT "baseball_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"]))),
    CONSTRAINT "baseball_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'overdue'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "public"."baseball_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_team_coach_staff" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'head_coach'::"text",
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "can_manage_roster" boolean DEFAULT false NOT NULL,
    "can_manage_practice" boolean DEFAULT false NOT NULL,
    "can_manage_lifting" boolean DEFAULT false NOT NULL,
    "can_view_academics" boolean DEFAULT false NOT NULL,
    "can_manage_imports" boolean DEFAULT false NOT NULL,
    "can_manage_stats" boolean DEFAULT false NOT NULL,
    "can_invite_staff" boolean DEFAULT false NOT NULL,
    "can_manage_settings" boolean DEFAULT false NOT NULL,
    "can_view_medical" boolean DEFAULT false NOT NULL,
    "can_message_team" boolean DEFAULT false NOT NULL,
    "can_manage_calendar" boolean DEFAULT false NOT NULL,
    "is_head_coach" boolean DEFAULT false NOT NULL,
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "title" "text",
    "scope_player_ids" "uuid"[],
    "scope_group_ids" "uuid"[],
    "bio" "text",
    "phone" "text",
    "visible_to_players" boolean DEFAULT true NOT NULL,
    "can_manage_documents" boolean DEFAULT false NOT NULL,
    "can_manage_lineups" boolean DEFAULT false NOT NULL,
    "can_view_readiness" boolean DEFAULT false NOT NULL,
    "can_modify_availability" boolean DEFAULT false NOT NULL,
    "can_view_private_notes" boolean DEFAULT false NOT NULL,
    "can_message_players" boolean DEFAULT false NOT NULL,
    "can_export_reports" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."baseball_team_coach_staff" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_team_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "code" character varying(8) NOT NULL,
    "created_by_coach_id" "uuid" NOT NULL,
    "max_uses" integer,
    "used_count" integer DEFAULT 0,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_team_invitations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_team_lineups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "created_by_coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_team_lineups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "public"."team_member_status" DEFAULT 'pending'::"public"."team_member_status",
    "jersey_number" integer,
    "position" "text",
    "joined_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_team_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "team_type" "public"."baseball_coach_type" NOT NULL,
    "join_code" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "season_year" integer,
    "season_start_date" "date",
    "season_end_date" "date",
    "website_url" "text",
    "conference" "text",
    "division" "text",
    "public_profile_mode" "text" DEFAULT 'unlisted'::"text" NOT NULL,
    "player_account_policy" "text" DEFAULT 'invite_only'::"text" NOT NULL,
    "default_team_id" "uuid",
    "invite_policy" "text" DEFAULT 'invite_only'::"text" NOT NULL,
    "allow_player_self_join" boolean DEFAULT false NOT NULL,
    "require_coach_approval" boolean DEFAULT true NOT NULL,
    "program_type" "text" DEFAULT 'college'::"text" NOT NULL,
    "competition_level" "text",
    "region_state" "text",
    "season_label" "text",
    CONSTRAINT "baseball_teams_invite_policy_check" CHECK (("invite_policy" = ANY (ARRAY['invite_only'::"text", 'open'::"text", 'approval_required'::"text"]))),
    CONSTRAINT "baseball_teams_player_account_policy_check" CHECK (("player_account_policy" = ANY (ARRAY['invite_only'::"text", 'open'::"text", 'approval_required'::"text"]))),
    CONSTRAINT "baseball_teams_program_type_check" CHECK (("program_type" = ANY (ARRAY['college'::"text", 'high_school'::"text", 'showcase'::"text", 'juco'::"text", 'academy'::"text", 'club'::"text"]))),
    CONSTRAINT "baseball_teams_public_profile_mode_check" CHECK (("public_profile_mode" = ANY (ARRAY['unlisted'::"text", 'recruiting'::"text", 'alumni'::"text", 'private'::"text"])))
);

ALTER TABLE "public"."baseball_teams" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_timeline_event_acks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "timeline_event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "acked_by" "uuid" NOT NULL,
    "acked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reaction" "text",
    "note" "text",
    CONSTRAINT "baseball_timeline_event_acks_reaction_check" CHECK (("reaction" = ANY (ARRAY['seen'::"text", 'acknowledged'::"text", 'flagged'::"text", 'disputed'::"text"])))
);

ALTER TABLE "public"."baseball_timeline_event_acks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_travel_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "itinerary_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "description" "text",
    "paid_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "expense_date" "date",
    "vendor_name" "text",
    "notes" "text",
    "receipt_url" "text",
    "created_by" "uuid",
    CONSTRAINT "baseball_travel_expenses_category_check" CHECK (("category" = ANY (ARRAY['transport'::"text", 'lodging'::"text", 'meals'::"text", 'equipment'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."baseball_travel_expenses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_travel_itineraries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_name" "text" NOT NULL,
    "departure_date" "date",
    "return_date" "date",
    "location" "text",
    "accommodation" "text",
    "transportation" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_travel_itineraries" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_video_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "plate_appearance_id" "uuid",
    "pitch_event_id" "uuid",
    "video_url" "text" NOT NULL,
    "video_type" "text" DEFAULT 'game'::"text" NOT NULL,
    "frame_start" integer,
    "frame_end" integer,
    "timestamp_start" numeric,
    "timestamp_end" numeric,
    "notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "visibility" "text" DEFAULT 'staff_only'::"text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_vendor" "text",
    "source_label" "text",
    "source_external_id" "text",
    "source_confidence" numeric,
    "owner_kind" "text",
    "owner_coach_id" "uuid",
    "owner_player_id" "uuid",
    "players_tagged" "uuid"[] DEFAULT '{}'::"uuid"[],
    "clip_title" "text",
    "thumbnail_url" "text",
    "duration_seconds" numeric,
    "captured_at" timestamp with time zone,
    "transcript" "text",
    "annotation_author_id" "uuid",
    "linked_dev_plan_item_id" "uuid",
    "linked_meeting_item_id" "uuid",
    "linked_signal_id" "uuid",
    "linked_action_id" "uuid",
    "review_status" "text" DEFAULT 'needs_review'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "player_requested_feedback" boolean DEFAULT false,
    "reviewed_by_player_at" timestamp with time zone,
    "disposition" "text" DEFAULT 'active'::"text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "baseball_video_events_disposition_check" CHECK ((("disposition" IS NULL) OR ("disposition" = ANY (ARRAY['requested'::"text", 'active'::"text", 'dismissed'::"text", 'resolved'::"text"])))),
    CONSTRAINT "baseball_video_events_owner_kind_check" CHECK ((("owner_kind" IS NULL) OR ("owner_kind" = ANY (ARRAY['team'::"text", 'staff'::"text", 'player'::"text"])))),
    CONSTRAINT "baseball_video_events_review_status_check" CHECK ((("review_status" IS NULL) OR ("review_status" = ANY (ARRAY['needs_review'::"text", 'reviewed'::"text", 'approved'::"text", 'archived'::"text"])))),
    CONSTRAINT "baseball_video_events_source_vendor_check" CHECK ((("source_vendor" IS NULL) OR ("source_vendor" = ANY (ARRAY['uploaded'::"text", 'phone'::"text", 'synergy'::"text", 'awre'::"text", 'onform'::"text", 'external_url'::"text", 'manual'::"text"])))),
    CONSTRAINT "baseball_video_events_video_type_check" CHECK (("video_type" = ANY (ARRAY['game'::"text", 'practice'::"text", 'bullpen'::"text", 'bp'::"text", 'drill'::"text", 'showcase'::"text", 'training'::"text"]))),
    CONSTRAINT "baseball_video_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'team'::"text"])))
);

ALTER TABLE "public"."baseball_video_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_videos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "video_type" "text",
    "url" "text",
    "thumbnail_url" "text",
    "duration" integer,
    "view_count" integer DEFAULT 0,
    "is_primary" boolean DEFAULT false,
    "is_clip" boolean DEFAULT false,
    "parent_video_id" "uuid",
    "clip_start_time" integer,
    "clip_end_time" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_videos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_watchlists" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "pipeline_stage" "public"."baseball_pipeline_stage" DEFAULT 'watchlist'::"public"."baseball_pipeline_stage",
    "notes" "text",
    "priority" integer DEFAULT 0,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "fit_score" integer,
    "source" "text",
    "last_contact" timestamp with time zone,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."baseball_watchlists" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."baseball_workload_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "event_date" "date" NOT NULL,
    "event_type" "text" DEFAULT 'pitching'::"text" NOT NULL,
    "pitch_count" integer,
    "throw_count" integer,
    "max_velocity" numeric,
    "avg_velocity" numeric,
    "innings_pitched" numeric,
    "game_id" "uuid",
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "baseball_workload_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['pitching'::"text", 'bullpen'::"text", 'long_toss'::"text", 'flat_ground'::"text", 'catching'::"text", 'throwing'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."baseball_workload_events" OWNER TO "postgres";
