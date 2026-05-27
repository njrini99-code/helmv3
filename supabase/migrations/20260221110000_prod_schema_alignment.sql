-- ============================================================================
-- Migration: 20260221110000_prod_schema_alignment.sql
-- Purpose: align source migration history with live prod schema.
--
-- Drift discovered 2026-05-27 by comparing pg_dump of qmnssrrolpinvwjjnufo
-- (Helm-Production) against a parsed reconstruction of supabase/migrations/.
--
-- Adds 217 columns across 53 tables
-- Adds 5 tables that exist in prod but were never in source
--
-- SKIPPED 1 columns across 1 tables because their
-- CREATE TABLE happens AFTER this migration's slot — those columns are not
-- referenced by source migrations, so they do not break replay. Address them
-- in a follow-up alignment placed after the latest CREATE TABLE.
--
-- Everything is idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
-- Safe to re-run. Safe to apply against environments that already have
-- some/all of the columns.
-- ============================================================================

BEGIN;

-- ----- Tables present in prod but never CREATEd in source -----
-- table: admin_analytics_events
CREATE TABLE IF NOT EXISTS public.admin_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    page_path text,
    feature_name text,
    metadata jsonb DEFAULT '{}'::jsonb,
    session_id text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_analytics_events_event_type_check CHECK ((event_type = ANY (ARRAY['page_view'::text, 'feature_use'::text, 'session_start'::text, 'session_end'::text])))
);

-- table: admin_api_perf_log
CREATE TABLE IF NOT EXISTS public.admin_api_perf_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_name text NOT NULL,
    duration_ms integer NOT NULL,
    status text NOT NULL,
    error_message text,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_api_perf_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text])))
);

-- table: admin_client_errors
CREATE TABLE IF NOT EXISTS public.admin_client_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    error_message text NOT NULL,
    error_stack text,
    page_url text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: golf_player_notification_state
CREATE TABLE IF NOT EXISTS public.golf_player_notification_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    last_announcements_seen_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_travel_seen_at timestamp with time zone DEFAULT now(),
    prefs jsonb DEFAULT '{"goal_missed": {"push": false, "email": false, "in_app": true}, "new_insight": {"push": false, "email": false, "in_app": true}, "goal_achieved": {"push": true, "email": false, "in_app": true}, "weekly_digest": {"push": false, "email": true, "in_app": false}, "coach_commented": {"push": true, "email": false, "in_app": true}, "composite_insight": {"push": true, "email": false, "in_app": true}, "round_review_ready": {"push": true, "email": false, "in_app": true}, "coach_assigned_goal": {"push": true, "email": false, "in_app": true}, "engine_suggested_goal": {"push": false, "email": false, "in_app": true}, "standing_percentile_changed": {"push": false, "email": false, "in_app": false}}'::jsonb NOT NULL,
    quiet_mode boolean DEFAULT false NOT NULL
);

-- table: golf_team_coach_staff
CREATE TABLE IF NOT EXISTS public.golf_team_coach_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    role text DEFAULT 'head_coach'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- ----- Missing columns -----
-- table: baseball_academic_eligibility (+3 cols)
ALTER TABLE public.baseball_academic_eligibility ADD COLUMN IF NOT EXISTS "academic_standing" text;
ALTER TABLE public.baseball_academic_eligibility ADD COLUMN IF NOT EXISTS "team_id" uuid;
ALTER TABLE public.baseball_academic_eligibility ADD COLUMN IF NOT EXISTS "updated_by" uuid;

-- table: baseball_camp_registrations (+1 cols)
ALTER TABLE public.baseball_camp_registrations ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'pending'::text;

-- table: baseball_camps (+2 cols)
ALTER TABLE public.baseball_camps ADD COLUMN IF NOT EXISTS "is_free" boolean DEFAULT false;
ALTER TABLE public.baseball_camps ADD COLUMN IF NOT EXISTS "price_cents" integer;

-- table: baseball_coach_insights (+1 cols)
ALTER TABLE public.baseball_coach_insights ADD COLUMN IF NOT EXISTS "body" text;

-- table: baseball_coach_philosophy (+8 cols)
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "bubble_zone_range" numeric DEFAULT 1.5;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "looking_for_defense" text;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "looking_for_intangibles" text;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "looking_for_offense" text;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "priority_defense" integer DEFAULT 5;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "priority_plate_discipline" integer DEFAULT 3;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "priority_power" integer DEFAULT 2;
ALTER TABLE public.baseball_coach_philosophy ADD COLUMN IF NOT EXISTS "program_values" text;

