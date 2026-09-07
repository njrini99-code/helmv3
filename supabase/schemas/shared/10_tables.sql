CREATE TABLE IF NOT EXISTS "public"."admin_allowlist" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."admin_allowlist" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."admin_analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "page_path" "text",
    "feature_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "session_id" "text",
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_analytics_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['page_view'::"text", 'feature_use'::"text", 'session_start'::"text", 'session_end'::"text"])))
);

ALTER TABLE "public"."admin_analytics_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."admin_api_perf_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_name" "text" NOT NULL,
    "duration_ms" integer NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_api_perf_log_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."admin_api_perf_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."admin_client_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "error_message" "text" NOT NULL,
    "error_stack" "text",
    "page_url" "text",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."admin_client_errors" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."admin_error_resolutions" (
    "fingerprint" "text" NOT NULL,
    "resolved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_by" "uuid",
    "resolution_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "pr_number" integer,
    "pr_url" "text",
    "fixed_in_sha" "text",
    "last_seen_at_resolution" timestamp with time zone,
    "note" "text",
    "reopened_at" timestamp with time zone,
    "reopened_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_error_resolutions_fixed_in_sha_check" CHECK ((("fixed_in_sha" IS NULL) OR ("fixed_in_sha" ~ '^[0-9a-f]{7,40}$'::"text"))),
    CONSTRAINT "admin_error_resolutions_pr_number_check" CHECK ((("pr_number" IS NULL) OR ("pr_number" > 0))),
    CONSTRAINT "admin_error_resolutions_reopened_count_check" CHECK (("reopened_count" >= 0)),
    CONSTRAINT "admin_error_resolutions_resolution_source_check" CHECK (("resolution_source" = ANY (ARRAY['auto'::"text", 'manual'::"text"])))
);

ALTER TABLE "public"."admin_error_resolutions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."admin_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "public"."admin_event_severity" DEFAULT 'info'::"public"."admin_event_severity" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "user_id" "uuid",
    "user_email" "text",
    "url" "text",
    "stack_trace" "text",
    "browser_info" "jsonb",
    "resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sport" "text",
    "team_id" "uuid",
    "fingerprint" "text",
    "source" "text",
    "feature" "text"
);

ALTER TABLE "public"."admin_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."api_call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route" "text" NOT NULL,
    "method" "text" DEFAULT 'POST'::"text",
    "request_count" integer DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "avg_duration_ms" integer DEFAULT 0,
    "p50_ms" integer DEFAULT 0,
    "p95_ms" integer DEFAULT 0,
    "p99_ms" integer DEFAULT 0,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."api_call_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."audit_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."auth_metrics_hourly" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hour" timestamp with time zone NOT NULL,
    "successful_logins" integer DEFAULT 0,
    "failed_logins" integer DEFAULT 0,
    "active_sessions" integer DEFAULT 0,
    "new_sessions" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."auth_metrics_hourly" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."auth_rate_limits" (
    "key" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."auth_rate_limits" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."background_job_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" "text" NOT NULL,
    "job_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "duration_ms" integer,
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "metadata" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);

ALTER TABLE "public"."background_job_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."backup_ci_junk_rounds_20260821" (
    "id" "uuid",
    "player_id" "uuid",
    "team_id" "uuid",
    "course_id" "uuid",
    "course_name" "text",
    "course_city" "text",
    "course_state" "text",
    "course_rating" numeric,
    "course_slope" integer,
    "tees_played" "text",
    "round_date" "date",
    "round_type" "text",
    "holes_played" integer,
    "total_score" integer,
    "front_nine" integer,
    "back_nine" integer,
    "score_to_par" integer,
    "status" "text",
    "current_hole" integer,
    "total_putts" integer,
    "total_fairways_hit" integer,
    "total_fairways" integer,
    "total_gir" integer,
    "total_gir_possible" integer,
    "weather_conditions" "text",
    "notes" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "strokes_gained_total" numeric(5,2),
    "strokes_gained_tee" numeric(5,2),
    "strokes_gained_approach" numeric(5,2),
    "strokes_gained_around_green" numeric(5,2),
    "strokes_gained_putting" numeric(5,2),
    "qualifier_id" "uuid",
    "qualifier_round_number" integer,
    "draft_data" "jsonb",
    "total_penalties" integer,
    "ai_recap" "text",
    "ai_recap_generated_at" timestamp with time zone,
    "coachhelm_analyzed_at" timestamp with time zone,
    "coachhelm_failed_at" timestamp with time zone,
    "coachhelm_failure_reason" "text",
    "tee_id" "uuid"
);

