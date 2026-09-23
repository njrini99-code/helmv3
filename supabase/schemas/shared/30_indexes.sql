CREATE INDEX "admin_api_perf_log_user_id_idx" ON "public"."admin_api_perf_log" USING "btree" ("user_id");

CREATE INDEX "admin_client_errors_user_id_idx" ON "public"."admin_client_errors" USING "btree" ("user_id");

CREATE INDEX "billing_invoices_organization_id_idx" ON "public"."billing_invoices" USING "btree" ("organization_id");

CREATE INDEX "billing_invoices_status_idx" ON "public"."billing_invoices" USING "btree" ("status");

CREATE INDEX "billing_invoices_stripe_customer_id_idx" ON "public"."billing_invoices" USING "btree" ("stripe_customer_id");

CREATE INDEX "crm_automations_created_by_idx" ON "public"."crm_automations" USING "btree" ("created_by");

CREATE INDEX "crm_coaches_archived_by_idx" ON "public"."crm_coaches" USING "btree" ("archived_by");

CREATE INDEX "crm_email_suppressions_suppressed_by_idx" ON "public"."crm_email_suppressions" USING "btree" ("suppressed_by");

CREATE INDEX "crm_email_templates_created_by_idx" ON "public"."crm_email_templates" USING "btree" ("created_by");

CREATE INDEX "crm_notes_author_id_idx" ON "public"."crm_notes" USING "btree" ("author_id");

CREATE INDEX "crm_replies_contact_log_id_idx" ON "public"."crm_replies" USING "btree" ("contact_log_id");

CREATE INDEX "crm_sequence_enrollments_enrolled_by_idx" ON "public"."crm_sequence_enrollments" USING "btree" ("enrolled_by");

CREATE INDEX "crm_sequence_steps_template_id_idx" ON "public"."crm_sequence_steps" USING "btree" ("template_id");

CREATE INDEX "crm_sequences_created_by_idx" ON "public"."crm_sequences" USING "btree" ("created_by");

CREATE INDEX "crm_tasks_created_by_idx" ON "public"."crm_tasks" USING "btree" ("created_by");

CREATE INDEX "email_clicks_email_event_id_idx" ON "public"."email_clicks" USING "btree" ("email_event_id");

CREATE INDEX "idx_admin_analytics_events_created" ON "public"."admin_analytics_events" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_admin_error_resolutions_reopened" ON "public"."admin_error_resolutions" USING "btree" ("reopened_at" DESC) WHERE ("reopened_at" IS NOT NULL);

CREATE INDEX "idx_admin_error_resolutions_resolved_at" ON "public"."admin_error_resolutions" USING "btree" ("resolved_at" DESC);

CREATE INDEX "idx_admin_events_created" ON "public"."admin_events" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_admin_events_dashboard" ON "public"."admin_events" USING "btree" ("event_type", "severity", "created_at" DESC);

CREATE INDEX "idx_admin_events_errors_only" ON "public"."admin_events" USING "btree" ("created_at" DESC) WHERE ("event_type" = 'error'::"text");

CREATE INDEX "idx_admin_events_feature_created" ON "public"."admin_events" USING "btree" ("feature", "created_at" DESC) WHERE ("feature" IS NOT NULL);

CREATE INDEX "idx_admin_events_feature_unresolved" ON "public"."admin_events" USING "btree" ("feature", "severity") WHERE ((NOT "resolved") AND ("feature" IS NOT NULL));

CREATE INDEX "idx_admin_events_fingerprint" ON "public"."admin_events" USING "btree" ("fingerprint", "created_at" DESC) WHERE ("fingerprint" IS NOT NULL);

CREATE INDEX "idx_admin_events_resolved_by" ON "public"."admin_events" USING "btree" ("resolved_by") WHERE ("resolved_by" IS NOT NULL);

CREATE INDEX "idx_admin_events_severity" ON "public"."admin_events" USING "btree" ("severity");

CREATE INDEX "idx_admin_events_severity_created" ON "public"."admin_events" USING "btree" ("severity", "created_at" DESC);

CREATE INDEX "idx_admin_events_source_created" ON "public"."admin_events" USING "btree" ("source", "created_at" DESC) WHERE ("source" IS NOT NULL);

CREATE INDEX "idx_admin_events_team" ON "public"."admin_events" USING "btree" ("team_id", "created_at" DESC) WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_admin_events_type" ON "public"."admin_events" USING "btree" ("event_type");

CREATE INDEX "idx_admin_events_unresolved" ON "public"."admin_events" USING "btree" ("resolved", "severity", "created_at" DESC) WHERE (NOT "resolved");

