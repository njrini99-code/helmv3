-- Helm Debug — retention v2: extend prune to Phase 2's tables, plus a sizes
-- facade for self-monitoring (brief §44, §40-48, Phase 2 A6)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Depends on
-- 20260903191000 (db_lock_incidents) and 20260903191100 (db_table_samples)
-- already being applied — this migration's CREATE OR REPLACE references
-- both tables by name inside PL/pgSQL, so (like the Phase 1 retention
-- migration's own note) CREATE FUNCTION itself succeeds regardless of
-- order, but EXECUTING the function before those two tables exist fails at
-- call time. Apply this series in filename order (…90000, …90100, …90200,
-- …90300) — mirroring Phase 1's own instruction in HELD.md for exactly this
-- reason.
--
-- THE SIGNATURE MUST STAY BYTE-IDENTICAL TO PHASE 1's
-- public.helm_debug_prune_observability(...) — THIS IS THE ONE DEFECT CLASS
-- THIS FILE EXISTS TO AVOID. `CREATE OR REPLACE FUNCTION` cannot ADD a
-- parameter to an existing function; doing so creates a SECOND overload
-- alongside the original 4-arg one instead of replacing it.
-- `src/app/api/cron/db-observability-prune/route.ts` calls this RPC with an
-- EMPTY parameter object (`{}`), which would then be ambiguous between two
-- callable overloads — PostgREST returns PGRST203 (a code that is NOT in
-- this route's `MIGRATION_NOT_APPLIED_CODES` set), so the prune cron would
-- throw and log a FAILED run every day, discovered only at call time, long
-- after this migration had already applied cleanly. So: the parameter list
-- below is copied verbatim (names, types, order, defaults) from
-- 20260903180300_helm_debug_observability_retention.sql, and the two new
-- retention windows this task asks for (db_lock_incidents 30d,
-- db_table_samples 30d) are FIXED INTERNAL CONSTANTS inside the function
-- body instead of new parameters — a deliberate decision, not an
-- oversight; see the "retention-window parameterization" note in this
-- track's final report.
--
-- ROLLBACK: this CREATE OR REPLACE cannot be cleanly "rolled back" to
-- Phase 1's exact prior body without reapplying
-- 20260903180300_helm_debug_observability_retention.sql's own CREATE OR
-- REPLACE (same signature, so that file remains a valid rollback target).
-- DROP FUNCTION public.helm_debug_read_observability_sizes(); on its own is
-- safe and independent of the prune function.

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
  -- Fixed internal constants (brief §44: locks 30d, table samples 30d) —
  -- NOT new parameters. See file header for why.
  v_lock_incidents_days constant integer := 30;
  v_table_samples_days constant integer := 30;
  v_deleted_error_events bigint := 0;
  v_deleted_health_samples bigint := 0;
  v_deleted_stat_deltas bigint := 0;
  v_deleted_prior_state bigint := 0;
  v_deleted_lock_incidents bigint := 0;
  v_deleted_table_samples bigint := 0;
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

  return jsonb_build_object(
    'cutoff_error_events', clock_timestamp() - make_interval(days => v_error_events_days),
    'cutoff_health_samples', clock_timestamp() - make_interval(days => v_health_days),
    'cutoff_stat_deltas', clock_timestamp() - make_interval(days => v_stat_days),
    'cutoff_prior_state', clock_timestamp() - make_interval(days => v_prior_days),
    'cutoff_lock_incidents', clock_timestamp() - make_interval(days => v_lock_incidents_days),
    'cutoff_table_samples', clock_timestamp() - make_interval(days => v_table_samples_days),
    'deleted_db_error_events', v_deleted_error_events,
    'deleted_db_health_samples', v_deleted_health_samples,
    'deleted_db_stat_deltas', v_deleted_stat_deltas,
    'deleted_db_stat_prior_state', v_deleted_prior_state,
    'deleted_db_lock_incidents', v_deleted_lock_incidents,
    'deleted_db_table_samples', v_deleted_table_samples
  );
end;
$$;

-- Grants/ACL tripwire are unchanged from Phase 1 (same signature, same
-- role), but CREATE OR REPLACE does not touch grants — re-asserting them
-- here is defensive, not a behavior change, and costs nothing to repeat.
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

-- SIZES + SELF-MONITORING FACADE (brief §40-48's "table sizes" +
-- "rows written per day per table"). `rows_last_24h` is a ROLLING 24h
-- count (clock_timestamp() - interval), not a calendar-day bucket count —
-- more useful for "is this collector actually still writing" than a
-- midnight-aligned bucket would be, and consistent with how every other
-- window in this series is rolling rather than calendar-aligned.
create or replace function public.helm_debug_read_observability_sizes()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from (
    select 'db_error_events'::text as table_name,
      pg_total_relation_size('helm_debug.db_error_events'::regclass) as total_bytes,
      (select count(*) from helm_debug.db_error_events) as row_count,
      (select count(*) from helm_debug.db_error_events where occurred_at >= clock_timestamp() - interval '1 day') as rows_last_24h
    union all
    select 'db_health_samples',
      pg_total_relation_size('helm_debug.db_health_samples'::regclass),
      (select count(*) from helm_debug.db_health_samples),
      (select count(*) from helm_debug.db_health_samples where sampled_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_stat_deltas',
      pg_total_relation_size('helm_debug.db_stat_deltas'::regclass),
      (select count(*) from helm_debug.db_stat_deltas),
      (select count(*) from helm_debug.db_stat_deltas where sampled_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_stat_prior_state',
      pg_total_relation_size('helm_debug.db_stat_prior_state'::regclass),
      (select count(*) from helm_debug.db_stat_prior_state),
      (select count(*) from helm_debug.db_stat_prior_state where last_seen_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_lock_incidents',
      pg_total_relation_size('helm_debug.db_lock_incidents'::regclass),
      (select count(*) from helm_debug.db_lock_incidents),
      (select count(*) from helm_debug.db_lock_incidents where detected_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_table_samples',
      pg_total_relation_size('helm_debug.db_table_samples'::regclass),
      (select count(*) from helm_debug.db_table_samples),
      (select count(*) from helm_debug.db_table_samples where sampled_at >= clock_timestamp() - interval '1 day')
  ) t
$$;

revoke execute on function public.helm_debug_read_observability_sizes() from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_observability_sizes()
to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_observability_sizes()'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_observability_sizes callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_observability_sizes not executable by service_role';
  end if;
end $$;

-- No row-level policies: this migration creates no table. Both functions
-- are definer-rights facades over existing helm_debug tables, same pattern
-- as every migration in this series.