ALTER TABLE "public"."backup_ci_junk_rounds_20260821" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."backup_class_semester_20260813" (
    "id" "uuid",
    "player_id" "uuid",
    "class_name" "text",
    "semester" "text",
    "updated_at" timestamp with time zone
);

ALTER TABLE "public"."backup_class_semester_20260813" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."backup_prevyear_classes_20260821" (
    "id" "uuid",
    "player_id" "uuid",
    "team_id" "uuid",
    "class_name" "text",
    "instructor" "text",
    "days" "text"[],
    "start_time" time without time zone,
    "end_time" time without time zone,
    "building" "text",
    "room" "text",
    "credits" integer,
    "color" "text",
    "notes" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "semester" "text"
);

ALTER TABLE "public"."backup_prevyear_classes_20260821" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "organization_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."billing_customers" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_invoice_id" "text" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "organization_id" "uuid",
    "customer_email" "text",
    "status" "text" NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "total" bigint DEFAULT 0 NOT NULL,
    "amount_paid" bigint DEFAULT 0 NOT NULL,
    "tax" bigint,
    "hosted_invoice_url" "text",
    "invoice_pdf" "text",
    "memo" "text",
    "created_by" "uuid",
    "finalized_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."billing_invoices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_event" "text" NOT NULL,
    "conditions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "actions" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "priority" smallint DEFAULT 100 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_automations_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 120))),
    CONSTRAINT "crm_automations_trigger_event_check" CHECK (("trigger_event" = ANY (ARRAY['email.opened'::"text", 'email.clicked'::"text", 'email.bounced'::"text", 'email.complained'::"text", 'email.unsubscribed'::"text", 'email.replied'::"text", 'status_change.engaged'::"text", 'status_change.contacted'::"text", 'no_contact_30d'::"text"])))
);

ALTER TABLE "public"."crm_automations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "title" "text",
    "email" "text",
    "phone" "text",
    "school" "text" NOT NULL,
    "conference" "text",
    "division" "public"."ncaa_division" NOT NULL,
    "program" "public"."program_type" DEFAULT 'both'::"public"."program_type" NOT NULL,
    "priority" integer DEFAULT 0,
    "highlight_color" "text",
    "is_starred" boolean DEFAULT false,
    "notes" "text",
    "internal_comments" "text",
    "tags" "text"[],
    "team_size" integer,
    "current_software" "text",
    "budget_range" "text",
    "decision_timeline" "text",
    "pain_points" "text"[],
    "best_contact_method" "text",
    "best_contact_time" "text",
    "timezone" "text",
    "last_contacted_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "status" "public"."coach_status" DEFAULT 'new_lead'::"public"."coach_status" NOT NULL,
    "source" "text",
    "is_archived" boolean DEFAULT false,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "athletics_url" "text",
    "last_email_event_type" "text",
    "last_email_event_at" timestamp with time zone,
    "email_status" "public"."email_status" DEFAULT 'valid'::"public"."email_status" NOT NULL,
    "role_level" "text",
    "is_primary_contact" boolean DEFAULT false NOT NULL,
    "assigned_to" "text"
);

ALTER TABLE "public"."crm_coaches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_contact_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "contact_type" "public"."contact_type" NOT NULL,
    "contact_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject" "text",
    "notes" "text",
    "next_action" "text",
    "next_action_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "resend_message_id" "text",
    "metadata" "jsonb"
);

ALTER TABLE "public"."crm_contact_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "contact_log_id" "uuid",
    "thread_id" "text",
    "message_id" "text" NOT NULL,
    "in_reply_to" "text",
    "from_address" "text" NOT NULL,
    "to_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subject" "text",
    "body_text" "text",
    "body_html" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_payload" "jsonb",
    "is_read" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."crm_replies" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_log_id" "uuid",
    "resend_message_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "recipient_email" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "coach_id" "uuid"
);

ALTER TABLE "public"."email_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_email_suppressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "public"."citext" NOT NULL,
    "reason" "text" NOT NULL,
    "source" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "suppressed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suppressed_by" "uuid",
    CONSTRAINT "crm_email_suppressions_reason_check" CHECK (("reason" = ANY (ARRAY['unsubscribed'::"text", 'hard_bounce'::"text", 'complained'::"text", 'manual'::"text", 'invalid'::"text"]))),
    CONSTRAINT "crm_email_suppressions_source_check" CHECK (("source" = ANY (ARRAY['resend_webhook'::"text", 'admin'::"text", 'import'::"text", 'system'::"text"])))
);

