CREATE TYPE "public"."golf_expense_category" AS ENUM (
    'lodging',
    'transportation',
    'meals',
    'entry_fees',
    'equipment',
    'other'
);

ALTER TYPE "public"."golf_expense_category" OWNER TO "postgres";

CREATE TYPE "public"."golf_expense_paid_by" AS ENUM (
    'team',
    'player',
    'pending_reimbursement',
    'split'
);

ALTER TYPE "public"."golf_expense_paid_by" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."approach_miss_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shot_id" "uuid" NOT NULL,
    "miss_direction" "text",
    "lie_type" "text",
    "distance_from_green_yards" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "approach_miss_details_distance_from_green_yards_check" CHECK ((("distance_from_green_yards" IS NULL) OR ("distance_from_green_yards" >= (0)::numeric))),
    CONSTRAINT "approach_miss_details_lie_type_check" CHECK ((("lie_type" IS NULL) OR ("lie_type" = ANY (ARRAY['fairway'::"text", 'rough'::"text", 'sand'::"text", 'bunker'::"text", 'recovery'::"text", 'hazard'::"text", 'green'::"text", 'tee'::"text", 'other'::"text", 'penalty'::"text", 'deep_rough'::"text"])))),
    CONSTRAINT "approach_miss_details_miss_direction_check" CHECK ((("miss_direction" IS NULL) OR ("miss_direction" = ANY (ARRAY['short'::"text", 'long'::"text", 'left'::"text", 'right'::"text", 'short_left'::"text", 'short_right'::"text", 'long_left'::"text", 'long_right'::"text"]))))
);

ALTER TABLE "public"."approach_miss_details" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_academic_exclusions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text",
    "excluded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_academic_exclusions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_announcement_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_announcement_acknowledgements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_announcement_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_announcement_documents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_announcement_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_announcement_recipients" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_announcement_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_announcement_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "urgency" "text" DEFAULT 'normal'::"text",
    "requires_acknowledgement" boolean DEFAULT false,
    "send_push" boolean DEFAULT false,
    "send_email" boolean DEFAULT false,
    "publish_at" timestamp with time zone,
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_announcements_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"])))
);

ALTER TABLE "public"."golf_announcements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_attendance_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "total_events" integer DEFAULT 0,
    "attended_count" integer DEFAULT 0,
    "absent_count" integer DEFAULT 0,
    "excused_count" integer DEFAULT 0,
    "attendance_percentage" numeric(5,2),
    "period_start_date" "date",
    "period_end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_attendance_summary" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_calendar_feeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Calendar Feed'::"text" NOT NULL,
    "feed_type" "text" DEFAULT 'all_events'::"text",
    "feed_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "is_active" boolean DEFAULT true,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_calendar_feeds_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['all_events'::"text", 'practices'::"text", 'tournaments'::"text", 'qualifying'::"text"])))
);

ALTER TABLE "public"."golf_calendar_feeds" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_calendar_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "message" "text",
    "sent_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "action_url" "text",
    CONSTRAINT "golf_calendar_notifications_notification_type_check" CHECK ((("notification_type" = ANY (ARRAY['event_invitation'::"text", 'event_updated'::"text", 'event_cancelled'::"text", 'rsvp_response'::"text", 'rsvp_reminder'::"text", 'event_reminder'::"text", 'event_reminder_24h'::"text", 'event_reminder_1h'::"text", 'event_reminder_manual'::"text", 'message'::"text", 'announcement'::"text", 'task_assigned'::"text", 'qualifier_created'::"text", 'reminder'::"text", 'update'::"text", 'cancellation'::"text", 'rsvp_request'::"text"])) OR ("notification_type" ~~ 'rsvp_response:%'::"text") OR ("notification_type" ~~ 'event_updated:%'::"text")))
);

ALTER TABLE "public"."golf_calendar_notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_causal_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid",
    "team_id" "uuid",
    "cause" "text" NOT NULL,
    "cause_metric" "text",
    "effect" "text" NOT NULL,
    "effect_metric" "text",
    "relationship_type" "text" NOT NULL,
    "strength" numeric(5,4) DEFAULT 0 NOT NULL,
    "confidence" numeric(5,4) DEFAULT 0 NOT NULL,
    "mechanism" "text" NOT NULL,
    "confounders" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "dose_response" boolean DEFAULT false NOT NULL,
    "intervention_potential" numeric(5,4) DEFAULT 0 NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "validation_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "golf_causal_relationships_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['direct'::"text", 'mediated'::"text", 'moderated'::"text", 'bidirectional'::"text"])))
);

ALTER TABLE "public"."golf_causal_relationships" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coach_behavior_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_id" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_coach_behavior_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coach_blocked_time" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "reason" "text",
    "is_recurring" boolean DEFAULT false,
    "recurrence_rule" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "all_day" boolean DEFAULT false,
    "description" "text"
);

ALTER TABLE "public"."golf_coach_blocked_time" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coach_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "player_id" "uuid",
    "team_id" "uuid",
    "insight_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "acknowledged_at" timestamp with time zone,
    "dismissed" boolean DEFAULT false,
    "dismissed_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text" DEFAULT 'system'::"text",
    "source_id" "uuid",
    "action_taken" boolean DEFAULT false,
    "action_type" "text",
    "action_date" timestamp with time zone,
    "outcome_status" "text",
    "outcome_measured_at" timestamp with time zone,
    "outcome_notes" "text",
    "outcome_metric_name" "text",
    "outcome_metric_before" numeric(10,2),
    "outcome_metric_after" numeric(10,2),
    "evidence" "jsonb",
    "signature" "text",
    "category" "text",
    "lifecycle_state" "text" DEFAULT 'detected'::"text" NOT NULL,
    "addressed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "engine_version" "text" DEFAULT 'v2'::"text" NOT NULL,
    CONSTRAINT "golf_coach_insights_engine_version_check" CHECK (("engine_version" = ANY (ARRAY['v2'::"text", 'v3'::"text"]))),
    CONSTRAINT "golf_coach_insights_insight_type_check" CHECK (("insight_type" = ANY (ARRAY['performance_decline'::"text", 'performance_improvement'::"text", 'pattern_detected'::"text", 'practice_recommendation'::"text", 'roster_alert'::"text", 'qualifying_watch'::"text", 'attendance_concern'::"text", 'milestone_reached'::"text", 'comparison_insight'::"text", 'scoring_decline'::"text", 'stat_regression'::"text", 'tournament_pressure'::"text", 'plateau'::"text", 'bubble_player'::"text", 'surge_player'::"text", 'streak'::"text", 'recurring_weakness'::"text", 'closing_holes'::"text", 'par_3_issues'::"text", 'team_trend'::"text", 'roster_recommendation'::"text", 'putting'::"text", 'tee'::"text", 'approach'::"text", 'short_game'::"text", 'scoring'::"text", 'pressure'::"text", 'course_management'::"text", 'approach_miss'::"text", 'par_scoring'::"text", 'pressure_gap'::"text", 'putt_bias'::"text", 'putt_distance'::"text", 'scrambling'::"text", 'warmup_hole'::"text", 'composite'::"text", 'tee_strategy'::"text", 'performance_alert'::"text", 'positive_highlight'::"text"]))),
    CONSTRAINT "golf_coach_insights_lifecycle_state_check" CHECK ((("lifecycle_state" IS NULL) OR ("lifecycle_state" = ANY (ARRAY['tentative'::"text", 'detected'::"text", 'matured'::"text", 'addressed'::"text", 'resolved'::"text", 'archived'::"text"])))),
    CONSTRAINT "golf_coach_insights_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "golf_coach_insights_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'acknowledged'::"text", 'dismissed'::"text", 'resolved'::"text"])))
);

