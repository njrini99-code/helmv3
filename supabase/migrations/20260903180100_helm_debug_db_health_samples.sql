-- Helm Debug — database health sampler store (brief §15)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as 20260903180000_helm_debug_db_error_events.sql: new schema
-- objects, revoked from public/anon/authenticated, reached only through the
-- two SECURITY DEFINER facades below.
--
-- WHY TWO FUNCTIONS, NOT ONE
-- -----------------------------
-- `helm_debug_db_health_snapshot()` is READ-ONLY: it gathers the current
-- absolute pg_stat_database/pg_stat_activity/pg_locks counters and the most
-- recent stored sample, and returns both. `record_db_health_sample(...)` is
-- the WRITE: it inserts one row. The delta arithmetic between "current" and
-- "previous" happens in TypeScript
-- (src/lib/observability/supabase/db-health-delta.ts), not in SQL, so it can
-- be unit-tested against fixtures without a database — brief §15/16's own
-- warning ("cumulative counters, so total > X is WRONG") is exactly the kind
-- of arithmetic that deserves a fixture-driven test, and plpgsql arithmetic
-- is not unit-testable the same way.
--
-- ROLLBACK: DROP FUNCTION public.record_db_health_sample(...); DROP
-- FUNCTION public.helm_debug_db_health_snapshot(); DROP TABLE
-- helm_debug.db_health_samples; — safe, nothing else references these.

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_health_samples (
  id bigint generated always as identity primary key,
  sampled_at timestamptz not null default clock_timestamp(),
  stats_reset_at timestamptz,
  -- Absolute values at sample time — the baseline the NEXT sample's delta
  -- computation diffs against (read back by helm_debug_db_health_snapshot()).
  connections_total integer not null,
  connections_active integer not null,
  connections_idle_in_tx integer not null,
  connections_waiting_lock integer not null,
  connections_pct_max numeric(5, 2),
  longest_active_ms integer,
  longest_idle_in_tx_ms integer,
  longest_lock_wait_ms integer,
  xact_commit bigint not null,
  xact_rollback bigint not null,
  deadlocks bigint not null,
  conflicts bigint not null,
  tup_returned bigint not null,
  tup_fetched bigint not null,
  tup_inserted bigint not null,
  tup_updated bigint not null,
  tup_deleted bigint not null,
  temp_files bigint not null,
  temp_bytes bigint not null,
  blks_read bigint not null,
  blks_hit bigint not null,
  db_size_bytes bigint not null,
  -- Deltas vs the previous sample — null on the very first sample (no prior
  -- row) or when a counter reset was detected (see collector_status).
  xact_commit_delta bigint,
  xact_rollback_delta bigint,
  deadlocks_delta bigint,
  conflicts_delta bigint,
  tup_returned_delta bigint,
  tup_fetched_delta bigint,
  tup_inserted_delta bigint,
  tup_updated_delta bigint,
  tup_deleted_delta bigint,
  temp_files_delta bigint,
  temp_bytes_delta bigint,
  blks_read_delta bigint,
  blks_hit_delta bigint,
  cache_hit_ratio numeric(6, 4),
  collector_version text not null default '1',
  -- 'ok' | 'first_sample' | 'reset_detected' | 'degraded' — never silently
  -- 'ok' when something optional could not be read (brief §26, §40-48).
  collector_status text not null default 'ok'
);

create index if not exists db_health_samples_sampled_at_idx
  on helm_debug.db_health_samples (sampled_at desc);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

create or replace function public.helm_debug_db_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_current jsonb;
  v_previous jsonb;
begin
  select jsonb_build_object(
    'sampled_at', clock_timestamp(),
    'stats_reset_at', d.stats_reset,
    'connections_total', (
      select count(*) from pg_stat_activity where datname = current_database()
    ),
    'connections_active', (
      select count(*) from pg_stat_activity
      where datname = current_database() and state = 'active' and pid <> pg_backend_pid()
    ),
    'connections_idle_in_tx', (
      select count(*) from pg_stat_activity
      where datname = current_database() and state = 'idle in transaction'
    ),
    'connections_waiting_lock', (
      select count(*) from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where not l.granted and a.datname = current_database()
    ),
    'longest_active_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - query_start)) * 1000)::integer, 0)
      from pg_stat_activity
      where datname = current_database() and state = 'active' and pid <> pg_backend_pid()
    ),
    'longest_idle_in_tx_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - state_change)) * 1000)::integer, 0)
      from pg_stat_activity
      where datname = current_database() and state = 'idle in transaction'
    ),
    'longest_lock_wait_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - a.query_start)) * 1000)::integer, 0)
      from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where not l.granted and a.datname = current_database()
    ),
    'xact_commit', d.xact_commit,
    'xact_rollback', d.xact_rollback,
    'deadlocks', d.deadlocks,
    'conflicts', d.conflicts,
    'tup_returned', d.tup_returned,
    'tup_fetched', d.tup_fetched,
    'tup_inserted', d.tup_inserted,
    'tup_updated', d.tup_updated,
    'tup_deleted', d.tup_deleted,
    'temp_files', d.temp_files,
    'temp_bytes', d.temp_bytes,
    'blks_read', d.blks_read,
    'blks_hit', d.blks_hit,
    'db_size_bytes', pg_database_size(current_database()),
    'max_connections', (select setting::integer from pg_settings where name = 'max_connections')
  )
  into v_current
  from pg_stat_database d
  where d.datname = current_database();

  select to_jsonb(s) into v_previous
  from (
    select sampled_at, stats_reset_at, xact_commit, xact_rollback, deadlocks,
      conflicts, tup_returned, tup_fetched, tup_inserted, tup_updated,
      tup_deleted, temp_files, temp_bytes, blks_read, blks_hit
    from helm_debug.db_health_samples
    order by sampled_at desc
    limit 1
  ) s;

  return jsonb_build_object('current', v_current, 'previous', v_previous);
