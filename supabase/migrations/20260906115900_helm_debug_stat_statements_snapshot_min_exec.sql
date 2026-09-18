-- Helm Debug — add min_exec_ms to the stat-statements snapshot (D5 task 1).
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md.
--
-- `helm_debug_stat_statements_snapshot` (applied 2026-09-03, `search_path`
-- corrected by 20260903190000) already returns total/mean/max exec time
-- per queryid. The Database Tab's statement-samples table wants a fourth
-- timing column (min), which `pg_stat_statements.min_exec_time` already
-- exposes — this is an ADDITIVE field on the function's jsonb return, not
-- a signature change, so no ambiguous-overload risk the way changing an
-- argument list would carry (contrast
-- 20260903191300_helm_debug_observability_retention_v2.sql's header). Body
-- otherwise byte-identical to the live function; `search_path` stays
-- `pg_catalog, extensions, helm_debug` from the 20260903190000 fix.
--
-- ROLLBACK: CREATE OR REPLACE back to the version at
-- 20260903190000_helm_debug_stat_snapshot_extensions_search_path.sql (minus
-- this field).

-- VERIFY: select 1 from pg_proc where oid = 'public.helm_debug_stat_statements_snapshot(integer)'::regprocedure;
-- VERIFY: select 1 from (select count(*) c from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'helm_debug_stat_statements_snapshot') s where s.c = 1;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'helm_debug_stat_statements_snapshot' and p.prosrc like '%min_exec_ms%';
-- VERIFY: select 1 where has_function_privilege('anon', 'public.helm_debug_stat_statements_snapshot(integer)', 'execute') = false;
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.helm_debug_stat_statements_snapshot(integer)', 'execute');

create or replace function public.helm_debug_stat_statements_snapshot(
    p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, helm_debug
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
      s.min_exec_time as min_exec_ms,
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

revoke execute on function public.helm_debug_stat_statements_snapshot(
    integer
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_stat_statements_snapshot(
    integer
) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_stat_statements_snapshot(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_stat_statements_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_stat_statements_snapshot not executable by service_role';
  end if;
end $$;