-- table: baseball_coaches (+3 cols)
ALTER TABLE public.baseball_coaches ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE public.baseball_coaches ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public.baseball_coaches ADD COLUMN IF NOT EXISTS "title" text;

-- table: baseball_document_versions (+4 cols)
ALTER TABLE public.baseball_document_versions ADD COLUMN IF NOT EXISTS "change_notes" text;
ALTER TABLE public.baseball_document_versions ADD COLUMN IF NOT EXISTS "file_size" integer;
ALTER TABLE public.baseball_document_versions ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE public.baseball_document_versions ADD COLUMN IF NOT EXISTS "storage_path" text;

-- table: baseball_documents (+1 cols)
ALTER TABLE public.baseball_documents ADD COLUMN IF NOT EXISTS "folder" text;

-- table: baseball_events (+10 cols)
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "created_by_id" uuid;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "is_mandatory" boolean DEFAULT false;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "is_recurring" boolean DEFAULT false;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "max_attendees" integer;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "recurrence_rule" text;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "recurring" boolean DEFAULT false;
ALTER TABLE public.baseball_events ADD COLUMN IF NOT EXISTS "rsvp_deadline" timestamp with time zone;

-- table: baseball_player_aggregates (+6 cols)
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT extensions.uuid_generate_v4();
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "last_session_at" timestamp with time zone;
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "total_at_bats" integer DEFAULT 0;
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "total_hits" integer DEFAULT 0;
ALTER TABLE public.baseball_player_aggregates ADD COLUMN IF NOT EXISTS "trend_data" jsonb DEFAULT '{}'::jsonb;

-- table: baseball_player_classes (+2 cols)
ALTER TABLE public.baseball_player_classes ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public.baseball_player_classes ADD COLUMN IF NOT EXISTS "team_id" uuid;

-- table: baseball_player_comparisons (+1 cols)
ALTER TABLE public.baseball_player_comparisons ADD COLUMN IF NOT EXISTS "notes" text;

-- table: baseball_player_settings (+9 cols)
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "notify_messages" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "notify_profile_views" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "notify_team_activity" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "notify_watchlist_adds" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "profile_visibility" text DEFAULT 'public'::text;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "push_notifications" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "show_academics" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "show_dream_schools" boolean DEFAULT true;
ALTER TABLE public.baseball_player_settings ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Chicago'::text;

-- table: baseball_players (+2 cols)
ALTER TABLE public.baseball_players ADD COLUMN IF NOT EXISTS "high_school_city" text;
ALTER TABLE public.baseball_players ADD COLUMN IF NOT EXISTS "high_school_state" text;

-- table: baseball_stat_uploads (+3 cols)
ALTER TABLE public.baseball_stat_uploads ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE public.baseball_stat_uploads ADD COLUMN IF NOT EXISTS "processed_count" integer DEFAULT 0;
ALTER TABLE public.baseball_stat_uploads ADD COLUMN IF NOT EXISTS "row_count" integer;

-- table: baseball_team_coach_staff (+1 cols)
ALTER TABLE public.baseball_team_coach_staff ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();

-- table: baseball_team_members (+4 cols)
ALTER TABLE public.baseball_team_members ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
ALTER TABLE public.baseball_team_members ADD COLUMN IF NOT EXISTS "approved_by" uuid;
ALTER TABLE public.baseball_team_members ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.baseball_team_members ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

-- table: baseball_travel_expenses (+6 cols)
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "expense_date" date;
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "receipt_url" text;
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "team_id" uuid;
ALTER TABLE public.baseball_travel_expenses ADD COLUMN IF NOT EXISTS "vendor_name" text;

-- table: baseball_travel_itineraries (+1 cols)
ALTER TABLE public.baseball_travel_itineraries ADD COLUMN IF NOT EXISTS "created_by" uuid;

-- table: baseball_videos (+2 cols)
ALTER TABLE public.baseball_videos ADD COLUMN IF NOT EXISTS "team_id" uuid;
ALTER TABLE public.baseball_videos ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

-- table: crm_coaches (+1 cols)
ALTER TABLE public.crm_coaches ADD COLUMN IF NOT EXISTS "athletics_url" text;

-- table: golf_coach_blocked_time (+2 cols)
ALTER TABLE public.golf_coach_blocked_time ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
ALTER TABLE public.golf_coach_blocked_time ADD COLUMN IF NOT EXISTS "description" text;