ALTER TABLE "public"."crm_email_suppressions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "merge_tags" "text"[] DEFAULT '{}'::"text"[],
    "is_default" boolean DEFAULT false,
    "usage_count" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "format" "text" DEFAULT 'plain'::"text" NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "crm_email_templates_category_check" CHECK (("category" = ANY (ARRAY['intro'::"text", 'follow_up'::"text", 'demo_invite'::"text", 'proposal'::"text", 'check_in'::"text", 'general'::"text", 'cold_outreach'::"text", 'active_conversation'::"text", 're_engage'::"text", 'close'::"text", 'post_close'::"text"]))),
    CONSTRAINT "crm_email_templates_format_check" CHECK (("format" = ANY (ARRAY['plain'::"text", 'html'::"text", 'text'::"text"])))
);

ALTER TABLE "public"."crm_email_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_email_templates_backup_20260720" (
    "id" "uuid",
    "name" "text",
    "subject" "text",
    "body" "text",
    "category" "text",
    "merge_tags" "text"[],
    "is_default" boolean,
    "usage_count" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "format" "text",
    "last_used_at" timestamp with time zone
);

ALTER TABLE "public"."crm_email_templates_backup_20260720" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "public"."crm_event_type" DEFAULT 'follow_up'::"public"."crm_event_type" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "all_day" boolean DEFAULT false,
    "location" "text",
    "meeting_url" "text",
    "coach_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text",
    "completed_at" timestamp with time zone,
    "notes" "text",
    "outcome" "text",
    "google_event_id" "text",
    "google_calendar_id" "text",
    "google_sync_status" "text" DEFAULT 'pending'::"text",
    "google_last_synced_at" timestamp with time zone,
    "is_recurring" boolean DEFAULT false,
    "recurrence_rule" "text",
    "parent_event_id" "uuid",
    "reminder_sent" boolean DEFAULT false,
    "reminder_time" integer DEFAULT 30,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);

ALTER TABLE "public"."crm_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_google_calendar_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "token_type" "text" DEFAULT 'Bearer'::"text",
    "expires_at" timestamp with time zone NOT NULL,
    "scope" "text",
    "calendar_id" "text" DEFAULT 'primary'::"text",
    "calendar_name" "text",
    "is_active" boolean DEFAULT true,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."crm_google_calendar_tokens" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "kind" "text" DEFAULT 'note'::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_notes_body_check" CHECK (("length"("body") <= 8000)),
    CONSTRAINT "crm_notes_kind_check" CHECK (("kind" = ANY (ARRAY['note'::"text", 'call_log'::"text", 'meeting_summary'::"text", 'internal'::"text"])))
);

ALTER TABLE "public"."crm_notes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "definition" "jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "is_shared" boolean DEFAULT true NOT NULL,
    "pin_order" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_segments_description_check" CHECK ((("description" IS NULL) OR ("length"("description") <= 500))),
    CONSTRAINT "crm_segments_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 80)))
);

ALTER TABLE "public"."crm_segments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_sequence_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_step" smallint DEFAULT 0 NOT NULL,
    "next_send_at" timestamp with time zone,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "stopped_at" timestamp with time zone,
    "stop_reason" "text",
    "enrolled_by" "uuid" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "crm_sequence_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text", 'stopped'::"text"]))),
    CONSTRAINT "crm_sequence_enrollments_stop_reason_check" CHECK ((("stop_reason" IS NULL) OR ("stop_reason" = ANY (ARRAY['replied'::"text", 'unsubscribed'::"text", 'bounced'::"text", 'manual'::"text", 'sequence_completed'::"text"]))))
);

ALTER TABLE "public"."crm_sequence_enrollments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_sequence_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "step_order" smallint NOT NULL,
    "delay_hours" integer DEFAULT 0 NOT NULL,
    "template_id" "uuid",
    "subject_override" "text",
    "body_override" "text",
    "condition" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_sequence_steps_delay_hours_check" CHECK (("delay_hours" >= 0)),
    CONSTRAINT "crm_sequence_steps_step_order_check" CHECK (("step_order" > 0))
);

ALTER TABLE "public"."crm_sequence_steps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_kind" "text" DEFAULT 'manual'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_sequences_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 120))),
    CONSTRAINT "crm_sequences_trigger_kind_check" CHECK (("trigger_kind" = ANY (ARRAY['manual'::"text", 'status_change'::"text", 'segment_match'::"text"])))
);

ALTER TABLE "public"."crm_sequences" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_stage_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid",
    "source" "text" DEFAULT 'app'::"text" NOT NULL
);

