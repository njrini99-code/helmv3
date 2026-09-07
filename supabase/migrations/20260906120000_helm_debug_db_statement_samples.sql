-- Helm Debug — Database Tab (D5): Top-25-by-total / Top-25-by-mean
-- statement samples, with a once-per-day Sentry paging gate per queryid.
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as 20260903180200_helm_debug_db_stat_deltas.sql: additive only,
-- `helm_debug` schema already exists and is already revoked from
-- public/anon/authenticated by that earlier migration.
--
-- WHY A SEPARATE TABLE FROM db_stat_deltas
-- ---------------------------------------------------------------------
-- `db_stat_deltas` (already applied) stores ONE Top-K-by-total window per
-- 15-minute sample, ranked only by `total_exec_ms_delta`. The Database
-- tab's "Slow statements" section needs the RANKING ITSELF to be a stored
-- fact — top 25 by total time and, separately, top 25 by mean time — so a
-- 7-day sparkline per fingerprint can be drawn without re-deriving two
-- different sort orders from a table that only ever recorded one. Ranking
-- is computed in TypeScript (`db-stat-delta/route.ts`, from the SAME
-- snapshot RPC call already made for db_stat_deltas — no second read of
-- pg_stat_statements), then persisted here as two labelled slices
-- (`rank_kind`) of the same window.
--
-- SENTRY PAGING GATE: `db_statement_alert_state` holds one row per queryid
-- with the last time that queryid paged Sentry for a mean-exec-time
-- threshold breach. The cron checks this table before calling
-- `Sentry.captureMessage`, so a statement stuck over the 500ms mean
-- threshold for hours pages once per UTC day, not once every 15 minutes.
--
-- NO RAW QUERY TEXT — same contract as db_stat_deltas: only `queryid` and
-- `safe_query_class` (computed server-side from a bounded text prefix,
-- never returned as-is) are persisted.
--
-- ROLLBACK: drop the four functions, then both tables.

create schema if not exists helm_debug;

create table if not exists helm_debug.db_statement_samples (
    id bigint generated always as identity primary key,
    sampled_at timestamptz not null default clock_timestamp(),
    rank_kind text not null check (rank_kind in ('total', 'mean')),
    rank_position integer not null check (rank_position between 1 and 25),
    queryid text not null,
    safe_query_class text not null,
    source_class text not null,
    calls bigint not null,
    rows bigint not null,
    total_exec_ms numeric not null,
    mean_exec_ms numeric not null,
    max_exec_ms numeric not null,
    min_exec_ms numeric
);

create index if not exists db_statement_samples_sampled_at_idx
on helm_debug.db_statement_samples (sampled_at desc);
create index if not exists db_statement_samples_queryid_idx
on helm_debug.db_statement_samples (queryid, sampled_at desc);
create index if not exists db_statement_samples_rank_idx
on helm_debug.db_statement_samples (rank_kind, sampled_at desc, rank_position);

create table if not exists helm_debug.db_statement_alert_state (
    queryid text primary key,
    last_paged_at timestamptz not null,
    last_mean_exec_ms numeric not null
);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- WRITE: persists both rank slices for one window plus, optionally, the
-- alert-state upsert for queryids the caller decided to page this run
-- (`p_paged_queryids`) — folded into the same call so the paging decision
-- and its dedup record land atomically with the sample it was computed
-- from.
create or replace function public.record_db_statement_samples(
    p_sampled_at timestamptz,
    p_total_rows jsonb,
    p_mean_rows jsonb,
    p_paged_queryids jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_row jsonb;
  v_position integer;
  v_count integer := 0;
begin
  v_position := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_total_rows, '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into helm_debug.db_statement_samples (
      sampled_at, rank_kind, rank_position, queryid, safe_query_class,
      source_class, calls, rows, total_exec_ms, mean_exec_ms, max_exec_ms,
      min_exec_ms
    ) values (
      p_sampled_at, 'total', v_position,
      v_row ->> 'queryid', v_row ->> 'safeQueryClass', v_row ->> 'sourceClass',
      (v_row ->> 'calls')::bigint, (v_row ->> 'rows')::bigint,
      (v_row ->> 'totalExecMs')::numeric, (v_row ->> 'meanExecMs')::numeric,
      (v_row ->> 'maxExecMs')::numeric, nullif(v_row ->> 'minExecMs', '')::numeric
    );
    v_count := v_count + 1;
  end loop;

  v_position := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_mean_rows, '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into helm_debug.db_statement_samples (
      sampled_at, rank_kind, rank_position, queryid, safe_query_class,
      source_class, calls, rows, total_exec_ms, mean_exec_ms, max_exec_ms,
      min_exec_ms
    ) values (
      p_sampled_at, 'mean', v_position,
      v_row ->> 'queryid', v_row ->> 'safeQueryClass', v_row ->> 'sourceClass',
      (v_row ->> 'calls')::bigint, (v_row ->> 'rows')::bigint,
      (v_row ->> 'totalExecMs')::numeric, (v_row ->> 'meanExecMs')::numeric,
      (v_row ->> 'maxExecMs')::numeric, nullif(v_row ->> 'minExecMs', '')::numeric
    );
    v_count := v_count + 1;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_paged_queryids, '[]'::jsonb))
  loop
    insert into helm_debug.db_statement_alert_state (queryid, last_paged_at, last_mean_exec_ms)
    values (v_row ->> 'queryid', p_sampled_at, (v_row ->> 'meanExecMs')::numeric)
    on conflict (queryid) do update set
      last_paged_at = excluded.last_paged_at,
      last_mean_exec_ms = excluded.last_mean_exec_ms;
  end loop;

  return v_count;
