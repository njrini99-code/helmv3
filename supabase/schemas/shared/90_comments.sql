COMMENT ON TABLE "public"."admin_error_resolutions" IS 'Per-fingerprint resolution state for Helm Bridge incidents: what fixed a fault (PR + merge SHA), who decided (auto cron vs operator), and whether it has regressed since. Read-side archive; never mutates admin_events.';

COMMENT ON COLUMN "public"."admin_events"."feature" IS 'Canonical feature key from src/lib/admin/feature-registry.ts (FEATURE_COVERAGE.md §1). Free text by design — the feature vocabulary grows faster than sports/sources; validity is enforced app-side by the FeatureKey type + contract tests.';

COMMENT ON TABLE "public"."auth_rate_limits" IS 'DB-backed rate limit window state - service_role only. Replaces the in-memory Map.';

COMMENT ON TABLE "public"."billing_customers" IS 'Idempotent organization -> Stripe customer id mapping. Platform-plane; RLS deny-by-default, service-role access only.';

COMMENT ON TABLE "public"."billing_invoices" IS 'Local mirror of Stripe invoices, synced by the Stripe webhook. Platform-plane; RLS deny-by-default, service-role access only. Stripe remains source of truth.';

COMMENT ON COLUMN "public"."crm_coaches"."last_email_event_type" IS 'Latest Resend event type for this coach (sent|delivered|delivery_delayed|opened|clicked|bounced|complained), stripped of the email. prefix. Maintained by trigger on email_events.';

COMMENT ON COLUMN "public"."crm_coaches"."last_email_event_at" IS 'Timestamp of the latest Resend webhook event linked to this coach. Maintained by trigger on email_events.';

COMMENT ON TABLE "public"."email_events" IS 'Immutable event log for all Resend webhook events. Renamed from crm_email_events (view kept for back-compat).';

COMMENT ON COLUMN "public"."email_events"."coach_id" IS 'The crm_coaches row associated directly with this engagement event when contact_log_id is absent. ON DELETE SET NULL preserves the raw event.';

COMMENT ON COLUMN "public"."crm_email_templates"."format" IS 'Body format. plain = legacy paragraph-text wrapped in greeting/signature shell. html = full HTML document, sent as-is (merge tags still substituted).';

COMMENT ON COLUMN "public"."crm_email_templates"."last_used_at" IS 'Timestamp of the most recent email sent with this template (any send path). Maintained by the send paths alongside usage_count (which counts emails sent, not send-clicks).';

COMMENT ON TABLE "public"."crm_unmatched_inbound" IS 'Inbound email from senders who are not in crm_coaches. Written by the service-role ingest path and protected from public access with restrictive RLS.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."id" IS 'Stable internal surrogate key separate from the external RFC 822 message identifier.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."message_id" IS 'RFC 822 Message-ID. UNIQUE keeps cron reruns and historical backfills idempotent.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."thread_id" IS 'Gmail thread identifier used to recover the complete conversation after promotion.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."from_address" IS 'Raw sender address exactly as reported by Gmail for case-sensitive mismatch diagnosis.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."to_addresses" IS 'Inbound recipients used to identify which monitored alias received the message.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."subject" IS 'Subject line for triaging prospects, automated replies, and noise.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."body_text" IS 'Plain-text body retained as the canonical recoverable inbound signal.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."body_html" IS 'HTML body retained for lossless CRM rendering after promotion.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."received_at" IS 'Timestamp reported by Gmail when the message was received.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."raw_payload" IS 'Full Gmail message payload retained for future reparsing without another API fetch.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."promoted_coach_id" IS 'Coach created or selected when an admin promotes this unmatched sender.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."reviewed" IS 'Whether a human has triaged this unmatched inbound message.';

COMMENT ON COLUMN "public"."crm_unmatched_inbound"."created_at" IS 'Time the ingest process persisted the row, enabling ingest-lag monitoring.';

COMMENT ON COLUMN "public"."demo_requests"."source" IS 'Which surface produced this request: landing | pricing | mobile_nav. Free text permits future surfaces without a migration.';

COMMENT ON COLUMN "public"."demo_requests"."referer" IS 'Referer header captured at submit time for inbound attribution.';

COMMENT ON COLUMN "public"."demo_requests"."ip" IS 'Client IP captured at submit time for attribution and traffic-quality analysis.';

COMMENT ON COLUMN "public"."demo_requests"."user_agent" IS 'User-agent captured at submit time for forensics; not trusted as a standalone bot signal.';

COMMENT ON COLUMN "public"."demo_requests"."country" IS 'Geo country from edge request context for attribution and territory routing.';

COMMENT ON COLUMN "public"."demo_requests"."city" IS 'Geo city from edge request context for attribution and territory routing.';

COMMENT ON COLUMN "public"."demo_requests"."crm_coach_id" IS 'The crm_coaches row associated with this request. ON DELETE SET NULL preserves the inbound request.';

COMMENT ON TABLE "public"."email_clicks" IS 'Per-click telemetry (URL, UA, IP) extracted from email.clicked webhook events.';

COMMENT ON TABLE "public"."emails" IS 'Per-message snapshot for all Resend emails (mirrors resend.com/emails).';

COMMENT ON TABLE "public"."push_subscriptions" IS 'Stores Web Push notification subscriptions for users';

COMMENT ON COLUMN "public"."push_subscriptions"."endpoint" IS 'The push service endpoint URL unique to each browser/device';

COMMENT ON COLUMN "public"."push_subscriptions"."expiration_time" IS 'When the subscription expires (if set by browser)';

COMMENT ON COLUMN "public"."push_subscriptions"."keys" IS 'JSON object containing p256dh and auth keys for encryption';

COMMENT ON COLUMN "public"."push_subscriptions"."user_agent" IS 'Browser user agent string for debugging';

COMMENT ON COLUMN "public"."push_subscriptions"."device_name" IS 'Friendly name for the device (e.g., "Chrome on MacBook")';

COMMENT ON COLUMN "public"."push_subscriptions"."last_push_at" IS 'Timestamp of last successful push to this subscription';

COMMENT ON COLUMN "public"."push_subscriptions"."failed_count" IS 'Number of consecutive failed push attempts';

COMMENT ON COLUMN "public"."users"."notification_preferences" IS 'User notification preferences for email and push notifications. Fields: email_messages, email_pipeline_updates, email_event_reminders, email_profile_views, email_announcements, push_messages, push_events';