ALTER TABLE "public"."golf_coach_insights" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coach_philosophy" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "priority_ball_striking" integer DEFAULT 1,
    "priority_short_game" integer DEFAULT 2,
    "priority_putting" integer DEFAULT 3,
    "priority_course_management" integer DEFAULT 4,
    "priority_mental_game" integer DEFAULT 5,
    "alert_sensitivity" "text" DEFAULT 'balanced'::"text",
    "decline_threshold" numeric DEFAULT 2.0,
    "pressure_gap_threshold" numeric DEFAULT 2.0,
    "bubble_zone_range" numeric DEFAULT 1.5,
    "coaching_philosophy" "text",
    "expectations" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "weight_historical" integer DEFAULT 35 NOT NULL,
    "weight_recent_form" integer DEFAULT 30 NOT NULL,
    "weight_tournament" integer DEFAULT 20 NOT NULL,
    "weight_qualifying" integer DEFAULT 10 NOT NULL,
    "weight_subjective" integer DEFAULT 5 NOT NULL,
    "alert_scoring_decline" boolean DEFAULT true NOT NULL,
    "alert_stat_regression" boolean DEFAULT true NOT NULL,
    "alert_tournament_pressure" boolean DEFAULT true NOT NULL,
    "alert_plateau" boolean DEFAULT false NOT NULL,
    "alert_bubble_player" boolean DEFAULT true NOT NULL,
    "alert_surge_player" boolean DEFAULT true NOT NULL,
    "alert_streaks" boolean DEFAULT true NOT NULL,
    "alert_recurring_weakness" boolean DEFAULT true NOT NULL,
    "alert_closing_holes" boolean DEFAULT false NOT NULL,
    "alert_par_3_issues" boolean DEFAULT false NOT NULL,
    "show_strokes_gained" boolean DEFAULT true NOT NULL,
    "show_advanced_stats" boolean DEFAULT true NOT NULL,
    "insight_verbosity" "text" DEFAULT 'detailed'::"text" NOT NULL,
    "email_digest_enabled" boolean DEFAULT true NOT NULL,
    "min_insight_confidence" numeric(3,2) DEFAULT 0.30 NOT NULL,
    "min_rounds_for_signal" smallint DEFAULT 3 NOT NULL,
    "alert_digest" "text" DEFAULT 'immediate'::"text" NOT NULL,
    "min_hole_plays_for_ranking" smallint DEFAULT 3 NOT NULL,
    "pattern_lookback_days" smallint DEFAULT 90 NOT NULL,
    "stats_benchmark_window_days" smallint DEFAULT 30 NOT NULL,
    CONSTRAINT "golf_coach_philosophy_alert_digest_values" CHECK (("alert_digest" = ANY (ARRAY['immediate'::"text", 'daily'::"text", 'weekly'::"text"]))),
    CONSTRAINT "golf_coach_philosophy_insight_verbosity_check" CHECK (("insight_verbosity" = ANY (ARRAY['brief'::"text", 'detailed'::"text"]))),
    CONSTRAINT "golf_coach_philosophy_min_hole_plays_range" CHECK ((("min_hole_plays_for_ranking" >= 2) AND ("min_hole_plays_for_ranking" <= 10))),
    CONSTRAINT "golf_coach_philosophy_min_insight_confidence_range" CHECK ((("min_insight_confidence" >= 0.10) AND ("min_insight_confidence" <= 0.90))),
    CONSTRAINT "golf_coach_philosophy_min_rounds_for_signal_range" CHECK ((("min_rounds_for_signal" >= 1) AND ("min_rounds_for_signal" <= 15))),
    CONSTRAINT "golf_coach_philosophy_pattern_lookback_range" CHECK ((("pattern_lookback_days" >= 30) AND ("pattern_lookback_days" <= 365))),
    CONSTRAINT "golf_coach_philosophy_stats_benchmark_window_values" CHECK (("stats_benchmark_window_days" = ANY (ARRAY[14, 30, 60, 90])))
);

ALTER TABLE "public"."golf_coach_philosophy" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coach_player_intent" (
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "narrative_goal" "text" DEFAULT 'develop'::"text" NOT NULL,
    "alert_posture" "text" DEFAULT 'balanced'::"text" NOT NULL,
    "highlight_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_coach_player_intent_narrative_check" CHECK (("narrative_goal" = ANY (ARRAY['breakout'::"text", 'maintain'::"text", 'bubble'::"text", 'develop'::"text", 'rehabilitate'::"text"]))),
    CONSTRAINT "golf_coach_player_intent_posture_check" CHECK (("alert_posture" = ANY (ARRAY['aggressive'::"text", 'balanced'::"text", 'conservative'::"text", 'silent'::"text"])))
);

ALTER TABLE "public"."golf_coach_player_intent" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coaches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
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

ALTER TABLE "public"."golf_coaches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_action_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "tool_name" "text" NOT NULL,
    "proposed_input" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "result" "jsonb",
    "error_message" "text",
    "partial_failures" "jsonb",
    "proposed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "golf_coachhelm_action_runs_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'approved'::"text", 'denied'::"text", 'completed'::"text", 'failed'::"text"])))
);

ALTER TABLE "public"."golf_coachhelm_action_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_chat_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_coachhelm_chat_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text",
    "tool_calls" "jsonb",
    "tool_results" "jsonb",
    "cost_usd" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_turn_id" "text",
    "status" "text",
    "ui_parts" "jsonb",
    CONSTRAINT "golf_coachhelm_chat_messages_cost_usd_check" CHECK ((("cost_usd" IS NULL) OR ("cost_usd" >= (0)::numeric))),
    CONSTRAINT "golf_coachhelm_chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'tool'::"text"])))
);

ALTER TABLE "public"."golf_coachhelm_chat_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_coach_weights" (
    "coach_id" "uuid" NOT NULL,
    "insight_type" "text" NOT NULL,
    "intent" "text" NOT NULL,
    "weight" numeric DEFAULT 1.0 NOT NULL,
    "sample_n" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_coachhelm_coach_weights_sample_n_check" CHECK (("sample_n" >= 0)),
    CONSTRAINT "golf_coachhelm_coach_weights_weight_check" CHECK (("weight" >= (0)::numeric))
);

ALTER TABLE "public"."golf_coachhelm_coach_weights" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_llm_budget" (
    "coach_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "spent_usd" numeric DEFAULT 0 NOT NULL,
    "budget_usd" numeric NOT NULL,
    "task_class_usage" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_coachhelm_llm_budget_budget_usd_check" CHECK (("budget_usd" >= (0)::numeric)),
    CONSTRAINT "golf_coachhelm_llm_budget_spent_usd_check" CHECK (("spent_usd" >= (0)::numeric))
);

ALTER TABLE "public"."golf_coachhelm_llm_budget" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_llm_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task" "text" NOT NULL,
    "coach_id" "uuid",
    "player_id" "uuid",
    "prompt_hash" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "prompt_tokens" integer NOT NULL,
    "completion_tokens" integer NOT NULL,
    "cost_usd" numeric NOT NULL,
    "citations" "jsonb",
    "verified" boolean NOT NULL,
    "fallback_to_template" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_coachhelm_llm_calls_completion_tokens_check" CHECK (("completion_tokens" >= 0)),
    CONSTRAINT "golf_coachhelm_llm_calls_cost_usd_check" CHECK (("cost_usd" >= (0)::numeric)),
    CONSTRAINT "golf_coachhelm_llm_calls_prompt_tokens_check" CHECK (("prompt_tokens" >= 0)),
    CONSTRAINT "golf_coachhelm_llm_calls_task_check" CHECK (("task" = ANY (ARRAY['round_review'::"text", 'hero_narrative'::"text", 'coach_chat'::"text"])))
);

ALTER TABLE "public"."golf_coachhelm_llm_calls" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_coachhelm_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "enabled" boolean DEFAULT true,
    "auto_insights" boolean DEFAULT true,
    "weekly_summary" boolean DEFAULT true,
    "trend_alerts" boolean DEFAULT true,
    "insight_frequency" "text" DEFAULT 'daily'::"text",
    "min_rounds_for_insights" integer DEFAULT 3,
    "focus_areas" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "disabled_at" timestamp with time zone,
    "disabled_reason" "text",
    "goal_assignment_default" "text" DEFAULT 'suggested'::"text" NOT NULL,
    "llm_narrative_enabled" boolean DEFAULT false NOT NULL,
    "llm_budget_usd_per_day" numeric,
    CONSTRAINT "golf_coachhelm_settings_goal_assignment_default_check" CHECK (("goal_assignment_default" = ANY (ARRAY['mandatory'::"text", 'suggested'::"text"]))),
    CONSTRAINT "golf_coachhelm_settings_llm_budget_nonneg_check" CHECK ((("llm_budget_usd_per_day" IS NULL) OR ("llm_budget_usd_per_day" >= (0)::numeric)))
);