-- table: golf_coach_insights (+5 cols)
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS "addressed_at" timestamp with time zone;
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS "lifecycle_state" text DEFAULT 'detected'::text;
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS "signature" text;

-- table: golf_coach_philosophy (+2 cols)
ALTER TABLE public.golf_coach_philosophy ADD COLUMN IF NOT EXISTS "coaching_philosophy" text;
ALTER TABLE public.golf_coach_philosophy ADD COLUMN IF NOT EXISTS "expectations" text;

-- table: golf_coaches (+1 cols)
ALTER TABLE public.golf_coaches ADD COLUMN IF NOT EXISTS "bio" text;

-- table: golf_coachhelm_settings (+8 cols)
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "auto_insights" boolean DEFAULT true;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "coach_id" uuid;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "focus_areas" text[] DEFAULT '{}'::text[];
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "insight_frequency" text DEFAULT 'daily'::text;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "min_rounds_for_insights" integer DEFAULT 3;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "team_id" uuid;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "trend_alerts" boolean DEFAULT true;
ALTER TABLE public.golf_coachhelm_settings ADD COLUMN IF NOT EXISTS "weekly_summary" boolean DEFAULT true;

-- table: golf_conversations (+2 cols)
ALTER TABLE public.golf_conversations ADD COLUMN IF NOT EXISTS "is_team_channel" boolean DEFAULT false;
ALTER TABLE public.golf_conversations ADD COLUMN IF NOT EXISTS "is_team_chat" boolean DEFAULT false;

-- table: golf_courses (+2 cols)
ALTER TABLE public.golf_courses ADD COLUMN IF NOT EXISTS "holes" integer DEFAULT 18;
ALTER TABLE public.golf_courses ADD COLUMN IF NOT EXISTS "par" integer;

-- table: golf_document_versions (+3 cols)
ALTER TABLE public.golf_document_versions ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE public.golf_document_versions ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE public.golf_document_versions ADD COLUMN IF NOT EXISTS "storage_path" text;

-- table: golf_documents (+1 cols)
ALTER TABLE public.golf_documents ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false;

-- table: golf_event_attendance (+3 cols)
ALTER TABLE public.golf_event_attendance ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public.golf_event_attendance ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;
ALTER TABLE public.golf_event_attendance ADD COLUMN IF NOT EXISTS "rsvp_at" timestamp with time zone;

-- table: golf_events (+6 cols)
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "course_id" uuid;
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "parent_event_id" uuid;
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "recurrence_rule" text;
ALTER TABLE public.golf_events ADD COLUMN IF NOT EXISTS "recurring" boolean DEFAULT false;

-- table: golf_holes (+3 cols)
ALTER TABLE public.golf_holes ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_holes ADD COLUMN IF NOT EXISTS "gir" boolean;
ALTER TABLE public.golf_holes ADD COLUMN IF NOT EXISTS "penalty_strokes" integer DEFAULT 0;

-- table: golf_learned_behavior (+6 cols)
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "entity_id" uuid;
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "entity_type" text;
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "interaction_type" text;
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "target_type" text;
ALTER TABLE public.golf_learned_behavior ADD COLUMN IF NOT EXISTS "timestamp" timestamp with time zone DEFAULT now();

-- table: golf_messages (+1 cols)
ALTER TABLE public.golf_messages ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false;

-- table: golf_patterns_v2 (+12 cols)
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "actionability" numeric DEFAULT 0;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "conviction" numeric DEFAULT 1;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "dismissed_reason" text;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "first_detected" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "last_occurrence" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "lift" numeric DEFAULT 1;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "outcome" jsonb;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "sample_size" integer DEFAULT 0;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "stroke_impact" numeric DEFAULT 0;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "support" numeric DEFAULT 0;
ALTER TABLE public.golf_patterns_v2 ADD COLUMN IF NOT EXISTS "trend" text;

-- table: golf_player_classes (+7 cols)
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "building" text;
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "color" text;
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "credits" integer;
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "days" text[];
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "room" text;
ALTER TABLE public.golf_player_classes ADD COLUMN IF NOT EXISTS "team_id" uuid;

-- table: golf_player_focus_areas (+4 cols)
ALTER TABLE public.golf_player_focus_areas ADD COLUMN IF NOT EXISTS "from_insight_id" uuid;
ALTER TABLE public.golf_player_focus_areas ADD COLUMN IF NOT EXISTS "progress_notes" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.golf_player_focus_areas ADD COLUMN IF NOT EXISTS "review_context" text;
ALTER TABLE public.golf_player_focus_areas ADD COLUMN IF NOT EXISTS "team_id" uuid;

