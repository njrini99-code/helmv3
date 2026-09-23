-- Helm Debug — retention v3: extend prune to the Database Tab's two new
-- tables (db_statement_samples, db_analysis_samples), 30 days each, same
-- byte-identical-signature discipline v2 established.
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Depends on
-- 20260906120000 (db_statement_samples) and 20260906120100
-- (db_analysis_samples) applying first — same ordering caveat v2 states
-- for its own two new tables: CREATE FUNCTION succeeds regardless of
-- order, calling it before those tables exist fails at execution time.
--
-- SAME SIGNATURE RULE AS v2 — see that file's header for why this is not
-- optional. `db-observability-prune/route.ts` calls this RPC with an empty
-- parameter object; a second overload from a widened parameter list turns
-- into a daily PGRST203 failure, not a clean HELD-migration no-op. The two
-- new retention windows (`db_statement_samples` 30d, `db_analysis_samples`
-- 30d — matching the brief's task 1 retention line) are fixed internal
-- constants, exactly like v2's lock-incidents/table-samples windows.
--
-- `db_statement_alert_state` is pruned alongside `db_statement_samples`
-- using the same window, keyed off its own `last_paged_at` (mirrors
-- `db_stat_prior_state`'s `last_seen_at`-based prune in Phase 1).
--
-- ROLLBACK: CREATE OR REPLACE back to v2's body
-- (20260903191300_helm_debug_observability_retention_v2.sql).

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
  v_lock_incidents_days constant integer := 30;
  v_table_samples_days constant integer := 30;
  -- Fixed internal constants for the two Database Tab (D5) tables — NOT new
  -- parameters, same reasoning as v2's two constants above.
  v_statement_samples_days constant integer := 30;
  v_analysis_samples_days constant integer := 30;
  v_deleted_error_events bigint := 0;
  v_deleted_health_samples bigint := 0;
  v_deleted_stat_deltas bigint := 0;
  v_deleted_prior_state bigint := 0;
  v_deleted_lock_incidents bigint := 0;
  v_deleted_table_samples bigint := 0;
  v_deleted_statement_samples bigint := 0;
  v_deleted_statement_alert_state bigint := 0;
  v_deleted_analysis_samples bigint := 0;
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

  with deleted as (
    delete from helm_debug.db_lock_incidents
    where detected_at < clock_timestamp() - make_interval(days => v_lock_incidents_days)
    returning 1
  )
  select count(*) into v_deleted_lock_incidents from deleted;

  with deleted as (
    delete from helm_debug.db_table_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_table_samples_days)
    returning 1
  )
  select count(*) into v_deleted_table_samples from deleted;

  with deleted as (
    delete from helm_debug.db_statement_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_statement_samples_days)
    returning 1
  )
  select count(*) into v_deleted_statement_samples from deleted;

  with deleted as (
    delete from helm_debug.db_statement_alert_state
    where last_paged_at < clock_timestamp() - make_interval(days => v_statement_samples_days)
    returning 1
  )
  select count(*) into v_deleted_statement_alert_state from deleted;

  with deleted as (
    delete from helm_debug.db_analysis_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_analysis_samples_days)
    returning 1
  )
  select count(*) into v_deleted_analysis_samples from deleted;

  return jsonb_build_object(
    'cutoff_error_events', clock_timestamp() - make_interval(days => v_error_events_days),
    'cutoff_health_samples', clock_timestamp() - make_interval(days => v_health_days),
    'cutoff_stat_deltas', clock_timestamp() - make_interval(days => v_stat_days),
    'cutoff_prior_state', clock_timestamp() - make_interval(days => v_prior_days),
    'cutoff_lock_incidents', clock_timestamp() - make_interval(days => v_lock_incidents_days),
    'cutoff_table_samples', clock_timestamp() - make_interval(days => v_table_samples_days),
    'cutoff_statement_samples', clock_timestamp() - make_interval(days => v_statement_samples_days),
    'cutoff_analysis_samples', clock_timestamp() - make_interval(days => v_analysis_samples_days),
    'deleted_db_error_events', v_deleted_error_events,
    'deleted_db_health_samples', v_deleted_health_samples,
    'deleted_db_stat_deltas', v_deleted_stat_deltas,
    'deleted_db_stat_prior_state', v_deleted_prior_state,
    'deleted_db_lock_incidents', v_deleted_lock_incidents,
    'deleted_db_table_samples', v_deleted_table_samples,
    'deleted_db_statement_samples', v_deleted_statement_samples,
    'deleted_db_statement_alert_state', v_deleted_statement_alert_state,
    'deleted_db_analysis_samples', v_deleted_analysis_samples
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