ALTER TABLE "public"."golf_coachhelm_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_confidence_calibration" (
    "bucket" numeric(3,1) NOT NULL,
    "prediction_type" "text" NOT NULL,
    "predictions_count" integer DEFAULT 0 NOT NULL,
    "correct_count" integer DEFAULT 0 NOT NULL,
    "actual_accuracy" numeric(5,4) DEFAULT 0 NOT NULL,
    "sample_size" integer DEFAULT 0 NOT NULL,
    "calibration_error" numeric(5,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_confidence_calibration" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_conversation_participants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone,
    "notification_level" "text" DEFAULT 'all'::"text" NOT NULL,
    "muted_until" timestamp with time zone,
    CONSTRAINT "golf_participants_notification_level_check" CHECK (("notification_level" = ANY (ARRAY['all'::"text", 'mentions'::"text", 'muted'::"text"])))
);

ALTER TABLE "public"."golf_conversation_participants" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid",
    "is_team_chat" boolean DEFAULT false,
    "title" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_team_channel" boolean DEFAULT false
);

ALTER TABLE "public"."golf_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_course_edit_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "edited_by_user_id" "uuid",
    "edited_by_team_id" "uuid",
    "action" "text" NOT NULL,
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_course_edit_history" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_course_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "yardage" integer,
    "handicap_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_course_holes_handicap_index_check" CHECK ((("handicap_index" >= 1) AND ("handicap_index" <= 18))),
    CONSTRAINT "golf_course_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "golf_course_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6)))
);

ALTER TABLE "public"."golf_course_holes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_course_tee_edit_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "edited_by_user_id" "uuid",
    "edited_by_team_id" "uuid",
    "action" "text" NOT NULL,
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_course_tee_edit_history" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_course_tee_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "yardage" integer,
    "handicap_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_course_tee_holes_handicap_index_check" CHECK ((("handicap_index" IS NULL) OR (("handicap_index" >= 1) AND ("handicap_index" <= 18)))),
    CONSTRAINT "golf_course_tee_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "golf_course_tee_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6))),
    CONSTRAINT "golf_course_tee_holes_yardage_check" CHECK ((("yardage" IS NULL) OR (("yardage" >= 30) AND ("yardage" <= 800))))
);

ALTER TABLE "public"."golf_course_tee_holes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_course_tees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "tee_name" "text" NOT NULL,
    "normalized_tee_name" "text" NOT NULL,
    "tee_color" "text",
    "category" "text",
    "total_yards" integer,
    "total_par" integer,
    "course_rating" numeric,
    "slope_rating" integer,
    "holes_count" integer DEFAULT 18 NOT NULL,
    "source" "text",
    "is_draft" boolean DEFAULT false NOT NULL,
    "created_by_user_id" "uuid",
    "created_by_team_id" "uuid",
    "last_edited_by_user_id" "uuid",
    "last_edited_by_team_id" "uuid",
    "last_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_course_tees_holes_count_check" CHECK (("holes_count" = ANY (ARRAY[9, 18])))
);

ALTER TABLE "public"."golf_course_tees" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_courses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'USA'::"text",
    "holes" integer DEFAULT 18,
    "par" integer,
    "course_rating" numeric,
    "slope_rating" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "normalized_name" "text",
    "slug" "text",
    "address" "text",
    "website" "text",
    "image_url" "text",
    "source" "text",
    "created_by_user_id" "uuid",
    "created_by_team_id" "uuid",
    "last_edited_by_user_id" "uuid",
    "last_edited_by_team_id" "uuid",
    "last_edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_demo_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "school" "text",
    "ip" "text",
    "user_agent" "text",
    "referrer" "text",
    "entered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "traffic_quality" "text",
    "quality_reason" "text",
    "crm_coach_id" "uuid",
    CONSTRAINT "golf_demo_sessions_traffic_quality_check" CHECK (("traffic_quality" = ANY (ARRAY['automated'::"text", 'likely_human'::"text", 'unknown'::"text"])))
);

ALTER TABLE "public"."golf_demo_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "file_url" "text" NOT NULL,
    "file_size" bigint,
    "uploaded_by" "uuid",
    "change_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "file_name" "text",
    "mime_type" "text",
    "storage_path" "text"
);

ALTER TABLE "public"."golf_document_versions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "uploaded_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "file_size" integer,
    "category" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_version_id" "uuid",
    "version_count" integer DEFAULT 1,
    "folder" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_documents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_drills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "description" "text" NOT NULL,
    "duration_min" integer NOT NULL,
    "difficulty" "text" NOT NULL,
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "impacts_metric_id" "text",
    CONSTRAINT "golf_drills_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"])))
);

ALTER TABLE "public"."golf_drills" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_event_attendance" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "rsvp_at" timestamp with time zone,
    "checked_in" boolean DEFAULT false,
    "checked_in_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notified_at" timestamp with time zone,
    "attendance_status" "text",
    CONSTRAINT "golf_event_attendance_attendance_status_check" CHECK (("attendance_status" = ANY (ARRAY['present'::"text", 'late'::"text", 'no_show'::"text"]))),
    CONSTRAINT "golf_event_attendance_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'tentative'::"text", 'attending'::"text", 'not_attending'::"text", 'maybe'::"text", 'excused'::"text", 'unexcused'::"text"])))
);

ALTER TABLE "public"."golf_event_attendance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_event_documents" (
    "event_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "attached_by" "uuid",
    "attached_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);

ALTER TABLE "public"."golf_event_documents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" NOT NULL,
    "location" "text",
    "course_id" "uuid",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "all_day" boolean DEFAULT false,
    "recurring" boolean DEFAULT false,
    "recurrence_rule" "text",
    "parent_event_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "requires_rsvp" boolean DEFAULT false,
    "rsvp_deadline" timestamp with time zone,
    "max_attendees" integer,
    CONSTRAINT "golf_events_end_after_start" CHECK ((("end_time" IS NULL) OR ("start_time" IS NULL) OR ("end_time" >= "start_time")))
);

ALTER TABLE "public"."golf_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_global_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "signature" "text" NOT NULL,
    "pattern_type" "text" NOT NULL,
    "conditions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "outcomes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "prevalence" numeric(5,4) DEFAULT 0 NOT NULL,
    "average_impact" numeric(6,3) DEFAULT 0 NOT NULL,
    "confidence" numeric(5,4) DEFAULT 0 NOT NULL,
    "instance_count" integer DEFAULT 0 NOT NULL,
    "player_count" integer DEFAULT 0 NOT NULL,
    "varied_by_tier" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "varied_by_handicap" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "contributing_players" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_global_patterns" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_goal_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric_id" "text" NOT NULL,
    "suggested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suggested_target_value" numeric,
    "suggested_window_days" integer DEFAULT 30 NOT NULL,
    "origin_insight_id" "uuid",
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "acted_at" timestamp with time zone,
    "snooze_until" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    CONSTRAINT "golf_goal_suggestions_state_check" CHECK (("state" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'dismissed'::"text", 'snoozed'::"text", 'expired'::"text"]))),
    CONSTRAINT "golf_goal_suggestions_window_range" CHECK ((("suggested_window_days" >= 7) AND ("suggested_window_days" <= 365)))
);