end;
$$;

create or replace function public.record_db_health_sample(
  p_stats_reset_at timestamptz,
  p_connections_total integer,
  p_connections_active integer,
  p_connections_idle_in_tx integer,
  p_connections_waiting_lock integer,
  p_connections_pct_max numeric,
  p_longest_active_ms integer,
  p_longest_idle_in_tx_ms integer,
  p_longest_lock_wait_ms integer,
  p_xact_commit bigint,
  p_xact_rollback bigint,
  p_deadlocks bigint,
  p_conflicts bigint,
  p_tup_returned bigint,
  p_tup_fetched bigint,
  p_tup_inserted bigint,
  p_tup_updated bigint,
  p_tup_deleted bigint,
  p_temp_files bigint,
  p_temp_bytes bigint,
  p_blks_read bigint,
  p_blks_hit bigint,
  p_db_size_bytes bigint,
  p_xact_commit_delta bigint,
  p_xact_rollback_delta bigint,
  p_deadlocks_delta bigint,
  p_conflicts_delta bigint,
  p_tup_returned_delta bigint,
  p_tup_fetched_delta bigint,
  p_tup_inserted_delta bigint,
  p_tup_updated_delta bigint,
  p_tup_deleted_delta bigint,
  p_temp_files_delta bigint,
  p_temp_bytes_delta bigint,
  p_blks_read_delta bigint,
  p_blks_hit_delta bigint,
  p_cache_hit_ratio numeric,
  p_collector_status text default 'ok'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_id bigint;
begin
  insert into helm_debug.db_health_samples (
    stats_reset_at, connections_total, connections_active,
    connections_idle_in_tx, connections_waiting_lock, connections_pct_max,
    longest_active_ms, longest_idle_in_tx_ms, longest_lock_wait_ms,
    xact_commit, xact_rollback, deadlocks, conflicts, tup_returned,
    tup_fetched, tup_inserted, tup_updated, tup_deleted, temp_files,
    temp_bytes, blks_read, blks_hit, db_size_bytes, xact_commit_delta,
    xact_rollback_delta, deadlocks_delta, conflicts_delta,
    tup_returned_delta, tup_fetched_delta, tup_inserted_delta,
    tup_updated_delta, tup_deleted_delta, temp_files_delta,
    temp_bytes_delta, blks_read_delta, blks_hit_delta, cache_hit_ratio,
    collector_status
  ) values (
    p_stats_reset_at, p_connections_total, p_connections_active,
    p_connections_idle_in_tx, p_connections_waiting_lock,
    p_connections_pct_max, p_longest_active_ms, p_longest_idle_in_tx_ms,
    p_longest_lock_wait_ms, p_xact_commit, p_xact_rollback, p_deadlocks,
    p_conflicts, p_tup_returned, p_tup_fetched, p_tup_inserted,
    p_tup_updated, p_tup_deleted, p_temp_files, p_temp_bytes, p_blks_read,
    p_blks_hit, p_db_size_bytes, p_xact_commit_delta, p_xact_rollback_delta,
    p_deadlocks_delta, p_conflicts_delta, p_tup_returned_delta,
    p_tup_fetched_delta, p_tup_inserted_delta, p_tup_updated_delta,
    p_tup_deleted_delta, p_temp_files_delta, p_temp_bytes_delta,
    p_blks_read_delta, p_blks_hit_delta, p_cache_hit_ratio,
    coalesce(p_collector_status, 'ok')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.helm_debug_db_health_snapshot() from public, anon, authenticated;
grant execute on function public.helm_debug_db_health_snapshot() to service_role;

revoke execute on function public.record_db_health_sample(
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  numeric,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  numeric,
  text
) from public, anon, authenticated;
grant execute on function public.record_db_health_sample(
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  numeric,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  numeric,
  text
) to service_role;

do $$
declare
  v_read_fn oid := 'public.helm_debug_db_health_snapshot()'::regprocedure;
  v_write_fn oid := 'public.record_db_health_sample(timestamptz, integer, integer, integer, integer, numeric, integer, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric, text)'::regprocedure;
begin
  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_health_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_health_snapshot not executable by service_role';
  end if;

  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_health_sample callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_health_sample not executable by service_role';
  end if;
end $$;

-- READ facade for the Bridge (src/lib/admin/database/overview.ts) — same
-- reasoning as helm_debug_read_db_error_events in the sibling migration:
-- helm_debug is not PostgREST-exposed, so an RPC is the only read path.
create or replace function public.helm_debug_read_db_health_history(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_health_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

revoke execute on function public.helm_debug_read_db_health_history(integer) from public, anon, authenticated;
grant execute on function public.helm_debug_read_db_health_history(integer) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_health_history(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_health_history callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_health_history not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as 20260903180000's tail comment.