CREATE INDEX "idx_admin_events_unresolved_fingerprint" ON "public"."admin_events" USING "btree" ("fingerprint", "severity") WHERE ((NOT "resolved") AND ("fingerprint" IS NOT NULL));

CREATE INDEX "idx_admin_events_user" ON "public"."admin_events" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_analytics_events_event_type" ON "public"."admin_analytics_events" USING "btree" ("event_type");

CREATE INDEX "idx_analytics_events_page_path" ON "public"."admin_analytics_events" USING "btree" ("page_path");

CREATE INDEX "idx_analytics_events_session_id" ON "public"."admin_analytics_events" USING "btree" ("session_id");

CREATE INDEX "idx_analytics_events_user_id" ON "public"."admin_analytics_events" USING "btree" ("user_id");

CREATE INDEX "idx_api_call_logs_recorded" ON "public"."api_call_logs" USING "btree" ("recorded_at" DESC);

CREATE INDEX "idx_api_perf_log_action_name" ON "public"."admin_api_perf_log" USING "btree" ("action_name");

CREATE INDEX "idx_api_perf_log_created_at" ON "public"."admin_api_perf_log" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action");

CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_audit_log_table" ON "public"."audit_log" USING "btree" ("table_name");

CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id");

CREATE INDEX "idx_auth_metrics_hour" ON "public"."auth_metrics_hourly" USING "btree" ("hour" DESC);

CREATE INDEX "idx_auth_rate_limits_blocked_until" ON "public"."auth_rate_limits" USING "btree" ("blocked_until") WHERE ("blocked_until" IS NOT NULL);

CREATE INDEX "idx_background_job_logs_started_at" ON "public"."background_job_logs" USING "btree" ("started_at" DESC);

CREATE INDEX "idx_bg_jobs_type_started" ON "public"."background_job_logs" USING "btree" ("job_type", "started_at" DESC);

CREATE INDEX "idx_client_errors_created_at" ON "public"."admin_client_errors" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_crm_automations_event" ON "public"."crm_automations" USING "btree" ("trigger_event", "is_active", "priority");

CREATE UNIQUE INDEX "idx_crm_coach_engagement_pk" ON "public"."crm_coach_engagement" USING "btree" ("coach_id");

CREATE INDEX "idx_crm_coach_engagement_score" ON "public"."crm_coach_engagement" USING "btree" ("score" DESC);

CREATE INDEX "idx_crm_coaches_archived" ON "public"."crm_coaches" USING "btree" ("is_archived") WHERE ("is_archived" = true);

CREATE INDEX "idx_crm_coaches_assigned_to" ON "public"."crm_coaches" USING "btree" ("assigned_to") WHERE ("assigned_to" IS NOT NULL);

CREATE INDEX "idx_crm_coaches_conference" ON "public"."crm_coaches" USING "btree" ("conference");

CREATE INDEX "idx_crm_coaches_created_at" ON "public"."crm_coaches" USING "btree" ("created_at");

CREATE INDEX "idx_crm_coaches_created_by" ON "public"."crm_coaches" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_crm_coaches_division" ON "public"."crm_coaches" USING "btree" ("division");

CREATE INDEX "idx_crm_coaches_email" ON "public"."crm_coaches" USING "btree" ("email") WHERE ("email" IS NOT NULL);

CREATE INDEX "idx_crm_coaches_last_email_event_at" ON "public"."crm_coaches" USING "btree" ("last_email_event_at" DESC) WHERE ("last_email_event_at" IS NOT NULL);

CREATE INDEX "idx_crm_coaches_list_sort" ON "public"."crm_coaches" USING "btree" ("is_starred" DESC, "priority" DESC, "updated_at" DESC);

CREATE INDEX "idx_crm_coaches_next_follow_up" ON "public"."crm_coaches" USING "btree" ("next_follow_up_at") WHERE ("next_follow_up_at" IS NOT NULL);

CREATE INDEX "idx_crm_coaches_school" ON "public"."crm_coaches" USING "btree" ("school");

CREATE INDEX "idx_crm_contact_log_coach" ON "public"."crm_contact_log" USING "btree" ("coach_id");

CREATE INDEX "idx_crm_contact_log_created_by" ON "public"."crm_contact_log" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_crm_contact_log_date" ON "public"."crm_contact_log" USING "btree" ("contact_date" DESC);

CREATE INDEX "idx_crm_contact_log_metadata_sequence" ON "public"."crm_contact_log" USING "btree" ((("metadata" ->> 'sequence_id'::"text"))) WHERE (("metadata" ->> 'sequence_id'::"text") IS NOT NULL);