ALTER TABLE "public"."golf_goal_suggestions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "created_by_user_id" "uuid" NOT NULL,
    "creator_role" "text" NOT NULL,
    "coach_id_if_assigned" "uuid",
    "metric_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "window_days" integer GENERATED ALWAYS AS ((EXTRACT(day FROM ("ends_at" - "started_at")))::integer) STORED,
    "baseline_value" numeric,
    "current_value" numeric,
    "target_value" numeric,
    "target_source" "text",
    "state" "text" DEFAULT 'active'::"text" NOT NULL,
    "outcome_evaluated_at" timestamp with time zone,
    "shared_with_coach" boolean DEFAULT false NOT NULL,
    "shared_at" timestamp with time zone,
    "coach_assignment_mode" "text",
    "player_accepted_at" timestamp with time zone,
    "player_declined_at" timestamp with time zone,
    "player_decline_reason" "text",
    "transfer_reason" "text",
    "origin" "text" DEFAULT 'manual'::"text" NOT NULL,
    "origin_insight_id" "uuid",
    "snapshots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_goals_coach_assignment_mode_check" CHECK ((("coach_assignment_mode" IS NULL) OR ("coach_assignment_mode" = ANY (ARRAY['mandatory'::"text", 'suggested'::"text"])))),
    CONSTRAINT "golf_goals_creator_role_check" CHECK (("creator_role" = ANY (ARRAY['player'::"text", 'coach'::"text"]))),
    CONSTRAINT "golf_goals_ends_after_started" CHECK (("ends_at" > "started_at")),
    CONSTRAINT "golf_goals_origin_check" CHECK (("origin" = ANY (ARRAY['manual'::"text", 'engine_suggested'::"text", 'from_insight'::"text"]))),
    CONSTRAINT "golf_goals_state_check" CHECK (("state" = ANY (ARRAY['active'::"text", 'paused'::"text", 'achieved'::"text", 'missed'::"text", 'partial'::"text", 'abandoned'::"text", 'pending_baseline'::"text"]))),
    CONSTRAINT "golf_goals_target_source_check" CHECK ((("target_source" IS NULL) OR ("target_source" = ANY (ARRAY['manual'::"text", 'team_avg'::"text", 'pga_value'::"text", 'midpoint'::"text"])))),
    CONSTRAINT "golf_goals_window_range" CHECK ((("window_days" >= 7) AND ("window_days" <= 365)))
);

ALTER TABLE "public"."golf_goals" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_holes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "score" integer,
    "putts" integer,
    "fairway_hit" boolean,
    "gir" boolean,
    "up_and_down" boolean,
    "sand_save" boolean,
    "penalty_strokes" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "yardage" integer,
    CONSTRAINT "golf_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18)))
);

ALTER TABLE "public"."golf_holes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_ingest_connections" (
    "player_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "access_token_encrypted" "text" NOT NULL,
    "refresh_token_encrypted" "text",
    "expires_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "state" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_ingest_connections_provider_check" CHECK (("provider" = ANY (ARRAY['arccos'::"text", 'garmin'::"text", 'trackman'::"text"]))),
    CONSTRAINT "golf_ingest_connections_state_check" CHECK (("state" = ANY (ARRAY['active'::"text", 'expired'::"text", 'revoked'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."golf_ingest_connections" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_ingest_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "shots_inserted" integer DEFAULT 0 NOT NULL,
    "rounds_inserted" integer DEFAULT 0 NOT NULL,
    "errors_count" integer DEFAULT 0 NOT NULL,
    "error_detail" "text",
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_ingest_sync_log_errors_count_check" CHECK (("errors_count" >= 0)),
    CONSTRAINT "golf_ingest_sync_log_rounds_inserted_check" CHECK (("rounds_inserted" >= 0)),
    CONSTRAINT "golf_ingest_sync_log_shots_inserted_check" CHECK (("shots_inserted" >= 0))
);

ALTER TABLE "public"."golf_ingest_sync_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_action" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "actor_role" "text",
    "action_type" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_insight_action" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_drill_attachments" (
    "insight_id" "uuid" NOT NULL,
    "drill_id" "uuid" NOT NULL,
    "rank" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."golf_insight_drill_attachments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_effectiveness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "insight_type" "text" NOT NULL,
    "insights_generated" integer DEFAULT 0,
    "insights_dismissed" integer DEFAULT 0,
    "insights_acted_upon" integer DEFAULT 0,
    "insights_with_outcome" integer DEFAULT 0,
    "outcomes_improved" integer DEFAULT 0,
    "outcomes_no_change" integer DEFAULT 0,
    "outcomes_worsened" integer DEFAULT 0,
    "action_rate" numeric(5,4),
    "improvement_rate" numeric(5,4),
    "effectiveness_score" numeric(5,4),
    "predictions_made" integer DEFAULT 0,
    "predictions_accurate" integer DEFAULT 0,
    "mean_absolute_error" numeric(6,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_insight_effectiveness" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_exposure" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "surface" "text",
    "rank_position" integer,
    "rank_score" numeric,
    "shown_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_insight_exposure" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_generation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "insight_type" "text",
    "rounds_analyzed" integer,
    "insights_generated" integer,
    "engine_version" "text",
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_insight_generation_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_outcome" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric" "text",
    "baseline_value" numeric,
    "outcome_value" numeric,
    "improvement" numeric,
    "window_days" integer,
    "related_round_id" "uuid",
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_insight_outcome" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_outcome_attribution" (
    "insight_id" "uuid" NOT NULL,
    "surfaced_at" timestamp with time zone NOT NULL,
    "target_metric_id" "text" NOT NULL,
    "baseline_value" numeric NOT NULL,
    "post_value" numeric NOT NULL,
    "delta" numeric NOT NULL,
    "n_rounds_before" integer NOT NULL,
    "n_rounds_after" integer NOT NULL,
    "lift" numeric,
    "attributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_insight_outcome_attribution_n_rounds_after_check" CHECK (("n_rounds_after" >= 0)),
    CONSTRAINT "golf_insight_outcome_attribution_n_rounds_before_check" CHECK (("n_rounds_before" >= 0))
);

ALTER TABLE "public"."golf_insight_outcome_attribution" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_insight_player_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "rating" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_insight_player_feedback_rating_check" CHECK (("rating" = ANY (ARRAY['helpful'::"text", 'not_helpful'::"text", 'dismissed'::"text", 'acknowledged'::"text"])))
);

ALTER TABLE "public"."golf_insight_player_feedback" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_learned_behavior" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "interaction_type" "text" NOT NULL,
    "target_type" "text",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_learned_behavior_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['coach'::"text", 'player'::"text"])))
);

ALTER TABLE "public"."golf_learned_behavior" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "url" "text",
    "thumbnail_url" "text",
    "width" integer,
    "height" integer,
    "duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_message_attachments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_message_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid",
    "mention_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_message_mentions_target_check" CHECK (((("mention_type" = 'user'::"text") AND ("mentioned_user_id" IS NOT NULL)) OR (("mention_type" <> 'user'::"text") AND ("mentioned_user_id" IS NULL)))),
    CONSTRAINT "golf_message_mentions_type_check" CHECK (("mention_type" = ANY (ARRAY['user'::"text", 'team'::"text", 'all'::"text"])))
);

ALTER TABLE "public"."golf_message_mentions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_message_reactions_emoji_len" CHECK ((("char_length"("emoji") >= 1) AND ("char_length"("emoji") <= 16)))
);

ALTER TABLE "public"."golf_message_reactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_message_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "choice" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_message_responses_choice_len" CHECK ((("char_length"("choice") >= 1) AND ("char_length"("choice") <= 64)))
);

ALTER TABLE "public"."golf_message_responses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "has_attachments" boolean DEFAULT false,
    "edited_at" timestamp with time zone,
    "is_deleted" boolean DEFAULT false,
    "reply_to_id" "uuid",
    "kind" "text" DEFAULT 'text'::"text" NOT NULL,
    "payload" "jsonb",
    "pinned_at" timestamp with time zone,
    "pinned_by" "uuid",
    CONSTRAINT "golf_messages_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'system'::"text", 'practice'::"text", 'event'::"text", 'rsvp'::"text", 'poll'::"text", 'travel'::"text"]))),
    CONSTRAINT "golf_messages_payload_matches_kind" CHECK (((("kind" = 'text'::"text") AND ("payload" IS NULL)) OR (("kind" <> 'text'::"text") AND ("payload" IS NOT NULL))))
);

