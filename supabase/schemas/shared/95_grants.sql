GRANT USAGE ON SCHEMA "extensions" TO "anon";

GRANT USAGE ON SCHEMA "extensions" TO "authenticated";

GRANT USAGE ON SCHEMA "extensions" TO "service_role";

GRANT ALL ON SCHEMA "extensions" TO "dashboard_user";

GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT USAGE ON SCHEMA "public" TO "helm_repair_ro";

GRANT ALL ON TABLE "public"."admin_allowlist" TO "service_role";

GRANT ALL ON TABLE "public"."admin_analytics_events" TO "anon";

GRANT ALL ON TABLE "public"."admin_analytics_events" TO "authenticated";

GRANT ALL ON TABLE "public"."admin_analytics_events" TO "service_role";

GRANT ALL ON TABLE "public"."admin_api_perf_log" TO "anon";

GRANT ALL ON TABLE "public"."admin_api_perf_log" TO "authenticated";

GRANT ALL ON TABLE "public"."admin_api_perf_log" TO "service_role";

GRANT ALL ON TABLE "public"."admin_client_errors" TO "anon";

GRANT ALL ON TABLE "public"."admin_client_errors" TO "authenticated";

GRANT ALL ON TABLE "public"."admin_client_errors" TO "service_role";

GRANT ALL ON TABLE "public"."admin_error_resolutions" TO "service_role";

GRANT SELECT ON TABLE "public"."admin_error_resolutions" TO "authenticated";

GRANT SELECT ON TABLE "public"."admin_error_resolutions" TO "helm_repair_ro";

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_events" TO "authenticated";

GRANT ALL ON TABLE "public"."admin_events" TO "service_role";

GRANT SELECT ON TABLE "public"."admin_events" TO "helm_repair_ro";

GRANT ALL ON TABLE "public"."api_call_logs" TO "anon";

GRANT ALL ON TABLE "public"."api_call_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."api_call_logs" TO "service_role";

GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";

GRANT ALL ON TABLE "public"."audit_log" TO "service_role";

GRANT ALL ON TABLE "public"."auth_metrics_hourly" TO "anon";

GRANT ALL ON TABLE "public"."auth_metrics_hourly" TO "authenticated";

GRANT ALL ON TABLE "public"."auth_metrics_hourly" TO "service_role";

GRANT ALL ON TABLE "public"."auth_rate_limits" TO "anon";

GRANT ALL ON TABLE "public"."auth_rate_limits" TO "authenticated";

GRANT ALL ON TABLE "public"."auth_rate_limits" TO "service_role";

GRANT ALL ON TABLE "public"."background_job_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."background_job_logs" TO "service_role";

GRANT SELECT,INSERT ON TABLE "public"."background_job_logs" TO "helm_repair_ro";

GRANT ALL ON TABLE "public"."backup_ci_junk_rounds_20260821" TO "service_role";

GRANT ALL ON TABLE "public"."backup_class_semester_20260813" TO "service_role";

GRANT ALL ON TABLE "public"."backup_prevyear_classes_20260821" TO "service_role";

GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";

GRANT ALL ON TABLE "public"."billing_invoices" TO "service_role";

GRANT ALL ON TABLE "public"."crm_automations" TO "anon";

GRANT ALL ON TABLE "public"."crm_automations" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_automations" TO "service_role";

GRANT ALL ON TABLE "public"."crm_coaches" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_coaches" TO "service_role";

GRANT ALL ON TABLE "public"."crm_contact_log" TO "anon";

GRANT ALL ON TABLE "public"."crm_contact_log" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_contact_log" TO "service_role";

GRANT ALL ON TABLE "public"."crm_replies" TO "anon";

GRANT ALL ON TABLE "public"."crm_replies" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_replies" TO "service_role";

GRANT ALL ON TABLE "public"."email_events" TO "anon";

GRANT ALL ON TABLE "public"."email_events" TO "authenticated";

GRANT ALL ON TABLE "public"."email_events" TO "service_role";

GRANT ALL ON TABLE "public"."crm_coach_engagement" TO "service_role";

GRANT ALL ON TABLE "public"."crm_email_events" TO "anon";

GRANT ALL ON TABLE "public"."crm_email_events" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_email_events" TO "service_role";

GRANT ALL ON TABLE "public"."crm_email_suppressions" TO "anon";

GRANT ALL ON TABLE "public"."crm_email_suppressions" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_email_suppressions" TO "service_role";

GRANT ALL ON TABLE "public"."crm_email_templates" TO "anon";

GRANT ALL ON TABLE "public"."crm_email_templates" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_email_templates" TO "service_role";

