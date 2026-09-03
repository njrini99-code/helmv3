-- Helm Debug — pg_stat_statements delta engine store (brief §16–17)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as the two migrations before it.
--
-- THREE OBJECTS, ONE PROBLEM: "cumulative counters, sampled Top-K"
-- ---------------------------------------------------------------------
-- pg_stat_statements counters are cumulative since
-- `pg_stat_statements_info.stats_reset` (measured 2026-02-03 in
-- production — see the measured-truth doc). Only the Top-K queries by
-- cumulative total_exec_time are ever fetched (brief: 25-50), which means a
-- queryid that falls OUT of the Top-K for a window and later re-enters has
-- no prior-window row to diff against in a plain history table — that must
-- read as "collecting", never as a false spike.
--
-- `db_stat_prior_state` solves this: ONE row per queryid (upsert, not
-- append), holding the raw absolute counters and the rolling baseline last
-- observed for that queryid, REGARDLESS of whether it made this window's
-- Top-K. `db_stat_deltas` is the append-only history of Top-K windows the
-- Bridge Query Performance view reads. `db_stat_prior_state` is internal
-- delta/baseline bookkeeping, never rendered directly.
--
-- NO RAW QUERY TEXT, ANYWHERE (brief §16, §40-48). `queryid` is the only
-- identifier persisted; `safe_query_class` is a small closed label computed
-- INSIDE `helm_debug_stat_statements_snapshot()` from the query text via a
-- bounded pattern match, and the raw text itself never leaves that
-- function's local scope.
--
-- ROLLBACK: drop the three functions, then both tables — nothing else
-- references them.

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_stat_prior_state (
  queryid text primary key,
  last_seen_at timestamptz not null default clock_timestamp(),
  stats_reset_at timestamptz,
  calls bigint not null,
  total_exec_ms numeric not null,
  rows bigint not null,
  shared_blks_hit bigint not null,
  shared_blks_read bigint not null,
  temp_blks_read bigint not null,
  temp_blks_written bigint not null,
  wal_bytes bigint not null,
  -- Rolling baseline (brief §17) — a simple online mean/max, not a full
  -- distribution. `baseline_status` starts 'collecting' and only becomes
  -- 'established' once `sample_count` clears a minimum (enforced in
  -- TypeScript, src/lib/observability/supabase/query-regression.ts) — a
  -- judgment call on "sufficient samples" the brief leaves to the
  -- implementation.
  mean_exec_ms_baseline numeric,
  max_exec_ms_baseline numeric,
  rows_per_call_baseline numeric,
  sample_count integer not null default 0,
  baseline_status text not null default 'collecting'
    check (baseline_status in ('collecting', 'established'))
);

create table if not exists helm_debug.db_stat_deltas (
  id bigint generated always as identity primary key,
  sampled_at timestamptz not null default clock_timestamp(),
  stats_reset_at timestamptz,
  queryid text not null,
  safe_query_class text not null,
  source_class text not null check (source_class in (
    'helm_product', 'supabase_realtime', 'pg_net_job', 'pg_cron_job',
    'observability', 'unknown'
  )),
  calls_delta bigint,
  total_exec_ms_delta numeric,
  mean_exec_ms_window numeric,
  max_exec_ms_observed numeric,
  rows_delta bigint,
  wal_bytes_delta bigint,
  shared_blks_hit_delta bigint,
  shared_blks_read_delta bigint,
  temp_blks_read_delta bigint,
  temp_blks_written_delta bigint,
  -- Regression evaluation for this window, computed in TypeScript
  -- (query-regression.ts) and stored alongside the delta it was computed
  -- from, so the Bridge never has to re-derive it from raw counters.
  regression_flags text[] not null default '{}',
  baseline_status text not null default 'collecting'
    check (baseline_status in ('collecting', 'established'))
);

create index if not exists db_stat_deltas_sampled_at_idx
  on helm_debug.db_stat_deltas (sampled_at desc);
create index if not exists db_stat_deltas_queryid_idx
  on helm_debug.db_stat_deltas (queryid, sampled_at desc);
create index if not exists db_stat_deltas_regression_idx
  on helm_debug.db_stat_deltas (sampled_at desc)
  where regression_flags <> '{}';

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- READ: current Top-K by cumulative total_exec_time, plus prior state for
-- exactly those queryids (never the whole prior-state table). No query TEXT
-- in the return value — only `safe_query_class`, computed here from a
-- bounded prefix of the text and then discarded.
create or replace function public.helm_debug_stat_statements_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_stats_reset timestamptz;
  v_current jsonb;
  v_prior jsonb;
