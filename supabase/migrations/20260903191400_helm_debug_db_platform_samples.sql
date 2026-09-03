-- Helm Debug — Supabase platform metrics sample store (brief §20, §22)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as 20260903180000/100/200/300: new schema objects only, revoked
-- from public/anon/authenticated, reached only through the two
-- definer-rights facades below. Purely additive — touches no existing
-- table, function or grant outside this new surface.
--
-- SOURCE: one row per Vercel-cron tick of
-- `src/app/api/cron/db-health-sampler/route.ts`, which this migration's
-- companion change extends to also call
-- `fetchSupabasePlatformMetrics()`
-- (`src/lib/observability/supabase/metrics-api.ts`)
-- and write one row here — the same 5-minute cadence as
-- `db_health_samples`, no new cron schedule. `evaluatePlatformRules`
-- (`src/lib/observability/supabase/platform-rules.ts`) reads the last few
-- rows back through `helm_debug_read_db_platform_history` to evaluate the
-- CPU/memory/up rules over a short in-process ring — it never queries this
-- table directly (it cannot: `helm_debug` is not PostgREST-exposed, and even
-- `service_role` lacks `USAGE` on the schema — see
-- docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §3).
--
-- EVERY METRIC COLUMN IS NULLABLE, DELIBERATELY. `metrics-api.ts`'s own
-- header records that its metric-name allow-list is docs-derived, not
-- live-verified (no SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY was
-- available to the session that wrote this migration) — a metric this
-- project's live scrape does not actually expose under the assumed name
-- must store NULL, never a fabricated 0. `db_up` is `smallint` holding
-- literally 0 or 1 (never a boolean) so "unknown" (NULL) can never collapse
-- into "down" (0) at the storage layer either.
--
-- RETENTION: NOT wired in this migration. Folding `db_platform_samples`
-- into `helm_debug_prune_observability` (20260903180300) would be a
-- cross-track edit into a migration another track owns and already shipped;
-- this is a named, documented gap — see
-- docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md — not a silent
-- omission. At 5-minute cadence this grows ~8,640 rows/month, same order as
-- `db_health_samples`, which the retention doc already budgets for.
--
-- ROLLBACK:
-- DROP FUNCTION public.helm_debug_read_db_platform_history(integer);
-- DROP FUNCTION public.record_db_platform_sample(
--   smallint, numeric, numeric, integer, integer, numeric, numeric, numeric,
--   bigint, numeric, integer, integer, numeric, integer, integer, numeric,
--   integer, text
-- );
-- DROP TABLE helm_debug.db_platform_samples;

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_platform_samples (
    id bigint generated always as identity primary key,
    sampled_at timestamptz not null default clock_timestamp(),
    db_up smallint,
    cpu_pct numeric(5, 2),
    memory_pct numeric(5, 2),
    connections_used integer,
    connections_max integer,
    pool_saturation_pct numeric(5, 2),
    wal_or_replication_lag_seconds numeric(12, 3),
    io_pressure numeric(5, 2),
    db_size_bytes bigint,
    autovacuum_or_bloat_signal numeric(8, 2),
    postgrest_pool_used integer,
    postgrest_pool_max integer,
    postgrest_pool_saturation_pct numeric(5, 2),
    auth_pool_used integer,
    auth_pool_max integer,
    auth_pool_saturation_pct numeric(5, 2),
    realtime_subscriptions integer,
    -- 'ok' | 'unconfigured' | 'unreachable' | 'unparseable' — mirrors
    -- PlatformSourceStatus exactly; never silently 'ok' when the fetch
    -- itself failed.
    source_status text not null,
    constraint db_platform_samples_db_up_check check (
        db_up is null or db_up in (0, 1)
    ),
    constraint db_platform_samples_source_status_check check (
        source_status in ('ok', 'unconfigured', 'unreachable', 'unparseable')
    )
);

create index if not exists db_platform_samples_sampled_at_idx
on helm_debug.db_platform_samples (sampled_at desc);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

create or replace function public.record_db_platform_sample(
    p_db_up smallint,
    p_cpu_pct numeric,
    p_memory_pct numeric,
    p_connections_used integer,
    p_connections_max integer,
    p_pool_saturation_pct numeric,
    p_wal_or_replication_lag_seconds numeric,
    p_io_pressure numeric,
    p_db_size_bytes bigint,
    p_autovacuum_or_bloat_signal numeric,
    p_postgrest_pool_used integer,
    p_postgrest_pool_max integer,
    p_postgrest_pool_saturation_pct numeric,
    p_auth_pool_used integer,
    p_auth_pool_max integer,
    p_auth_pool_saturation_pct numeric,
    p_realtime_subscriptions integer,
    p_source_status text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_id bigint;
begin
  insert into helm_debug.db_platform_samples (
    db_up, cpu_pct, memory_pct, connections_used, connections_max,
    pool_saturation_pct, wal_or_replication_lag_seconds, io_pressure,
    db_size_bytes, autovacuum_or_bloat_signal, postgrest_pool_used,
    postgrest_pool_max, postgrest_pool_saturation_pct, auth_pool_used,
    auth_pool_max, auth_pool_saturation_pct, realtime_subscriptions,
    source_status
  ) values (
    p_db_up, p_cpu_pct, p_memory_pct, p_connections_used, p_connections_max,
    p_pool_saturation_pct, p_wal_or_replication_lag_seconds, p_io_pressure,
    p_db_size_bytes, p_autovacuum_or_bloat_signal, p_postgrest_pool_used,
    p_postgrest_pool_max, p_postgrest_pool_saturation_pct, p_auth_pool_used,
    p_auth_pool_max, p_auth_pool_saturation_pct, p_realtime_subscriptions,
    coalesce(p_source_status, 'unreachable')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.record_db_platform_sample(
    smallint, numeric, numeric, integer, integer, numeric, numeric, numeric,
    bigint, numeric, integer, integer, numeric, integer, integer, numeric,
    integer, text
) from public, anon, authenticated;
grant execute on function public.record_db_platform_sample(
    smallint, numeric, numeric, integer, integer, numeric, numeric, numeric,
    bigint, numeric, integer, integer, numeric, integer, integer, numeric,
    integer, text
) to service_role;

do $$
declare
  v_write_fn oid := 'public.record_db_platform_sample(smallint, numeric, numeric, integer, integer, numeric, numeric, numeric, bigint, numeric, integer, integer, numeric, integer, integer, numeric, integer, text)'::regprocedure;
begin
  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_platform_sample callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_platform_sample not executable by service_role';
  end if;
end $$;

-- READ facade for the Bridge and for `evaluatePlatformRules`'s in-process
-- ring — same reasoning as every other `helm_debug_read_*` facade: the
-- schema is not PostgREST-exposed, so an RPC is the only read path.
create or replace function public.helm_debug_read_db_platform_history(
    p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_platform_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

revoke execute on function public.helm_debug_read_db_platform_history(
    integer
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_db_platform_history(
    integer
) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_platform_history(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_platform_history callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_platform_history not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as the sibling migrations' own tail
-- comments: no role other than service_role (via the facades above) can
-- reach this table at all, so RLS would add nothing.