GRANT ALL ON TABLE "public"."crm_email_templates_backup_20260720" TO "service_role";

GRANT ALL ON TABLE "public"."crm_events" TO "anon";

GRANT ALL ON TABLE "public"."crm_events" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_events" TO "service_role";

GRANT ALL ON TABLE "public"."crm_google_calendar_tokens" TO "anon";

GRANT ALL ON TABLE "public"."crm_google_calendar_tokens" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_google_calendar_tokens" TO "service_role";

GRANT ALL ON TABLE "public"."crm_notes" TO "anon";

GRANT ALL ON TABLE "public"."crm_notes" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_notes" TO "service_role";

GRANT ALL ON TABLE "public"."crm_segments" TO "anon";

GRANT ALL ON TABLE "public"."crm_segments" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_segments" TO "service_role";

GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "anon";

GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "service_role";

GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "anon";

GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "service_role";

GRANT ALL ON TABLE "public"."crm_sequences" TO "anon";

GRANT ALL ON TABLE "public"."crm_sequences" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_sequences" TO "service_role";

GRANT ALL ON TABLE "public"."crm_stage_transitions" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_stage_transitions" TO "service_role";

GRANT ALL ON TABLE "public"."crm_tasks" TO "anon";

GRANT ALL ON TABLE "public"."crm_tasks" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_tasks" TO "service_role";

GRANT ALL ON TABLE "public"."crm_unmatched_inbound" TO "anon";

GRANT ALL ON TABLE "public"."crm_unmatched_inbound" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_unmatched_inbound" TO "service_role";

GRANT ALL ON TABLE "public"."demo_requests" TO "anon";

GRANT ALL ON TABLE "public"."demo_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."demo_requests" TO "service_role";

GRANT ALL ON TABLE "public"."device_tokens" TO "anon";

GRANT ALL ON TABLE "public"."device_tokens" TO "authenticated";

GRANT ALL ON TABLE "public"."device_tokens" TO "service_role";

GRANT ALL ON TABLE "public"."email_clicks" TO "anon";

GRANT ALL ON TABLE "public"."email_clicks" TO "authenticated";

GRANT ALL ON TABLE "public"."email_clicks" TO "service_role";

GRANT ALL ON TABLE "public"."emails" TO "anon";

GRANT ALL ON TABLE "public"."emails" TO "authenticated";

GRANT ALL ON TABLE "public"."emails" TO "service_role";

GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."error_logs" TO "service_role";

GRANT ALL ON TABLE "public"."error_rate_hourly" TO "anon";

GRANT ALL ON TABLE "public"."error_rate_hourly" TO "authenticated";

GRANT ALL ON TABLE "public"."error_rate_hourly" TO "service_role";

GRANT ALL ON TABLE "public"."login_attempts" TO "authenticated";

GRANT ALL ON TABLE "public"."login_attempts" TO "service_role";

GRANT ALL ON TABLE "public"."notifications" TO "anon";

GRANT ALL ON TABLE "public"."notifications" TO "authenticated";

GRANT ALL ON TABLE "public"."notifications" TO "service_role";

GRANT ALL ON TABLE "public"."organizations" TO "anon";

GRANT ALL ON TABLE "public"."organizations" TO "authenticated";

GRANT ALL ON TABLE "public"."organizations" TO "service_role";

GRANT ALL ON TABLE "public"."organizations_public_profile" TO "service_role";

GRANT SELECT ON TABLE "public"."organizations_public_profile" TO "anon";

GRANT SELECT ON TABLE "public"."organizations_public_profile" TO "authenticated";

GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";

GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT ALL ON TABLE "public"."schema_migrations_pruned_20260820" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "anon";

GRANT ALL ON TABLE "public"."users" TO "authenticated";

GRANT ALL ON TABLE "public"."users" TO "service_role";

GRANT ALL ON TABLE "public"."v_crm_coach_activity" TO "authenticated";

GRANT ALL ON TABLE "public"."v_crm_coach_activity" TO "service_role";

GRANT ALL ON TABLE "public"."v_crm_coach_signal_summary" TO "authenticated";

GRANT ALL ON TABLE "public"."v_crm_coach_signal_summary" TO "service_role";

GRANT SELECT,MAINTAIN ON TABLE "public"."v_crm_coaches_by_school" TO "authenticated";

GRANT ALL ON TABLE "public"."v_crm_coaches_by_school" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "pgmq" GRANT SELECT ON SEQUENCES TO "pg_monitor";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "pgmq" GRANT SELECT ON TABLES TO "pg_monitor";