begin
  select stats_reset into v_stats_reset from pg_stat_statements_info;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_current
  from (
    select
      s.queryid::text as queryid,
      s.calls,
      s.total_exec_time as total_exec_ms,
      s.mean_exec_time as mean_exec_ms,
      s.max_exec_time as max_exec_ms,
      s.rows,
      s.shared_blks_hit,
      s.shared_blks_read,
      s.temp_blks_read,
      s.temp_blks_written,
      coalesce(s.wal_bytes, 0) as wal_bytes,
      case
        when left(s.query, 200) ilike '%wal->>%' then 'realtime_wal_decode'
        when left(s.query, 200) ilike '%pg_publication%' then 'realtime_catalog'
        when left(s.query, 200) ilike '%pgrst_source%' or left(s.query, 200) ilike '%pgrst_call%' then 'postgrest_query'
        when left(s.query, 200) ilike '%cron.job%' then 'pg_cron_internal'
        when left(s.query, 200) ilike '%net.http%' or left(s.query, 200) ilike '%net_http%' then 'pg_net_internal'
        when left(s.query, 200) ilike '%helm_debug%' or left(s.query, 200) ilike '%record_db_%' then 'helm_observability'
        else 'unclassified'
      end as safe_query_class,
      case
        when left(s.query, 200) ilike '%wal->>%' or left(s.query, 200) ilike '%pg_publication%' then 'supabase_realtime'
        when left(s.query, 200) ilike '%pgrst_source%' or left(s.query, 200) ilike '%pgrst_call%' then 'helm_product'
        when left(s.query, 200) ilike '%cron.job%' then 'pg_cron_job'
        when left(s.query, 200) ilike '%net.http%' or left(s.query, 200) ilike '%net_http%' then 'pg_net_job'
        when left(s.query, 200) ilike '%helm_debug%' or left(s.query, 200) ilike '%record_db_%' then 'observability'
        else 'unknown'
      end as source_class
    from pg_stat_statements s
    where s.dbid = (select oid from pg_database where datname = current_database())
    order by s.total_exec_time desc
    limit v_limit
  ) t;

  select coalesce(jsonb_object_agg(p.queryid, to_jsonb(p) - 'queryid'), '{}'::jsonb) into v_prior
  from helm_debug.db_stat_prior_state p
  where p.queryid in (select jsonb_array_elements(v_current) ->> 'queryid');

  return jsonb_build_object(
    'stats_reset_at', v_stats_reset,
    'current', v_current,
    'prior', v_prior
  );
end;
$$;