ALTER TABLE "public"."crm_stage_transitions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "assignee_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "kind" "text" DEFAULT 'general'::"text",
    "source" "text" DEFAULT 'manual'::"text",
    "reminder_at" timestamp with time zone,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_tasks_description_check" CHECK ((("description" IS NULL) OR ("length"("description") <= 2000))),
    CONSTRAINT "crm_tasks_kind_check" CHECK (("kind" = ANY (ARRAY['general'::"text", 'follow_up'::"text", 'call'::"text", 'demo'::"text", 'email'::"text", 'research'::"text"]))),
    CONSTRAINT "crm_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "crm_tasks_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'automation'::"text", 'sequence'::"text", 'ai_suggestion'::"text"]))),
    CONSTRAINT "crm_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "crm_tasks_title_check" CHECK (("length"("title") <= 200))
);

ALTER TABLE "public"."crm_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_unmatched_inbound" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text" NOT NULL,
    "thread_id" "text",
    "from_address" "text" NOT NULL,
    "to_addresses" "text"[],
    "subject" "text",
    "body_text" "text",
    "body_html" "text",
    "received_at" timestamp with time zone NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "promoted_coach_id" "uuid",
    "reviewed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."crm_unmatched_inbound" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."demo_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "organization" "text",
    "phone" "text",
    "interest_type" "text",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "contacted_by" "text",
    "contacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source" "text",
    "referer" "text",
    "ip" "text",
    "user_agent" "text",
    "country" "text",
    "city" "text",
    "crm_coach_id" "uuid",
    CONSTRAINT "demo_requests_interest_type_check" CHECK (("interest_type" = ANY (ARRAY['baseball_coach'::"text", 'baseball_player'::"text", 'golf_coach'::"text", 'golf_player'::"text", 'organization'::"text", 'other'::"text"]))),
    CONSTRAINT "demo_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'contacted'::"text", 'scheduled'::"text", 'completed'::"text", 'declined'::"text"])))
);

ALTER TABLE "public"."demo_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_name" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_push_at" timestamp with time zone,
    "failed_count" integer DEFAULT 0,
    CONSTRAINT "device_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);

ALTER TABLE "public"."device_tokens" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."email_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_event_id" "uuid" NOT NULL,
    "resend_message_id" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "clicked_url" "text",
    "user_agent" "text",
    "ip_address" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."email_clicks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."emails" (
    "resend_message_id" "text" NOT NULL,
    "from_address" "text",
    "to_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subject" "text",
    "tags" "jsonb",
    "contact_log_id" "uuid",
    "source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "delivery_delayed_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "complained_at" timestamp with time zone,
    "last_event_type" "text",
    "last_event_at" timestamp with time zone,
    "open_count" integer DEFAULT 0 NOT NULL,
    "click_count" integer DEFAULT 0 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."emails" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message" "text" NOT NULL,
    "severity" "text" DEFAULT 'error'::"text",
    "stack" "text",
    "context" "jsonb",
    "user_agent" "text",
    "ip" "text",
    "url" "text",
    "user_id" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "error_logs_severity_check" CHECK (("severity" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"])))
);

ALTER TABLE "public"."error_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."error_rate_hourly" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hour" timestamp with time zone NOT NULL,
    "total_errors" integer DEFAULT 0,
    "critical_errors" integer DEFAULT 0,
    "user_facing_errors" integer DEFAULT 0,
    "internal_errors" integer DEFAULT 0,
    "affected_users" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."error_rate_hourly" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."login_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "failed_attempts" integer DEFAULT 0,
    "last_attempt" timestamp with time zone DEFAULT "now"(),
    "last_ip" "text",
    "last_user_agent" "text",
    "locked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."login_attempts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "action_url" "text"
);

ALTER TABLE "public"."notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."organization_type" NOT NULL,
    "division" "text",
    "conference" "text",
    "location_city" "text",
    "location_state" "text",
    "logo_url" "text",
    "banner_url" "text",
    "website_url" "text",
    "description" "text",
    "primary_color" "text" DEFAULT '#16A34A'::"text",
    "secondary_color" "text" DEFAULT '#FFFFFF'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."organizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "expiration_time" timestamp with time zone,
    "keys" "jsonb" NOT NULL,
    "user_agent" "text",
    "device_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_push_at" timestamp with time zone,
    "failed_count" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."schema_migrations_pruned_20260820" (
    "version" "text" NOT NULL,
    "statements" "text"[],
    "name" "text",
    "created_by" "text",
    "idempotency_key" "text",
    "rollback" "text"[],
    "pruned_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."schema_migrations_pruned_20260820" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notification_preferences" "jsonb" DEFAULT '{"push_events": true, "push_enabled": true, "push_messages": true, "email_messages": true, "digest_frequency": "daily", "email_announcements": true, "email_profile_views": false, "email_event_reminders": true, "email_pipeline_updates": true}'::"jsonb",
    "last_seen" timestamp with time zone
);

ALTER TABLE "public"."users" OWNER TO "postgres";