ALTER TABLE "public"."golf_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_metrics" (
    "metric_id" "text" NOT NULL,
    "display_label" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "introduced_in_wave" "text" DEFAULT 'W9'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_metrics_category_check" CHECK (("category" = ANY (ARRAY['sg'::"text", 'putting'::"text", 'approach'::"text", 'short_game'::"text", 'course_mgmt'::"text", 'scoring'::"text", 'pressure'::"text"]))),
    CONSTRAINT "golf_metrics_direction_check" CHECK (("direction" = ANY (ARRAY['higher_better'::"text", 'lower_better'::"text"]))),
    CONSTRAINT "golf_metrics_unit_check" CHECK (("unit" = ANY (ARRAY['percent'::"text", 'strokes'::"text", 'yards'::"text", 'feet'::"text", 'count'::"text"])))
);

ALTER TABLE "public"."golf_metrics" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_patterns_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "pattern_type" "text" NOT NULL,
    "conditions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "outcome" "jsonb",
    "support" numeric DEFAULT 0 NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "lift" numeric DEFAULT 1,
    "conviction" numeric DEFAULT 1,
    "stroke_impact" numeric DEFAULT 0,
    "actionability" numeric DEFAULT 0,
    "sample_size" integer DEFAULT 0,
    "first_detected" timestamp with time zone DEFAULT "now"(),
    "last_occurrence" timestamp with time zone DEFAULT "now"(),
    "occurrence_count" integer DEFAULT 1,
    "trend" "text",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "severity" "text" DEFAULT 'medium'::"text",
    "strokes_impact" numeric(4,2),
    "validated_by_coach" boolean DEFAULT false,
    "validation_date" timestamp with time zone,
    "validator_coach_id" "uuid",
    "source_round_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "lifecycle_state" "text" DEFAULT 'detected'::"text",
    "resolved_at" timestamp with time zone,
    "resolution_notes" "text",
    "dismissed_at" timestamp with time zone,
    "dismissed_reason" "text",
    CONSTRAINT "golf_patterns_v2_lifecycle_state_check" CHECK (("lifecycle_state" = ANY (ARRAY['detected'::"text", 'confirmed'::"text", 'addressed'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "golf_patterns_v2_pattern_type_check" CHECK (("pattern_type" = ANY (ARRAY['conditional'::"text", 'compound'::"text", 'anomaly'::"text", 'regression'::"text", 'temporal'::"text", 'contextual'::"text", 'sequence'::"text", 'cluster'::"text"]))),
    CONSTRAINT "golf_patterns_v2_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "golf_patterns_v2_trend_check" CHECK (("trend" = ANY (ARRAY['strengthening'::"text", 'stable'::"text", 'weakening'::"text", 'new'::"text"])))
);

ALTER TABLE "public"."golf_patterns_v2" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_pga_standards" (
    "metric_id" "text" NOT NULL,
    "season" "text" NOT NULL,
    "display_label" "text" NOT NULL,
    "pga_tour_value" numeric,
    "korn_ferry_value" numeric,
    "div1_avg_value" numeric,
    "div2_avg_value" numeric,
    "div3_avg_value" numeric,
    "hs_avg_value" numeric,
    "pga_p25" numeric,
    "pga_p50" numeric,
    "pga_p75" numeric,
    "source" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tour" "text" DEFAULT 'pga'::"text" NOT NULL,
    CONSTRAINT "golf_pga_standards_tour_check" CHECK (("tour" = ANY (ARRAY['pga'::"text", 'lpga'::"text"])))
);

ALTER TABLE "public"."golf_pga_standards" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_platform_metrics_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "daily_active_users" integer DEFAULT 0,
    "weekly_active_users" integer DEFAULT 0,
    "monthly_active_users" integer DEFAULT 0,
    "total_users" integer DEFAULT 0,
    "new_signups" integer DEFAULT 0,
    "rounds_today" integer DEFAULT 0,
    "rounds_this_week" integer DEFAULT 0,
    "total_rounds" integer DEFAULT 0,
    "avg_rounds_per_active_player" numeric(6,2),
    "insights_generated" integer DEFAULT 0,
    "reviews_created" integer DEFAULT 0,
    "patterns_detected" integer DEFAULT 0,
    "active_teams" integer DEFAULT 0,
    "avg_engagement_score" numeric(5,2),
    "churn_at_risk_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_platform_metrics_daily" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_classes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "class_name" "text" NOT NULL,
    "instructor" "text",
    "days" "text"[],
    "start_time" time without time zone,
    "end_time" time without time zone,
    "building" "text",
    "room" "text",
    "credits" integer,
    "color" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "semester" "text"
);

ALTER TABLE "public"."golf_player_classes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "course_name" "text",
    "relationship" "text" DEFAULT 'played'::"text",
    "rounds_played" integer DEFAULT 0,
    "best_score" integer,
    "average_score" numeric(5,2),
    "last_played_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_player_courses_relationship_check" CHECK (("relationship" = ANY (ARRAY['home'::"text", 'frequent'::"text", 'played'::"text", 'favorite'::"text"])))
);

ALTER TABLE "public"."golf_player_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_focus_areas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "coach_id" "uuid",
    "area_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text",
    "target_metric" "text",
    "current_value" numeric,
    "target_value" numeric,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "from_review_id" "uuid",
    "from_insight_id" "uuid",
    "review_context" "text",
    "progress_notes" "jsonb" DEFAULT '{"entries": []}'::"jsonb",
    "priority" integer DEFAULT 1,
    "outcome_status" "text",
    "target_kind" "text",
    "target_date" "date",
    "target_rounds" integer,
    "baseline_value" numeric,
    "snapshots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "golf_player_focus_areas_target_kind_check" CHECK (("target_kind" = ANY (ARRAY['date'::"text", 'rounds'::"text"])))
);

ALTER TABLE "public"."golf_player_focus_areas" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_genome" (
    "player_id" "uuid" NOT NULL,
    "vector" "jsonb" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rounds_basis" integer NOT NULL,
    CONSTRAINT "golf_player_genome_rounds_basis_check" CHECK (("rounds_basis" >= 0))
);