CREATE INDEX "idx_crm_contact_log_resend_msg" ON "public"."crm_contact_log" USING "btree" ("resend_message_id") WHERE ("resend_message_id" IS NOT NULL);

CREATE INDEX "idx_crm_contact_log_type" ON "public"."crm_contact_log" USING "btree" ("contact_type");

CREATE INDEX "idx_crm_email_events_created_at" ON "public"."email_events" USING "btree" ("created_at");

CREATE INDEX "idx_crm_events_coach_id" ON "public"."crm_events" USING "btree" ("coach_id") WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_crm_events_created_by" ON "public"."crm_events" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_crm_events_event_type" ON "public"."crm_events" USING "btree" ("event_type");

CREATE INDEX "idx_crm_events_google_event_id" ON "public"."crm_events" USING "btree" ("google_event_id") WHERE ("google_event_id" IS NOT NULL);

CREATE INDEX "idx_crm_events_parent_event_id" ON "public"."crm_events" USING "btree" ("parent_event_id") WHERE ("parent_event_id" IS NOT NULL);

CREATE INDEX "idx_crm_events_start_time" ON "public"."crm_events" USING "btree" ("start_time");

CREATE INDEX "idx_crm_events_status" ON "public"."crm_events" USING "btree" ("status");

CREATE INDEX "idx_crm_google_tokens_user" ON "public"."crm_google_calendar_tokens" USING "btree" ("user_id");

CREATE INDEX "idx_crm_notes_coach_created" ON "public"."crm_notes" USING "btree" ("coach_id", "created_at" DESC);

CREATE INDEX "idx_crm_replies_coach" ON "public"."crm_replies" USING "btree" ("coach_id", "received_at" DESC) WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_crm_replies_thread" ON "public"."crm_replies" USING "btree" ("thread_id", "received_at" DESC) WHERE ("thread_id" IS NOT NULL);

CREATE INDEX "idx_crm_replies_unread" ON "public"."crm_replies" USING "btree" ("received_at" DESC) WHERE ("is_read" = false);

CREATE INDEX "idx_crm_segments_pin" ON "public"."crm_segments" USING "btree" ("pin_order") WHERE ("pin_order" IS NOT NULL);

CREATE INDEX "idx_crm_sequence_steps_sequence" ON "public"."crm_sequence_steps" USING "btree" ("sequence_id", "step_order");

CREATE INDEX "idx_crm_stage_transitions_coach" ON "public"."crm_stage_transitions" USING "btree" ("coach_id", "changed_at" DESC);

CREATE INDEX "idx_crm_stage_transitions_to_status" ON "public"."crm_stage_transitions" USING "btree" ("to_status", "changed_at" DESC);

CREATE INDEX "idx_crm_tasks_assignee" ON "public"."crm_tasks" USING "btree" ("assignee_id", "status", "due_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text"]));

CREATE INDEX "idx_crm_tasks_coach" ON "public"."crm_tasks" USING "btree" ("coach_id", "status", "due_at");