end;
$$;

-- READ: last-paged-at for a bounded set of queryids, so the cron can decide
-- "has this one already paged in the last 24h" without scanning the whole
-- alert-state table.
create or replace function public.helm_debug_read_statement_alert_state(
    p_queryids text[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_object_agg(queryid, last_paged_at), '{}'::jsonb)
  from helm_debug.db_statement_alert_state
  where queryid = any(coalesce(p_queryids, '{}'::text[]));
$$;

-- READ facade for the Bridge: top 10 (of the stored top 25) by total and by
-- mean from the most recent window, plus a 7-day time series per queryid
-- for the sparkline (mean_exec_ms only, at most 7*24*4 points per query —
-- bounded by the 15-minute cadence and a 7-day lookback).
create or replace function public.helm_debug_read_db_statement_samples(
    p_top_n integer default 10,
    p_sparkline_days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_days integer := greatest(1, least(coalesce(p_sparkline_days, 7), 30));
  v_latest_sampled_at timestamptz;
  v_top_total jsonb;
  v_top_mean jsonb;
  v_sparklines jsonb;
begin
  select max(sampled_at) into v_latest_sampled_at from helm_debug.db_statement_samples;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank_position), '[]'::jsonb) into v_top_total
  from (
    select * from helm_debug.db_statement_samples
    where sampled_at = v_latest_sampled_at and rank_kind = 'total' and rank_position <= v_top
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank_position), '[]'::jsonb) into v_top_mean
  from (
    select * from helm_debug.db_statement_samples
    where sampled_at = v_latest_sampled_at and rank_kind = 'mean' and rank_position <= v_top
  ) t;

  select coalesce(jsonb_object_agg(s.queryid, s.points), '{}'::jsonb) into v_sparklines
  from (
    select
      queryid,
      jsonb_agg(jsonb_build_object('sampledAt', sampled_at, 'meanExecMs', mean_exec_ms) order by sampled_at) as points
    from helm_debug.db_statement_samples
    where sampled_at >= clock_timestamp() - make_interval(days => v_days)
      and queryid in (
        select e.value ->> 'queryid' from jsonb_array_elements(v_top_total) e
        union
        select e.value ->> 'queryid' from jsonb_array_elements(v_top_mean) e
      )
    group by queryid
  ) s;

  return jsonb_build_object(
    'latest_sampled_at', v_latest_sampled_at,
    'top_by_total', v_top_total,
    'top_by_mean', v_top_mean,
    'sparklines', v_sparklines
  );
end;
$$;

revoke execute on function public.record_db_statement_samples(
    timestamptz, jsonb, jsonb, jsonb
) from public,
anon,
authenticated;
grant execute on function public.record_db_statement_samples(
    timestamptz, jsonb, jsonb, jsonb
) to service_role;

revoke execute on function public.helm_debug_read_statement_alert_state(
    text[]
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_statement_alert_state(
    text[]
) to service_role;

revoke execute on function public.helm_debug_read_db_statement_samples(
    integer, integer
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_db_statement_samples(
    integer, integer
) to service_role;

do $$
declare
  v_write_fn oid := 'public.record_db_statement_samples(timestamptz, jsonb, jsonb, jsonb)'::regprocedure;
  v_alert_read_fn oid := 'public.helm_debug_read_statement_alert_state(text[])'::regprocedure;
  v_read_fn oid := 'public.helm_debug_read_db_statement_samples(integer, integer)'::regprocedure;
begin
  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_statement_samples callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_statement_samples not executable by service_role';
  end if;

  if has_function_privilege('public', v_alert_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_alert_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_alert_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_statement_alert_state callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_alert_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_statement_alert_state not executable by service_role';
  end if;

  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_statement_samples callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_statement_samples not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as 20260903180000's tail comment:
-- these tables are reachable only through the SECURITY DEFINER facades
-- above, and `helm_debug` itself has no USAGE grant to anon/authenticated.

-- Retention: 30 days, handled by
-- 20260906120200_helm_debug_observability_retention_v3.sql extending
-- `public.helm_debug_prune_observability` (existing `db-observability-prune`
-- cron) — kept in its own file rather than inline here so this migration
-- stays purely additive and does not touch a function another track may
-- also be extending this session.