ALTER TABLE "public"."golf_player_genome" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_notification_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "last_announcements_seen_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_travel_seen_at" timestamp with time zone DEFAULT "now"(),
    "prefs" "jsonb" DEFAULT '{"goal_missed": {"push": false, "email": false, "in_app": true}, "new_insight": {"push": false, "email": false, "in_app": true}, "goal_achieved": {"push": true, "email": false, "in_app": true}, "weekly_digest": {"push": false, "email": true, "in_app": false}, "coach_commented": {"push": true, "email": false, "in_app": true}, "composite_insight": {"push": true, "email": false, "in_app": true}, "round_review_ready": {"push": true, "email": false, "in_app": true}, "coach_assigned_goal": {"push": true, "email": false, "in_app": true}, "engine_suggested_goal": {"push": false, "email": false, "in_app": true}, "standing_percentile_changed": {"push": false, "email": false, "in_app": false}}'::"jsonb" NOT NULL,
    "quiet_mode" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."golf_player_notification_state" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_standing" (
    "player_id" "uuid" NOT NULL,
    "metric_id" "text" NOT NULL,
    "player_value" numeric NOT NULL,
    "team_avg" numeric,
    "team_n" integer DEFAULT 0 NOT NULL,
    "team_pct" numeric,
    "level_avg" numeric,
    "level_n" integer DEFAULT 0 NOT NULL,
    "level_pct" numeric,
    "pga_value" numeric NOT NULL,
    "pga_delta" numeric,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_player_standing" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_player_stats_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "scoring_average" numeric(5,2),
    "scoring_average_vs_par" numeric(5,2),
    "rounds_played" integer DEFAULT 0,
    "best_round" integer,
    "worst_round" integer,
    "par3_average" numeric(5,2),
    "par4_average" numeric(5,2),
    "par5_average" numeric(5,2),
    "eagles" integer DEFAULT 0,
    "birdies" integer DEFAULT 0,
    "pars" integer DEFAULT 0,
    "bogeys" integer DEFAULT 0,
    "double_bogeys" integer DEFAULT 0,
    "triple_plus" integer DEFAULT 0,
    "strokes_gained_total" numeric(5,2),
    "strokes_gained_tee" numeric(5,2),
    "strokes_gained_approach" numeric(5,2),
    "strokes_gained_around_green" numeric(5,2),
    "strokes_gained_putting" numeric(5,2),
    "driving_accuracy_percentage" numeric(5,2),
    "fairways_hit" integer DEFAULT 0,
    "fairways_total" integer DEFAULT 0,
    "driving_distance_average" numeric(6,1),
    "gir_percentage" numeric(5,2),
    "greens_hit" integer DEFAULT 0,
    "greens_total" integer DEFAULT 0,
    "approach_proximity_average" numeric(6,1),
    "scrambling_percentage" numeric(5,2),
    "scrambles_converted" integer DEFAULT 0,
    "scramble_attempts" integer DEFAULT 0,
    "sand_save_percentage" numeric(5,2),
    "sand_saves" integer DEFAULT 0,
    "sand_attempts" integer DEFAULT 0,
    "up_and_down_percentage" numeric(5,2),
    "putts_per_round" numeric(4,2),
    "putts_per_gir" numeric(4,2),
    "one_putt_percentage" numeric(5,2),
    "three_putt_percentage" numeric(5,2),
    "total_putts" integer DEFAULT 0,
    "putt_make_pct_0_3ft" numeric(5,2),
    "putt_make_pct_3_5ft" numeric(5,2),
    "putt_make_pct_5_10ft" numeric(5,2),
    "putt_make_pct_10_15ft" numeric(5,2),
    "putt_make_pct_15_20ft" numeric(5,2),
    "putt_make_pct_20_plus_ft" numeric(5,2),
    "putt_make_pct_left_to_right" numeric(5,2),
    "putt_make_pct_right_to_left" numeric(5,2),
    "putt_make_pct_straight" numeric(5,2),
    "penalty_strokes_per_round" numeric(4,2),
    "total_penalties" integer DEFAULT 0,
    "approach_miss_left_pct" numeric(5,2),
    "approach_miss_right_pct" numeric(5,2),
    "approach_miss_short_pct" numeric(5,2),
    "approach_miss_long_pct" numeric(5,2),
    "last_round_date" "date",
    "rounds_in_calculation" integer DEFAULT 0,
    "calculation_period_start" "date",
    "calculation_period_end" "date",
    "engine_version" "text" DEFAULT 'v2'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rounds_this_season" integer DEFAULT 0,
    "season_start_date" "date",
    "last_5_average" numeric(5,2),
    "last_10_average" numeric(5,2),
    "improvement_trend" numeric(5,2),
    "trend_direction" "text",
    "sg_total_per_round" numeric(5,2),
    "sg_tee_per_round" numeric(5,2),
    "sg_approach_per_round" numeric(5,2),
    "sg_around_green_per_round" numeric(5,2),
    "sg_putting_per_round" numeric(5,2),
    "is_stale" boolean DEFAULT false,
    "next_refresh_due" timestamp with time zone,
    "round_ids_included" "uuid"[],
    "putt_make_pct_15_25ft" numeric,
    "putt_make_pct_25_plus_ft" numeric,
    "putt_attempts_3_5ft" integer,
    "putt_attempts_5_10ft" integer,
    "putt_attempts_10_15ft" integer,
    "putt_attempts_15_25ft" integer,
    "putt_attempts_25_plus_ft" integer,
    "first_round_date" "date",
    CONSTRAINT "golf_player_stats_cache_trend_direction_check" CHECK (("trend_direction" = ANY (ARRAY['improving'::"text", 'stable'::"text", 'declining'::"text"])))
);

ALTER TABLE "public"."golf_player_stats_cache" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_players" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "hometown" "text",
    "state" "text",
    "handicap" numeric,
    "handicap_index" numeric,
    "high_school_name" "text",
    "graduation_year" integer,
    "gpa" numeric,
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "profile_complete" boolean DEFAULT false,
    "anonymized_at" timestamp with time zone
);

ALTER TABLE "public"."golf_players" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_practice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "session_date" "date" NOT NULL,
    "shots_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_practice_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_prediction_model_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "model_type" "text" NOT NULL,
    "model_version" "text",
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "predictions_made" integer DEFAULT 0,
    "predictions_validated" integer DEFAULT 0,
    "accuracy_rate" numeric(5,4),
    "mean_absolute_error" numeric(6,2),
    "root_mean_square_error" numeric(6,2),
    "calibration_score" numeric(5,4),
    "overconfidence_rate" numeric(5,4),
    "underconfidence_rate" numeric(5,4),
    "accuracy_by_confidence" "jsonb" DEFAULT '{}'::"jsonb",
    "error_distribution" "jsonb" DEFAULT '{}'::"jsonb",
    "systematic_bias" numeric(6,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_prediction_model_performance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_prediction_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prediction_id" "uuid",
    "player_id" "uuid" NOT NULL,
    "predicted_value" numeric(6,2),
    "actual_value" numeric(6,2),
    "error" numeric(6,2),
    "error_pct" numeric(5,2),
    "within_interval" boolean,
    "direction" "text",
    "validated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_prediction_validations_direction_check" CHECK (("direction" = ANY (ARRAY['overestimate'::"text", 'underestimate'::"text", 'accurate'::"text"])))
);

ALTER TABLE "public"."golf_prediction_validations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric" "text" NOT NULL,
    "predicted_value" numeric NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "confidence_interval_low" numeric,
    "confidence_interval_high" numeric,
    "prediction_window_days" integer DEFAULT 30,
    "trend" "text",
    "key_drivers" "jsonb" DEFAULT '[]'::"jsonb",
    "input_features" "jsonb" DEFAULT '[]'::"jsonb",
    "model_version" "text" DEFAULT 'v2'::"text",
    "due_date" "date",
    "validated_at" timestamp with time zone,
    "actual_value" numeric,
    "was_accurate" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "prediction_context" "jsonb" DEFAULT '{}'::"jsonb",
    "confidence_factors" "jsonb" DEFAULT '[]'::"jsonb",
    "error_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "error_category" "text",
    "related_round_id" "uuid",
    "related_event_id" "uuid",
    "predicted_low" numeric(6,2),
    "predicted_high" numeric(6,2),
    CONSTRAINT "golf_predictions_trend_check" CHECK (("trend" = ANY (ARRAY['improving'::"text", 'stable'::"text", 'declining'::"text"])))
);

ALTER TABLE "public"."golf_predictions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_qualifier_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "qualifier_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "round_id" "uuid",
    "status" "text" DEFAULT 'entered'::"text",
    "score" integer,
    "position" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "total_score" integer,
    "total_to_par" integer,
    "rounds_completed" integer DEFAULT 0,
    "is_tied" boolean DEFAULT false
);

ALTER TABLE "public"."golf_qualifier_entries" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_qualifier_round_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "qualifier_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "course_id" "uuid",
    "course_name" "text",
    "tee_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_qualifier_round_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_qualifier_selections" (
    "qualifier_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "selection_type" "text" NOT NULL,
    "coach_reasoning" "text",
    "selected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_by_user_id" "uuid" NOT NULL,
    CONSTRAINT "golf_qualifier_selections_type_check" CHECK (("selection_type" = ANY (ARRAY['top_score'::"text", 'coach_pick'::"text"])))
);

ALTER TABLE "public"."golf_qualifier_selections" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_qualifiers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "course_id" "uuid",
    "course_name" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "status" "text" DEFAULT 'upcoming'::"text",
    "spots_available" integer,
    "entry_deadline" "date",
    "rules" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "selection_slots_total" integer DEFAULT 5 NOT NULL,
    "selection_slots_coach_pick" integer DEFAULT 1 NOT NULL,
    "target_tournament_id" "uuid",
    "selection_state" "text" DEFAULT 'open'::"text" NOT NULL,
    "num_rounds" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "golf_qualifiers_check" CHECK ((("selection_slots_coach_pick" >= 0) AND ("selection_slots_coach_pick" <= "selection_slots_total"))),
    CONSTRAINT "golf_qualifiers_num_rounds_range" CHECK ((("num_rounds" >= 1) AND ("num_rounds" <= 50))),
    CONSTRAINT "golf_qualifiers_selection_slots_total_check" CHECK ((("selection_slots_total" >= 1) AND ("selection_slots_total" <= 12))),
    CONSTRAINT "golf_qualifiers_selection_state_check" CHECK (("selection_state" = ANY (ARRAY['open'::"text", 'scoring'::"text", 'closed'::"text", 'selected'::"text"])))
);

