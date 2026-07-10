-- Advisor cleanup (multiple_permissive_policies root cause A):
-- These policies all carry qual/with_check `auth.role() = 'service_role'`,
-- which can never pass for anon/authenticated, and service_role itself has
-- BYPASSRLS - so re-scoping them TO service_role changes no access outcome;
-- it only stops Postgres evaluating them on every anon/authenticated query.
-- Applied to prod 2026-07-10 via MCP (verified 19/19 scoped post-apply).
alter policy "percentile_write_service" on graveyard.golf_percentile_cache to service_role;
alter policy "baselines_write_service" on graveyard.golf_player_baselines to service_role;
alter policy "golf_tracer_health_snapshot_service_write" on graveyard.golf_tracer_health_snapshot to service_role;
alter policy "Service role can manage validations" on graveyard.golf_validations to service_role;
alter policy "api_call_logs_service_write" on public.api_call_logs to service_role;
alter policy "auth_metrics_hourly_service_write" on public.auth_metrics_hourly to service_role;
alter policy "background_job_logs_service_write" on public.background_job_logs to service_role;
alter policy "Service role full access" on public.device_tokens to service_role;
alter policy "error_rate_hourly_service_write" on public.error_rate_hourly to service_role;
alter policy "golf_causal_relationships_service_role_all" on public.golf_causal_relationships to service_role;
alter policy "golf_confidence_calibration_service_role_all" on public.golf_confidence_calibration to service_role;
alter policy "global_patterns_write_service" on public.golf_global_patterns to service_role;
alter policy "Service role can manage learned behavior" on public.golf_learned_behavior to service_role;
alter policy "Service role can insert patterns" on public.golf_patterns_v2 to service_role;
alter policy "Service role can update patterns" on public.golf_patterns_v2 to service_role;
alter policy "golf_platform_metrics_daily_service_write" on public.golf_platform_metrics_daily to service_role;
alter policy "Service role can manage predictions" on public.golf_predictions to service_role;
alter policy "Service role full access" on public.golf_task_reminders to service_role;
alter policy "Service role full access on push_subscriptions" on public.push_subscriptions to service_role;