-- WRITE: one call persists both the window's Top-K deltas (history, for the
-- Bridge) and the refreshed prior-state/baseline row per queryid (internal
-- bookkeeping) — both computed in TypeScript from the snapshot above.
create or replace function public.record_db_stat_snapshot(
  p_sampled_at timestamptz,
  p_stats_reset_at timestamptz,
  p_delta_rows jsonb,
  p_prior_state_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_delta_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_stat_deltas (
      sampled_at, stats_reset_at, queryid, safe_query_class, source_class,
      calls_delta, total_exec_ms_delta, mean_exec_ms_window,
      max_exec_ms_observed, rows_delta, wal_bytes_delta,
      shared_blks_hit_delta, shared_blks_read_delta, temp_blks_read_delta,
      temp_blks_written_delta, regression_flags, baseline_status
    ) values (
      p_sampled_at, p_stats_reset_at,
      v_row ->> 'queryid',
      v_row ->> 'safeQueryClass',
      v_row ->> 'sourceClass',
      nullif(v_row ->> 'callsDelta', '')::bigint,
      nullif(v_row ->> 'totalExecMsDelta', '')::numeric,
      nullif(v_row ->> 'meanExecMsWindow', '')::numeric,
      nullif(v_row ->> 'maxExecMsObserved', '')::numeric,
      nullif(v_row ->> 'rowsDelta', '')::bigint,
      nullif(v_row ->> 'walBytesDelta', '')::bigint,
      nullif(v_row ->> 'sharedBlksHitDelta', '')::bigint,
      nullif(v_row ->> 'sharedBlksReadDelta', '')::bigint,
      nullif(v_row ->> 'tempBlksReadDelta', '')::bigint,
      nullif(v_row ->> 'tempBlksWrittenDelta', '')::bigint,
      coalesce(
        array(select jsonb_array_elements_text(v_row -> 'regressionFlags')),
        '{}'
      ),
      coalesce(v_row ->> 'baselineStatus', 'collecting')
    );
    v_count := v_count + 1;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_prior_state_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_stat_prior_state (
      queryid, last_seen_at, stats_reset_at, calls, total_exec_ms, rows,
      shared_blks_hit, shared_blks_read, temp_blks_read, temp_blks_written,
      wal_bytes, mean_exec_ms_baseline, max_exec_ms_baseline,
      rows_per_call_baseline, sample_count, baseline_status
    ) values (
      v_row ->> 'queryid', p_sampled_at, p_stats_reset_at,
      (v_row ->> 'calls')::bigint,
      (v_row ->> 'totalExecMs')::numeric,
      (v_row ->> 'rows')::bigint,
      (v_row ->> 'sharedBlksHit')::bigint,
      (v_row ->> 'sharedBlksRead')::bigint,
      (v_row ->> 'tempBlksRead')::bigint,
      (v_row ->> 'tempBlksWritten')::bigint,
      (v_row ->> 'walBytes')::bigint,
      nullif(v_row ->> 'meanExecMsBaseline', '')::numeric,
      nullif(v_row ->> 'maxExecMsBaseline', '')::numeric,
      nullif(v_row ->> 'rowsPerCallBaseline', '')::numeric,
      coalesce((v_row ->> 'sampleCount')::integer, 0),
      coalesce(v_row ->> 'baselineStatus', 'collecting')
    )
    on conflict (queryid) do update set
      last_seen_at = excluded.last_seen_at,
      stats_reset_at = excluded.stats_reset_at,
      calls = excluded.calls,
      total_exec_ms = excluded.total_exec_ms,
      rows = excluded.rows,
      shared_blks_hit = excluded.shared_blks_hit,
      shared_blks_read = excluded.shared_blks_read,
      temp_blks_read = excluded.temp_blks_read,
      temp_blks_written = excluded.temp_blks_written,
      wal_bytes = excluded.wal_bytes,
      mean_exec_ms_baseline = excluded.mean_exec_ms_baseline,
      max_exec_ms_baseline = excluded.max_exec_ms_baseline,
      rows_per_call_baseline = excluded.rows_per_call_baseline,
      sample_count = excluded.sample_count,
      baseline_status = excluded.baseline_status;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.helm_debug_stat_statements_snapshot(integer) from public, anon, authenticated;
grant execute on function public.helm_debug_stat_statements_snapshot(integer) to service_role;

revoke execute on function public.record_db_stat_snapshot(timestamptz, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_db_stat_snapshot(timestamptz, timestamptz, jsonb, jsonb) to service_role;

do $$
declare
  v_read_fn oid := 'public.helm_debug_stat_statements_snapshot(integer)'::regprocedure;
  v_write_fn oid := 'public.record_db_stat_snapshot(timestamptz, timestamptz, jsonb, jsonb)'::regprocedure;
begin
  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_stat_statements_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_stat_statements_snapshot not executable by service_role';
  end if;

  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_stat_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_stat_snapshot not executable by service_role';
  end if;
end $$;

-- READ facade for the Bridge (src/lib/admin/database/performance.ts) — same
-- reasoning as the sibling migrations' read facades. Returns the MOST
-- RECENT window's rows (Query Performance's default view) plus, separately,
-- any row flagged with a regression in the last `p_regression_lookback_hours`
-- (so a regression that happened between two Bridge page loads is not lost
-- the moment a fresh, unflagged window is written).
create or replace function public.helm_debug_read_db_stat_deltas(
  p_regression_lookback_hours integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_latest_sampled_at timestamptz;
  v_latest jsonb;
  v_regressions jsonb;
begin
  select max(sampled_at) into v_latest_sampled_at from helm_debug.db_stat_deltas;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.total_exec_ms_delta desc nulls last), '[]'::jsonb)
  into v_latest
  from (
    select * from helm_debug.db_stat_deltas where sampled_at = v_latest_sampled_at
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  into v_regressions
  from (
    select *
    from helm_debug.db_stat_deltas
    where regression_flags <> '{}'
      and sampled_at >= clock_timestamp() - make_interval(hours => greatest(1, least(coalesce(p_regression_lookback_hours, 24), 168)))
    order by sampled_at desc
    limit 100
  ) t;

  return jsonb_build_object(
    'latest_sampled_at', v_latest_sampled_at,
    'latest', v_latest,
    'recent_regressions', v_regressions
  );
end;
$$;

revoke execute on function public.helm_debug_read_db_stat_deltas(integer) from public, anon, authenticated;
grant execute on function public.helm_debug_read_db_stat_deltas(integer) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_stat_deltas(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_stat_deltas callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_stat_deltas not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as 20260903180000's tail comment.