ALTER TABLE "public"."golf_qualifiers" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_recruit_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recruit_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'note'::"text" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_type" "text",
    "file_size" bigint,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_recruit_documents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_recruits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "hs_class" integer,
    "email" "text",
    "phone" "text",
    "hometown" "text",
    "state" "text",
    "notes" "text",
    "status" "text" DEFAULT 'recruiting'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "golf_recruits_lengths" CHECK ((("length"("first_name") <= 120) AND (("last_name" IS NULL) OR ("length"("last_name") <= 120)) AND (("email" IS NULL) OR ("length"("email") <= 254)) AND (("phone" IS NULL) OR ("length"("phone") <= 40)) AND (("hometown" IS NULL) OR ("length"("hometown") <= 120)) AND (("state" IS NULL) OR ("length"("state") <= 2)) AND (("notes" IS NULL) OR ("length"("notes") <= 5000)) AND (("hs_class" IS NULL) OR (("hs_class" >= 2020) AND ("hs_class" <= 2040))))),
    CONSTRAINT "golf_recruits_status_check" CHECK (("status" = ANY (ARRAY['recruiting'::"text", 'watched'::"text", 'offered'::"text", 'committed'::"text"])))
);

ALTER TABLE "public"."golf_recruits" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_review_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_review_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['review_generated'::"text", 'review_regenerated'::"text", 'coach_viewed'::"text", 'coach_annotated'::"text", 'coach_published'::"text", 'player_viewed'::"text", 'player_acknowledged'::"text", 'focus_area_created'::"text", 'focus_area_completed'::"text", 'insight_feedback_given'::"text"])))
);

ALTER TABLE "public"."golf_review_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_round_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "round_score" integer,
    "round_score_to_par" integer,
    "scoring_avg_before" numeric(4,2),
    "scoring_avg_after" numeric(4,2),
    "highlights" "jsonb" DEFAULT '[]'::"jsonb",
    "areas_to_review" "jsonb" DEFAULT '[]'::"jsonb",
    "round_stats" "jsonb",
    "patterns_detected" "jsonb" DEFAULT '[]'::"jsonb",
    "summary" "text",
    "primary_takeaway" "text",
    "next_practice_priority" "text",
    "coach_notes" "text",
    "coach_viewed_at" timestamp with time zone,
    "shared_with_coach" boolean DEFAULT false,
    "shared_at" timestamp with time zone,
    "engine_version" "text" DEFAULT 'v2'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ai_model_version" "text",
    "sentiment_score" numeric(3,2),
    "regeneration_count" integer DEFAULT 0,
    "last_regenerated_at" timestamp with time zone,
    "insights_count" integer DEFAULT 0,
    "highlights_count" integer DEFAULT 0,
    "areas_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text",
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "coach_rating" integer,
    "coach_feedback_text" "text",
    "player_viewed_at" timestamp with time zone,
    "player_acknowledged_at" timestamp with time zone,
    "action_items" "jsonb" DEFAULT '[]'::"jsonb",
    "version" integer DEFAULT 1,
    "generation_method" "text" DEFAULT 'v1'::"text",
    "shared_with_player" boolean DEFAULT false,
    CONSTRAINT "golf_round_reviews_coach_rating_check" CHECK ((("coach_rating" >= 1) AND ("coach_rating" <= 5))),
    CONSTRAINT "golf_round_reviews_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);

ALTER TABLE "public"."golf_round_reviews" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_round_stats_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "total_score" integer,
    "score_to_par" integer,
    "front_nine" integer,
    "back_nine" integer,
    "strokes_gained_total" numeric(5,2),
    "strokes_gained_tee" numeric(5,2),
    "strokes_gained_approach" numeric(5,2),
    "strokes_gained_around_green" numeric(5,2),
    "strokes_gained_putting" numeric(5,2),
    "fairways_hit" integer,
    "fairways_total" integer,
    "driving_distance_avg" numeric(6,1),
    "greens_hit" integer,
    "greens_total" integer,
    "total_putts" integer,
    "one_putts" integer,
    "three_putts" integer,
    "scrambles_converted" integer,
    "scramble_attempts" integer,
    "sand_saves" integer,
    "sand_attempts" integer,
    "eagles" integer DEFAULT 0,
    "birdies" integer DEFAULT 0,
    "pars" integer DEFAULT 0,
    "bogeys" integer DEFAULT 0,
    "double_bogeys" integer DEFAULT 0,
    "triple_plus" integer DEFAULT 0,
    "penalty_strokes" integer DEFAULT 0,
    "detailed_stats" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_round_stats_cache" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_rounds" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "course_id" "uuid",
    "course_name" "text",
    "course_city" "text",
    "course_state" "text",
    "course_rating" numeric,
    "course_slope" integer,
    "tees_played" "text",
    "round_date" "date" NOT NULL,
    "round_type" "text" DEFAULT 'practice'::"text",
    "holes_played" integer DEFAULT 18,
    "total_score" integer,
    "front_nine" integer,
    "back_nine" integer,
    "score_to_par" integer,
    "status" "text" DEFAULT 'in_progress'::"text",
    "current_hole" integer DEFAULT 1,
    "total_putts" integer,
    "total_fairways_hit" integer,
    "total_fairways" integer,
    "total_gir" integer,
    "total_gir_possible" integer,
    "weather_conditions" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "strokes_gained_total" numeric(5,2),
    "strokes_gained_tee" numeric(5,2),
    "strokes_gained_approach" numeric(5,2),
    "strokes_gained_around_green" numeric(5,2),
    "strokes_gained_putting" numeric(5,2),
    "qualifier_id" "uuid",
    "qualifier_round_number" integer,
    "draft_data" "jsonb",
    "total_penalties" integer DEFAULT 0,
    "ai_recap" "text",
    "ai_recap_generated_at" timestamp with time zone,
    "coachhelm_analyzed_at" timestamp with time zone,
    "coachhelm_failed_at" timestamp with time zone,
    "coachhelm_failure_reason" "text",
    "tee_id" "uuid"
);