CREATE INDEX "idx_crm_tasks_due" ON "public"."crm_tasks" USING "btree" ("due_at") WHERE (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text"])) AND ("due_at" IS NOT NULL));

CREATE INDEX "idx_crm_unmatched_inbound_promoted_coach_id" ON "public"."crm_unmatched_inbound" USING "btree" ("promoted_coach_id");

CREATE INDEX "idx_crm_unmatched_inbound_reviewed_received_at" ON "public"."crm_unmatched_inbound" USING "btree" ("reviewed", "received_at" DESC);

CREATE INDEX "idx_demo_requests_created" ON "public"."demo_requests" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_demo_requests_crm_coach_id" ON "public"."demo_requests" USING "btree" ("crm_coach_id");

CREATE INDEX "idx_demo_requests_email" ON "public"."demo_requests" USING "btree" ("email");

CREATE INDEX "idx_demo_requests_status" ON "public"."demo_requests" USING "btree" ("status");

CREATE INDEX "idx_device_tokens_active" ON "public"."device_tokens" USING "btree" ("active") WHERE ("active" = true);

CREATE INDEX "idx_device_tokens_user_id" ON "public"."device_tokens" USING "btree" ("user_id");

CREATE INDEX "idx_email_clicks_occurred_at" ON "public"."email_clicks" USING "btree" ("occurred_at" DESC);

CREATE INDEX "idx_email_clicks_recipient" ON "public"."email_clicks" USING "btree" ("recipient_email");

CREATE INDEX "idx_email_clicks_resend_msg" ON "public"."email_clicks" USING "btree" ("resend_message_id");

CREATE INDEX "idx_email_events_coach_id" ON "public"."email_events" USING "btree" ("coach_id");

CREATE INDEX "idx_email_events_contact" ON "public"."email_events" USING "btree" ("contact_log_id");

CREATE INDEX "idx_email_events_msg" ON "public"."email_events" USING "btree" ("resend_message_id");

CREATE INDEX "idx_email_events_occurred_at" ON "public"."email_events" USING "btree" ("occurred_at" DESC);

CREATE INDEX "idx_email_events_type" ON "public"."email_events" USING "btree" ("event_type");

CREATE INDEX "idx_email_events_type_occurred" ON "public"."email_events" USING "btree" ("event_type", "occurred_at" DESC);

CREATE INDEX "idx_emails_contact_log" ON "public"."emails" USING "btree" ("contact_log_id") WHERE ("contact_log_id" IS NOT NULL);

CREATE INDEX "idx_emails_first_seen_at" ON "public"."emails" USING "btree" ("first_seen_at" DESC) WHERE ("first_seen_at" IS NOT NULL);

CREATE INDEX "idx_emails_last_event_at" ON "public"."emails" USING "btree" ("last_event_at" DESC);

CREATE INDEX "idx_emails_sent_at" ON "public"."emails" USING "btree" ("sent_at" DESC) WHERE ("sent_at" IS NOT NULL);

CREATE INDEX "idx_emails_source" ON "public"."emails" USING "btree" ("source");

CREATE INDEX "idx_emails_subject_trgm" ON "public"."emails" USING "gin" ("subject" "public"."gin_trgm_ops");

CREATE INDEX "idx_emails_to_gin" ON "public"."emails" USING "gin" ("to_addresses");

CREATE INDEX "idx_error_logs_created" ON "public"."error_logs" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_error_logs_created_severity" ON "public"."error_logs" USING "btree" ("created_at" DESC, "severity");

CREATE INDEX "idx_error_logs_severity" ON "public"."error_logs" USING "btree" ("severity");

CREATE INDEX "idx_error_logs_user" ON "public"."error_logs" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_error_rate_hour" ON "public"."error_rate_hourly" USING "btree" ("hour" DESC);

CREATE INDEX "idx_login_attempts_email" ON "public"."login_attempts" USING "btree" ("email");

CREATE INDEX "idx_login_attempts_last_attempt" ON "public"."login_attempts" USING "btree" ("last_attempt");

CREATE INDEX "idx_login_attempts_locked" ON "public"."login_attempts" USING "btree" ("locked_until") WHERE ("locked_until" IS NOT NULL);

CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read" = false);

CREATE INDEX "idx_organizations_state" ON "public"."organizations" USING "btree" ("location_state");

CREATE INDEX "idx_organizations_type" ON "public"."organizations" USING "btree" ("type");

CREATE INDEX "idx_push_subscriptions_endpoint" ON "public"."push_subscriptions" USING "btree" ("endpoint");

CREATE INDEX "idx_push_subscriptions_failed" ON "public"."push_subscriptions" USING "btree" ("failed_count") WHERE ("failed_count" > 0);

CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");

CREATE INDEX "idx_seq_enrollments_coach" ON "public"."crm_sequence_enrollments" USING "btree" ("coach_id", "status");

CREATE INDEX "idx_seq_enrollments_due" ON "public"."crm_sequence_enrollments" USING "btree" ("next_send_at", "status") WHERE (("status" = 'active'::"text") AND ("next_send_at" IS NOT NULL));

CREATE INDEX "idx_suppressions_email" ON "public"."crm_email_suppressions" USING "btree" ("email");

CREATE INDEX "idx_suppressions_suppressed_at" ON "public"."crm_email_suppressions" USING "btree" ("suppressed_at" DESC);

CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");

CREATE INDEX "idx_users_last_seen" ON "public"."users" USING "btree" ("last_seen") WHERE ("last_seen" IS NOT NULL);

CREATE INDEX "idx_users_notification_prefs" ON "public"."users" USING "gin" ("notification_preferences");

CREATE INDEX "idx_users_notification_prefs_email_messages" ON "public"."users" USING "btree" ((("notification_preferences" ->> 'email_messages'::"text"))) WHERE (("notification_preferences" ->> 'email_messages'::"text") = 'true'::"text");

CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");

CREATE UNIQUE INDEX "organizations_normalized_name_uidx" ON "public"."organizations" USING "btree" ("lower"("btrim"("name"))) WHERE ("name" IS NOT NULL);

COMMENT ON INDEX "public"."organizations_normalized_name_uidx" IS 'One organization per school name, case + whitespace insensitive. Prevents duplicate-school org rows (e.g. the 2026-06 "University of Lynchburg " trailing-space dup). Onboarding catches the resulting 23505 and surfaces a friendly "already exists" error.';
