CREATE OR REPLACE TRIGGER "device_tokens_updated_at" BEFORE UPDATE ON "public"."device_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_device_tokens_updated_at"();

CREATE OR REPLACE TRIGGER "email_events_extract_click" AFTER INSERT ON "public"."email_events" FOR EACH ROW EXECUTE FUNCTION "public"."extract_email_click_from_event"();

CREATE OR REPLACE TRIGGER "email_events_sync_coach" AFTER INSERT ON "public"."email_events" FOR EACH ROW EXECUTE FUNCTION "public"."sync_coach_last_email_event"();

CREATE OR REPLACE TRIGGER "email_events_sync_snapshot" AFTER INSERT ON "public"."email_events" FOR EACH ROW EXECUTE FUNCTION "public"."sync_email_snapshot_from_event"();

CREATE OR REPLACE TRIGGER "push_subscriptions_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_push_subscriptions_updated_at"();

CREATE OR REPLACE TRIGGER "set_billing_customers_updated_at" BEFORE UPDATE ON "public"."billing_customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "set_billing_invoices_updated_at" BEFORE UPDATE ON "public"."billing_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "trg_crm_automations_updated_at" BEFORE UPDATE ON "public"."crm_automations" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_automations_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_coaches_updated_at" BEFORE UPDATE ON "public"."crm_coaches" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_coaches_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_events_updated_at" BEFORE UPDATE ON "public"."crm_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_events_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_google_tokens_updated_at" BEFORE UPDATE ON "public"."crm_google_calendar_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_google_tokens_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_notes_updated_at" BEFORE UPDATE ON "public"."crm_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_notes_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_segments_updated_at" BEFORE UPDATE ON "public"."crm_segments" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_segments_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_sequences_updated_at" BEFORE UPDATE ON "public"."crm_sequences" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_sequences_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_stage_transition" AFTER UPDATE OF "status" ON "public"."crm_coaches" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_stage_transition"();

CREATE OR REPLACE TRIGGER "trg_crm_tasks_updated_at" BEFORE UPDATE ON "public"."crm_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_tasks_updated_at"();

CREATE OR REPLACE TRIGGER "trg_guard_users_role_self_change" BEFORE UPDATE OF "role" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_users_role_self_change"();

CREATE OR REPLACE TRIGGER "trg_stop_sequences_on_reply" AFTER INSERT ON "public"."crm_replies" FOR EACH ROW EXECUTE FUNCTION "public"."stop_sequences_on_reply"();

CREATE OR REPLACE TRIGGER "trg_write_suppression_on_unsubscribe" AFTER INSERT ON "public"."email_events" FOR EACH ROW EXECUTE FUNCTION "public"."write_suppression_on_unsubscribe"();

CREATE OR REPLACE TRIGGER "update_demo_requests_updated_at" BEFORE UPDATE ON "public"."demo_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_login_attempts_updated_at" BEFORE UPDATE ON "public"."login_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "validate_notification_preferences_trigger" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."validate_notification_preferences"();
