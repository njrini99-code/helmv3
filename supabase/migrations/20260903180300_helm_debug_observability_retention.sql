-- Helm Debug — retention for the Phase 1 observability tables
-- (brief §27, §40-48)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same shape as
-- 20260826010000_helm_debug_retention.sql — a dedicated prune function, not
-- an extension of `public.helm_debug_prune` (that function's contract and
-- tests belong to the flight-recorder tables; a new function keeps this
-- change additive rather than risking an existing, already-scheduled
-- function's behavior).
--
-- RETENTION WINDOWS (brief §40-48):
--   db_error_events    30 days (aggregated; occurrence_count already
--                       collapses repeat occurrences, so this is a bound on
--                       DISTINCT fingerprint/hour rows, not raw event count)
--   db_health_samples  30 days at 5-minute cadence (~8,640 rows/month)
--   db_stat_deltas     14 days at 15-minute Top-K (bounded by K per window)
--   db_stat_prior_state  not time-pruned by age (it is an upsert-by-queryid
--                       table, not an append log) — pruned instead by
--                       "not seen in 14 days", so a queryid that permanently
--                       stops appearing in the Top-K eventually drops out
--                       rather than growing the table forever.
--
-- Nothing in this migration schedules this function — see
-- 20260826010000's own "Scheduling options" note; this repo's established
-- pattern (helm-debug-prune) is a Vercel cron route calling the RPC, which
-- src/app/api/cron/db-observability-prune/route.ts follows.
--
-- ROLLBACK:
-- DROP FUNCTION public.helm_debug_prune_observability(integer, integer);

create or replace function public.helm_debug_prune_observability(
    p_error_events_retention_days integer default 30,
    p_health_samples_retention_days integer default 30,
    p_stat_deltas_retention_days integer default 14,
    p_prior_state_retention_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_error_events_days integer := greatest(1, least(coalesce(p_error_events_retention_days, 30), 3650));
  v_health_days integer := greatest(1, least(coalesce(p_health_samples_retention_days, 30), 3650));
  v_stat_days integer := greatest(1, least(coalesce(p_stat_deltas_retention_days, 14), 3650));
  v_prior_days integer := greatest(1, least(coalesce(p_prior_state_retention_days, 14), 3650));
  v_deleted_error_events bigint := 0;
  v_deleted_health_samples bigint := 0;
  v_deleted_stat_deltas bigint := 0;
  v_deleted_prior_state bigint := 0;
begin
  with deleted as (
    delete from helm_debug.db_error_events
    where occurred_at < clock_timestamp() - make_interval(days => v_error_events_days)
    returning 1
  )
  select count(*) into v_deleted_error_events from deleted;

  with deleted as (
    delete from helm_debug.db_health_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_health_days)
    returning 1
  )
  select count(*) into v_deleted_health_samples from deleted;

  with deleted as (
    delete from helm_debug.db_stat_deltas
    where sampled_at < clock_timestamp() - make_interval(days => v_stat_days)
    returning 1
  )
  select count(*) into v_deleted_stat_deltas from deleted;

  with deleted as (
    delete from helm_debug.db_stat_prior_state
    where last_seen_at < clock_timestamp() - make_interval(days => v_prior_days)
    returning 1
  )
  select count(*) into v_deleted_prior_state from deleted;

  return jsonb_build_object(
    'cutoff_error_events', clock_timestamp() - make_interval(days => v_error_events_days),
    'cutoff_health_samples', clock_timestamp() - make_interval(days => v_health_days),
    'cutoff_stat_deltas', clock_timestamp() - make_interval(days => v_stat_days),
    'cutoff_prior_state', clock_timestamp() - make_interval(days => v_prior_days),
    'deleted_db_error_events', v_deleted_error_events,
    'deleted_db_health_samples', v_deleted_health_samples,
    'deleted_db_stat_deltas', v_deleted_stat_deltas,
    'deleted_db_stat_prior_state', v_deleted_prior_state
  );
end;
$$;

revoke execute on function public.helm_debug_prune_observability(
    integer, integer, integer, integer
)
from public, anon, authenticated;
grant execute on function public.helm_debug_prune_observability(
    integer, integer, integer, integer
)
to service_role;

do $$
declare v_fn oid := 'public.helm_debug_prune_observability(integer, integer, integer, integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_prune_observability callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_prune_observability not executable by service_role';
  end if;
end $$;
