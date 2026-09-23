ALTER TABLE ONLY "public"."admin_allowlist"
    ADD CONSTRAINT "admin_allowlist_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."admin_analytics_events"
    ADD CONSTRAINT "admin_analytics_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."admin_api_perf_log"
    ADD CONSTRAINT "admin_api_perf_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."admin_client_errors"
    ADD CONSTRAINT "admin_client_errors_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."admin_error_resolutions"
    ADD CONSTRAINT "admin_error_resolutions_pkey" PRIMARY KEY ("fingerprint");

ALTER TABLE ONLY "public"."admin_events"
    ADD CONSTRAINT "admin_events_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."admin_events"
    ADD CONSTRAINT "admin_events_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['server_action'::"text", 'route_handler'::"text", 'server_component'::"text", 'background_job'::"text", 'request_hook'::"text", 'rls_denial'::"text", 'auth'::"text", 'cron'::"text", 'integrity'::"text", 'client'::"text", 'system'::"text"])))) NOT VALID;

ALTER TABLE "public"."admin_events"
    ADD CONSTRAINT "admin_events_sport_check" CHECK ((("sport" IS NULL) OR ("sport" = ANY (ARRAY['golf'::"text", 'baseball'::"text", 'shared'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."api_call_logs"
    ADD CONSTRAINT "api_call_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."auth_metrics_hourly"
    ADD CONSTRAINT "auth_metrics_hourly_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."auth_rate_limits"
    ADD CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key");

ALTER TABLE ONLY "public"."background_job_logs"
    ADD CONSTRAINT "background_job_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("organization_id");

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");

ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_stripe_invoice_id_key" UNIQUE ("stripe_invoice_id");

ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_coaches"
    ADD CONSTRAINT "crm_coaches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_contact_log"
    ADD CONSTRAINT "crm_contact_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "crm_email_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_email_suppressions"
    ADD CONSTRAINT "crm_email_suppressions_email_reason_key" UNIQUE ("email", "reason");

ALTER TABLE ONLY "public"."crm_email_suppressions"
    ADD CONSTRAINT "crm_email_suppressions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_email_templates"
    ADD CONSTRAINT "crm_email_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_events"
    ADD CONSTRAINT "crm_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_google_calendar_tokens"
    ADD CONSTRAINT "crm_google_calendar_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_notes"
    ADD CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_replies"
    ADD CONSTRAINT "crm_replies_message_id_key" UNIQUE ("message_id");

ALTER TABLE ONLY "public"."crm_replies"
    ADD CONSTRAINT "crm_replies_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_segments"
    ADD CONSTRAINT "crm_segments_created_by_name_key" UNIQUE ("created_by", "name");

ALTER TABLE ONLY "public"."crm_segments"
    ADD CONSTRAINT "crm_segments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_sequence_id_coach_id_key" UNIQUE ("sequence_id", "coach_id");

ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_sequence_id_step_order_key" UNIQUE ("sequence_id", "step_order");

ALTER TABLE ONLY "public"."crm_sequences"
    ADD CONSTRAINT "crm_sequences_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_stage_transitions"
    ADD CONSTRAINT "crm_stage_transitions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."crm_unmatched_inbound"
    ADD CONSTRAINT "crm_unmatched_inbound_message_id_key" UNIQUE ("message_id");

ALTER TABLE ONLY "public"."crm_unmatched_inbound"
    ADD CONSTRAINT "crm_unmatched_inbound_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."demo_requests"
    ADD CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_token_key" UNIQUE ("token");

ALTER TABLE ONLY "public"."email_clicks"
    ADD CONSTRAINT "email_clicks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_dedup" UNIQUE ("resend_message_id", "event_type", "occurred_at");

ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_pkey" PRIMARY KEY ("resend_message_id");

ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."error_rate_hourly"
    ADD CONSTRAINT "error_rate_hourly_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."login_attempts"
    ADD CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."schema_migrations_pruned_20260820"
    ADD CONSTRAINT "schema_migrations_pruned_20260820_idempotency_key_key" UNIQUE ("idempotency_key");

ALTER TABLE ONLY "public"."schema_migrations_pruned_20260820"
    ADD CONSTRAINT "schema_migrations_pruned_20260820_pkey" PRIMARY KEY ("version");

ALTER TABLE ONLY "public"."crm_google_calendar_tokens"
    ADD CONSTRAINT "unique_user_calendar" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."admin_allowlist"
    ADD CONSTRAINT "admin_allowlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."admin_analytics_events"
    ADD CONSTRAINT "admin_analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."admin_api_perf_log"
    ADD CONSTRAINT "admin_api_perf_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."admin_client_errors"
    ADD CONSTRAINT "admin_client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."admin_error_resolutions"
    ADD CONSTRAINT "admin_error_resolutions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."admin_events"
    ADD CONSTRAINT "admin_events_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."admin_events"
    ADD CONSTRAINT "admin_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_coaches"
    ADD CONSTRAINT "crm_coaches_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."crm_coaches"
    ADD CONSTRAINT "crm_coaches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."crm_contact_log"
    ADD CONSTRAINT "crm_contact_log_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_contact_log"
    ADD CONSTRAINT "crm_contact_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "crm_email_events_contact_log_id_fkey" FOREIGN KEY ("contact_log_id") REFERENCES "public"."crm_contact_log"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_email_suppressions"
    ADD CONSTRAINT "crm_email_suppressions_suppressed_by_fkey" FOREIGN KEY ("suppressed_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_email_templates"
    ADD CONSTRAINT "crm_email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."crm_events"
    ADD CONSTRAINT "crm_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_events"
    ADD CONSTRAINT "crm_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."crm_events"
    ADD CONSTRAINT "crm_events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "public"."crm_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_google_calendar_tokens"
    ADD CONSTRAINT "crm_google_calendar_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_notes"
    ADD CONSTRAINT "crm_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_notes"
    ADD CONSTRAINT "crm_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_replies"
    ADD CONSTRAINT "crm_replies_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_replies"
    ADD CONSTRAINT "crm_replies_contact_log_id_fkey" FOREIGN KEY ("contact_log_id") REFERENCES "public"."crm_contact_log"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_segments"
    ADD CONSTRAINT "crm_segments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."crm_email_templates"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."crm_sequences"
    ADD CONSTRAINT "crm_sequences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_stage_transitions"
    ADD CONSTRAINT "crm_stage_transitions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."crm_unmatched_inbound"
    ADD CONSTRAINT "crm_unmatched_inbound_promoted_coach_id_fkey" FOREIGN KEY ("promoted_coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."demo_requests"
    ADD CONSTRAINT "demo_requests_crm_coach_id_fkey" FOREIGN KEY ("crm_coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."email_clicks"
    ADD CONSTRAINT "email_clicks_email_event_id_fkey" FOREIGN KEY ("email_event_id") REFERENCES "public"."email_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_contact_log_id_fkey" FOREIGN KEY ("contact_log_id") REFERENCES "public"."crm_contact_log"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