-- table: golf_player_notification_state (+6 cols)
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "last_announcements_seen_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "last_travel_seen_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "player_id" uuid;
ALTER TABLE public.golf_player_notification_state ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

-- table: golf_players (+2 cols)
ALTER TABLE public.golf_players ADD COLUMN IF NOT EXISTS "handicap_index" numeric;
ALTER TABLE public.golf_players ADD COLUMN IF NOT EXISTS "high_school_name" text;

-- table: golf_predictions (+11 cols)
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "confidence_interval_high" numeric;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "confidence_interval_low" numeric;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "due_date" date;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "input_features" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "key_drivers" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "metric" text;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "model_version" text DEFAULT 'v2'::text;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "prediction_window_days" integer DEFAULT 30;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "trend" text;
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_predictions ADD COLUMN IF NOT EXISTS "was_accurate" boolean;

-- table: golf_qualifier_entries (+3 cols)
ALTER TABLE public.golf_qualifier_entries ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public.golf_qualifier_entries ADD COLUMN IF NOT EXISTS "round_id" uuid;
ALTER TABLE public.golf_qualifier_entries ADD COLUMN IF NOT EXISTS "score" integer;

-- table: golf_qualifiers (+2 cols)
ALTER TABLE public.golf_qualifiers ADD COLUMN IF NOT EXISTS "entry_deadline" date;
ALTER TABLE public.golf_qualifiers ADD COLUMN IF NOT EXISTS "rules" text;

-- table: golf_round_reviews (+9 cols)
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "action_items" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "coach_feedback_text" text;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "coach_rating" integer;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "generation_method" text DEFAULT 'v1'::text;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "player_acknowledged_at" timestamp with time zone;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "player_viewed_at" timestamp with time zone;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "published_by" uuid;
ALTER TABLE public.golf_round_reviews ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;

-- table: golf_rounds (+13 cols)
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "ai_recap_generated_at" timestamp with time zone;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "back_nine" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "coachhelm_failed_at" timestamp with time zone;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "coachhelm_failure_reason" text;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "current_hole" integer DEFAULT 1;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "front_nine" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "qualifier_round_number" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "score_to_par" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'in_progress'::text;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "total_fairways" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "total_fairways_hit" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "total_gir" integer;
ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS "total_gir_possible" integer;

-- table: golf_shots (+7 cols)
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "distance_unit" text DEFAULT 'yards'::text;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "hole_number" integer;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "lie_before" text;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "putt_break" text;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "putt_slope" text;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "round_id" uuid;
ALTER TABLE public.golf_shots ADD COLUMN IF NOT EXISTS "shot_type" text;

-- table: golf_task_assignments (+3 cols)
ALTER TABLE public.golf_task_assignments ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_task_assignments ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_task_assignments ADD COLUMN IF NOT EXISTS "upload_url" text;

-- table: golf_tasks (+5 cols)
ALTER TABLE public.golf_tasks ADD COLUMN IF NOT EXISTS "assigned_by" uuid;
ALTER TABLE public.golf_tasks ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE public.golf_tasks ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'medium'::text;
ALTER TABLE public.golf_tasks ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending'::text;
ALTER TABLE public.golf_tasks ADD COLUMN IF NOT EXISTS "task_type" text;

-- table: golf_team_coachhelm_settings (+1 cols)
ALTER TABLE public.golf_team_coachhelm_settings ADD COLUMN IF NOT EXISTS "disabled_by" uuid;

-- table: golf_team_members (+2 cols)
ALTER TABLE public.golf_team_members ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
ALTER TABLE public.golf_team_members ADD COLUMN IF NOT EXISTS "approved_by" uuid;

-- table: golf_teams (+6 cols)
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "primary_color" text;
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "secondary_color" text;
ALTER TABLE public.golf_teams ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/New_York'::text;

-- table: golf_validations (+6 cols)
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "actual_value" numeric;
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "calibration_bucket" text;
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "predicted_value" numeric;
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "stated_confidence" numeric;
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "validated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.golf_validations ADD COLUMN IF NOT EXISTS "was_correct" boolean;

-- table: notifications (+2 cols)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "data" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;

COMMIT;

-- ----- DEFERRED TO FOLLOW-UP (tables created AFTER this slot) -----
--   crm_email_templates (created in 20260313000000_crm_enhancements.sql) — missing 1 cols: format