ALTER TABLE "public"."golf_rounds" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_shots" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_id" "uuid",
    "hole_number" integer NOT NULL,
    "shot_number" integer NOT NULL,
    "shot_type" "text",
    "distance_to_hole_before" numeric,
    "distance_to_hole_after" numeric,
    "distance_unit" "text" DEFAULT 'yards'::"text",
    "shot_distance" numeric,
    "lie_before" "text",
    "lie_after" "text",
    "result" "text",
    "is_penalty" boolean DEFAULT false,
    "penalty_type" "text",
    "putt_made" boolean,
    "putt_distance_feet" numeric,
    "putt_break" "text",
    "putt_slope" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_type" "text",
    "distance_unit_before" "text" DEFAULT 'yards'::"text",
    "distance_unit_after" "text" DEFAULT 'yards'::"text",
    "miss_direction" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_shots_club_type_check" CHECK ((("club_type" IS NULL) OR ("club_type" = ANY (ARRAY['driver'::"text", 'non_driver'::"text", 'putter'::"text"])))),
    CONSTRAINT "golf_shots_distance_unit_after_check" CHECK ((("distance_unit_after" IS NULL) OR ("distance_unit_after" = ANY (ARRAY['yards'::"text", 'feet'::"text"])))),
    CONSTRAINT "golf_shots_distance_unit_before_check" CHECK ((("distance_unit_before" IS NULL) OR ("distance_unit_before" = ANY (ARRAY['yards'::"text", 'feet'::"text"])))),
    CONSTRAINT "golf_shots_lie_after_check" CHECK ((("lie_after" IS NULL) OR ("lie_after" = ANY (ARRAY['tee'::"text", 'fairway'::"text", 'rough'::"text", 'sand'::"text", 'green'::"text", 'other'::"text", 'penalty'::"text"])))),
    CONSTRAINT "golf_shots_lie_before_check" CHECK ((("lie_before" IS NULL) OR ("lie_before" = ANY (ARRAY['tee'::"text", 'fairway'::"text", 'rough'::"text", 'sand'::"text", 'green'::"text", 'other'::"text", 'penalty'::"text"])))),
    CONSTRAINT "golf_shots_putt_break_check" CHECK ((("putt_break" IS NULL) OR ("putt_break" = ANY (ARRAY['left_to_right'::"text", 'right_to_left'::"text", 'straight'::"text", 'multiple'::"text"])))),
    CONSTRAINT "golf_shots_result_check" CHECK ((("result" IS NULL) OR ("result" = ANY (ARRAY['fairway'::"text", 'rough'::"text", 'deep_rough'::"text", 'sand'::"text", 'green'::"text", 'hole'::"text", 'other'::"text", 'penalty'::"text", 'recovery'::"text"])))),
    CONSTRAINT "golf_shots_shot_type_check" CHECK ((("shot_type" IS NULL) OR ("shot_type" = ANY (ARRAY['tee'::"text", 'approach'::"text", 'around_green'::"text", 'putting'::"text", 'penalty'::"text"]))))
);

ALTER TABLE "public"."golf_shots" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_staff_invite_codes" (
    "code" "text" NOT NULL,
    "token" "text" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_by_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_staff_invite_codes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_staff_invite_redemptions" (
    "nonce" "text" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "redeemed_by" "uuid",
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_staff_invite_redemptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_task_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "completed_at" timestamp with time zone,
    "upload_url" "text",
    "notes" "text",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_task_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_task_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "reminder_type" "public"."reminder_type" DEFAULT 'in_app'::"public"."reminder_type" NOT NULL,
    "sent" boolean DEFAULT false NOT NULL,
    "sent_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_task_reminders" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "default_assignee_type" "text" DEFAULT 'all_players'::"text",
    "category" "text",
    "default_priority" "text" DEFAULT 'normal'::"text",
    "default_due_days" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_task_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "task_type" "text",
    "due_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "completed_at" timestamp with time zone,
    "priority" "text" DEFAULT 'medium'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "reminder_at" timestamp with time zone,
    "reminder_type" "public"."reminder_type",
    "reminder_sent" boolean DEFAULT false,
    "category" "text",
    "recurrence_rule" "text",
    "parent_task_id" "uuid"
);

ALTER TABLE "public"."golf_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_coach_staff" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'head_coach'::"text",
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_team_coach_staff" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_coachhelm_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "disabled_at" timestamp with time zone,
    "disabled_by" "uuid",
    "disabled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

ALTER TABLE "public"."golf_team_coachhelm_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "rejection_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_team_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."golf_team_join_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "public"."team_member_status" DEFAULT 'pending'::"public"."team_member_status",
    "jersey_number" integer,
    "joined_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."golf_team_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_saved_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "default_tee_id" "uuid",
    "pinned" boolean DEFAULT false NOT NULL,
    "last_played_at" timestamp with time zone,
    "times_played" integer DEFAULT 0 NOT NULL,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."golf_team_saved_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_team_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "scoring_format" "text" DEFAULT 'stroke_play'::"text",
    "handicap_system" "text" DEFAULT 'usga'::"text",
    "default_tees" "text" DEFAULT 'blue'::"text",
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sg_benchmark_level" "text" DEFAULT 'scratch'::"text" NOT NULL,
    "sg_baseline" "text",
    "event_reminders_enabled" boolean DEFAULT true NOT NULL,
    "event_reminder_early_hours" smallint DEFAULT 24 NOT NULL,
    "event_reminder_late_minutes" smallint DEFAULT 60 NOT NULL,
    CONSTRAINT "golf_team_settings_event_reminder_early_range" CHECK ((("event_reminder_early_hours" >= 2) AND ("event_reminder_early_hours" <= 168))),
    CONSTRAINT "golf_team_settings_event_reminder_late_range" CHECK ((("event_reminder_late_minutes" >= 60) AND ("event_reminder_late_minutes" <= 720))),
    CONSTRAINT "golf_team_settings_event_reminder_ordering" CHECK ((("event_reminder_early_hours" * 60) > "event_reminder_late_minutes")),
    CONSTRAINT "golf_team_settings_sg_baseline_check" CHECK ((("sg_baseline" IS NULL) OR ("sg_baseline" = ANY (ARRAY['pga_tour'::"text", 'womens'::"text"])))),
    CONSTRAINT "golf_team_settings_sg_benchmark_level_check" CHECK (("sg_benchmark_level" = ANY (ARRAY['pga_tour'::"text", 'scratch'::"text", 'ncaa_d1'::"text", 'ncaa_d2'::"text", 'ncaa_d3'::"text", 'break_80'::"text", 'break_90'::"text", 'break_100'::"text"])))
);

ALTER TABLE "public"."golf_team_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "join_code" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "description" "text",
    "season" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "gender" "text" DEFAULT 'mens'::"text" NOT NULL,
    "season_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "golf_teams_gender_check" CHECK (("gender" = ANY (ARRAY['mens'::"text", 'womens'::"text"])))
);

ALTER TABLE "public"."golf_teams" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_travel_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "itinerary_id" "uuid" NOT NULL,
    "category" "public"."golf_expense_category" NOT NULL,
    "budgeted_amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_travel_budgets_budgeted_amount_check" CHECK (("budgeted_amount" >= (0)::numeric))
);

ALTER TABLE "public"."golf_travel_budgets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_travel_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "itinerary_id" "uuid",
    "team_id" "uuid" NOT NULL,
    "category" "public"."golf_expense_category" DEFAULT 'other'::"public"."golf_expense_category" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "receipt_url" "text",
    "paid_by" "public"."golf_expense_paid_by" DEFAULT 'team'::"public"."golf_expense_paid_by" NOT NULL,
    "vendor_name" "text",
    "expense_date" "date",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_travel_expenses_amount_check" CHECK (("amount" >= (0)::numeric))
);

ALTER TABLE "public"."golf_travel_expenses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."golf_travel_itineraries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "event_name" "text",
    "destination" "text",
    "transportation_type" "text",
    "departure_date" "date",
    "departure_time" time without time zone,
    "departure_location" "text",
    "return_date" "date",
    "return_time" time without time zone,
    "flight_info" "jsonb",
    "hotel_name" "text",
    "hotel_address" "text",
    "hotel_phone" "text",
    "hotel_confirmation" "text",
    "room_assignments" "jsonb",
    "uniform_requirements" "text",
    "gear_list" "text"[],
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_travel_itineraries_transportation_type_check" CHECK (("transportation_type" = ANY (ARRAY['bus'::"text", 'van'::"text", 'flight'::"text", 'carpool'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."golf_travel_itineraries" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."putt_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shot_id" "uuid" NOT NULL,
    "miss_tags" "text"[] DEFAULT '{}'::"text"[],
    "break_direction" "text",
    "estimated_break_inches" integer,
    "distance_feet" numeric,
    "made" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "putt_details_break_direction_check" CHECK ((("break_direction" IS NULL) OR ("break_direction" = ANY (ARRAY['left_to_right'::"text", 'right_to_left'::"text", 'straight'::"text", 'multiple'::"text"])))),
    CONSTRAINT "putt_details_distance_feet_check" CHECK ((("distance_feet" IS NULL) OR (("distance_feet" >= (0)::numeric) AND ("distance_feet" <= (500)::numeric)))),
    CONSTRAINT "putt_details_estimated_break_inches_check" CHECK ((("estimated_break_inches" IS NULL) OR (("estimated_break_inches" >= 0) AND ("estimated_break_inches" <= 120))))
);

ALTER TABLE "public"."putt_details" OWNER TO "postgres";
