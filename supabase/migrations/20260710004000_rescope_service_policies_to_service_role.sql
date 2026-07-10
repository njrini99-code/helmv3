-- Advisor cleanup (multiple_permissive_policies root cause A):
-- These policies all carry qual/with_check `auth.role() = 'service_role'`,
-- which can never pass for anon/authenticated, and service_role itself has
-- BYPASSRLS - so re-scoping them TO service_role changes no access outcome;
-- it only stops Postgres evaluating them on every anon/authenticated query.
-- Applied to prod 2026-07-10 via MCP (verified 19/19 scoped post-apply).
-- REPLAY-SAFE REWRITE (same day): a fresh migrations-chain replay (CI shadow
-- DB) may lack some of these policies (prod drift), so each ALTER is guarded
-- on pg_policies existence and skipped with a NOTICE where absent.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('graveyard', 'golf_percentile_cache', 'percentile_write_service'),
      ('graveyard', 'golf_player_baselines', 'baselines_write_service'),
      ('graveyard', 'golf_tracer_health_snapshot', 'golf_tracer_health_snapshot_service_write'),
      ('graveyard', 'golf_validations', 'Service role can manage validations'),
      ('public', 'api_call_logs', 'api_call_logs_service_write'),
      ('public', 'auth_metrics_hourly', 'auth_metrics_hourly_service_write'),
      ('public', 'background_job_logs', 'background_job_logs_service_write'),
      ('public', 'device_tokens', 'Service role full access'),
      ('public', 'error_rate_hourly', 'error_rate_hourly_service_write'),
      ('public', 'golf_causal_relationships', 'golf_causal_relationships_service_role_all'),
      ('public', 'golf_confidence_calibration', 'golf_confidence_calibration_service_role_all'),
      ('public', 'golf_global_patterns', 'global_patterns_write_service'),
      ('public', 'golf_learned_behavior', 'Service role can manage learned behavior'),
      ('public', 'golf_patterns_v2', 'Service role can insert patterns'),
      ('public', 'golf_patterns_v2', 'Service role can update patterns'),
      ('public', 'golf_platform_metrics_daily', 'golf_platform_metrics_daily_service_write'),
      ('public', 'golf_predictions', 'Service role can manage predictions'),
      ('public', 'golf_task_reminders', 'Service role full access'),
      ('public', 'push_subscriptions', 'Service role full access on push_subscriptions')
    ) as t(sch, tbl, pol)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = spec.sch and tablename = spec.tbl and policyname = spec.pol
    ) then
      execute format('alter policy %I on %I.%I to service_role', spec.pol, spec.sch, spec.tbl);
    else
      raise notice 'skipping policy % on %.% - absent in this environment', spec.pol, spec.sch, spec.tbl;
    end if;
  end loop;
end $$;
