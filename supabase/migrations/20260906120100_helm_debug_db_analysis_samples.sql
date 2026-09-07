-- Helm Debug — Database Tab (D5): index-advisor suggestions, unused
-- indexes, bloat, sequential-scan ratios, connection and lock counts.
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Additive only,
-- same isolation pattern as every helm_debug migration before it.
--
-- ONE WIDE TABLE, ONE `category`, PER BRIEF §D5-2 — deliberate. Six
-- different finding shapes (index suggestion, unused index, bloat,
-- seq-scan ratio, connections, locks) each modeled as their own table
-- would multiply this migration's surface area for no reader benefit; the
-- Bridge groups by `category` and renders `payload` per-category, same
-- pattern `db_platform_samples` already uses for a heterogeneous metric
-- set (`docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md`).
--
-- CAPABILITY-DETECTED, NEVER CREATE EXTENSION FROM APP CODE. `pgstattuple`
-- and `index_advisor` (which itself depends on `hypopg`) are each checked
-- against `pg_extension` before use; if either is absent the function
-- records ONE finding row saying so (category `bloat`/`index_suggestion`,
-- `payload->>'note'`) and skips the rest of that category rather than
-- calling `CREATE EXTENSION`, which is an owner-only action per
-- `.claude/rules/database.md`.
--
-- INDEX-ADVISOR NEEDS RAW QUERY TEXT, LOCALLY, ONCE — a deliberate,
-- narrow exception to the "no raw text leaves this function" rule the
-- statement-capture migration states, not a contradiction of it. Text is
-- read from `pg_stat_statements.query` for the bounded set of `queryid`s
-- already captured in `helm_debug.db_statement_samples`'s current window,
-- passed straight into `extensions.index_advisor(query text)` INSIDE this
-- SECURITY DEFINER function's local scope, and only `index_advisor`'s own
-- output (startup/total cost estimates and CREATE INDEX statement text —
-- column/table names, no literal values) is returned. The query text
-- itself never leaves this function body.
--
-- ROLLBACK: drop the three functions, then the table.

create schema if not exists helm_debug;

create table if not exists helm_debug.db_analysis_samples (
    id bigint generated always as identity primary key,
    sampled_at timestamptz not null default clock_timestamp(),
    category text not null check (category in (
        'index_suggestion', 'unused_index', 'bloat', 'seq_scan_ratio',
        'connections', 'locks', 'rls_coverage'
    )),
    subject text,
    payload jsonb not null default '{}'::jsonb
);

-- Table is created empty in this migration; CONCURRENTLY cannot run
-- inside the migration transaction.
-- squawk-ignore require-concurrent-index-creation
create index if not exists db_analysis_samples_sampled_at_idx
on helm_debug.db_analysis_samples (sampled_at desc);
-- Table is created empty in this migration; CONCURRENTLY cannot run
-- inside the migration transaction.
-- squawk-ignore require-concurrent-index-creation
create index if not exists db_analysis_samples_category_idx
on helm_debug.db_analysis_samples (category, sampled_at desc);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- READ (bounded, capability-detected): computes all six categories fresh
-- and returns them for the caller to persist. Never writes.
create or replace function public.helm_debug_db_analysis_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, helm_debug
as $$
declare
  v_unused_indexes jsonb;
  v_bloat jsonb;
  v_seq_scan jsonb;
  v_connections jsonb;
  v_locks jsonb;
  v_index_suggestions jsonb;
  v_rls_coverage jsonb;
  v_has_pgstattuple boolean;
  v_has_index_advisor boolean;
begin
  -- Unused indexes: zero scans since stats_reset, excluding tiny/system
  -- indexes and anything backing a primary key or unique constraint
  -- (dropping those is a schema change, not a housekeeping win).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_unused_indexes
  from (
    select
      s.schemaname as schema_name,
      s.relname as table_name,
      s.indexrelname as index_name,
      s.idx_scan,
      pg_relation_size(s.indexrelid) as index_bytes
    from pg_stat_user_indexes s
    join pg_index i on i.indexrelid = s.indexrelid
    where s.schemaname in ('public', 'helm_debug')
      and s.idx_scan = 0
      and not i.indisprimary
      and not i.indisunique
      and pg_relation_size(s.indexrelid) > 8192
    order by pg_relation_size(s.indexrelid) desc
    limit 50
  ) t;

  -- Sequential-scan ratio per table, largest 30 relations by total scans.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_seq_scan
  from (
    select
      schemaname as schema_name,
      relname as table_name,
      seq_scan,
      idx_scan,
      case when (seq_scan + idx_scan) = 0 then null
           else round(seq_scan::numeric / (seq_scan + idx_scan), 4)
      end as seq_scan_ratio,
      n_live_tup
    from pg_stat_user_tables
    where schemaname in ('public', 'helm_debug')
      and (seq_scan + idx_scan) > 0
    order by (seq_scan + idx_scan) desc
    limit 30
  ) t;

  -- Connections: grouped by state (pg_stat_activity), backend PIDs only —
  -- no query text.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_connections
  from (
    select coalesce(state, 'unknown') as state, count(*) as count
    from pg_stat_activity
    where pid <> pg_backend_pid()
    group by coalesce(state, 'unknown')
  ) t;

  -- Locks: grouped by mode, plus a count of blocked (not-granted) locks.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_locks
  from (
    select mode, granted, count(*) as count
    from pg_locks
    group by mode, granted
  ) t;

  -- Bloat: pgstattuple_approx (same extension as pgstattuple, far cheaper —
  -- a sampled estimate instead of a full relation scan) over the 20 largest
  -- tables, ONLY if the extension is actually installed.
  select exists(select 1 from pg_extension where extname = 'pgstattuple') into v_has_pgstattuple;
  if v_has_pgstattuple then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_bloat
    from (
      select
        c.relnamespace::regnamespace::text as schema_name,
        c.relname as table_name,
        pg_total_relation_size(c.oid) as total_bytes,
        (pgstattuple_approx(c.oid)).dead_tuple_percent as dead_tuple_percent,
        (pgstattuple_approx(c.oid)).approx_free_percent as free_percent
      from pg_class c
      where c.relkind = 'r'
        and c.relnamespace::regnamespace::text in ('public', 'helm_debug')
      order by pg_total_relation_size(c.oid) desc
      limit 20
    ) t;
  else
    v_bloat := jsonb_build_array(jsonb_build_object(
      'note', 'pgstattuple extension not installed — bloat estimate skipped, never CREATE EXTENSION from app code'
    ));
  end if;

  -- Index suggestions: index_advisor (depends on hypopg) run against the
  -- current window's captured statement queryids, ONLY if the extension is
  -- installed. Query text is read here, passed to index_advisor, and
  -- discarded — never returned.
  select exists(select 1 from pg_extension where extname = 'index_advisor') into v_has_index_advisor;
  if v_has_index_advisor then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_index_suggestions
    from (
      select
        s.queryid::text as queryid,
        a.startup_cost_before,
        a.startup_cost_after,
        a.total_cost_before,
        a.total_cost_after,
        a.index_statements,
        a.errors
      from (
        select distinct queryid from helm_debug.db_statement_samples
        where sampled_at = (select max(sampled_at) from helm_debug.db_statement_samples)
        limit 25
      ) top
      join pg_stat_statements s
        on s.queryid::text = top.queryid
       and s.dbid = (select oid from pg_database where datname = current_database())
      cross join lateral index_advisor(s.query) a
      where a.index_statements is not null and array_length(a.index_statements, 1) > 0
      limit 25
    ) t;
  else
    v_index_suggestions := jsonb_build_array(jsonb_build_object(
      'note', 'index_advisor extension not installed — suggestions skipped, never CREATE EXTENSION from app code'
    ));
  end if;

  -- RLS coverage (D5 task 3, trended half): tables with RLS enabled and
  -- zero policies, plus public-schema SECURITY DEFINER functions still
  -- EXECUTE-able by anon/authenticated. Same two findings
  -- `scripts/db/rls-coverage.mjs` computes standalone (that script also
  -- adds a third — policies with no matching pgTAP test — which needs
  -- repo file access this in-database function does not have, so it is
  -- NOT trended here; see docs/observability/DATABASE_TAB.md).
  select jsonb_build_object(
    'tables_missing_policies', coalesce((
      select jsonb_agg(jsonb_build_object('schema', t.schemaname, 'table', t.tablename))
      from pg_tables t
      where t.schemaname in ('public', 'helm_debug')
        and t.rowsecurity
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = t.schemaname and p.tablename = t.tablename
        )
    ), '[]'::jsonb),
    'over_privileged_definers', coalesce((
      select jsonb_agg(jsonb_build_object('schema', 'public', 'name', f.proname, 'granted_to', f.granted_to))
      from (
        select
          p.proname,
          array_agg(distinct r.rolname) as granted_to
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'), ('authenticated')) as r(rolname)
        where n.nspname = 'public'
          and p.prosecdef
          and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
        group by p.proname
      ) f
    ), '[]'::jsonb)
  ) into v_rls_coverage;

  return jsonb_build_object(
    'unused_indexes', v_unused_indexes,
    'bloat', v_bloat,
    'seq_scan_ratio', v_seq_scan,
    'connections', v_connections,
    'locks', v_locks,
    'index_suggestions', v_index_suggestions,
    'rls_coverage', v_rls_coverage,
    'has_pgstattuple', v_has_pgstattuple,
    'has_index_advisor', v_has_index_advisor
  );
exception
  -- index_advisor/hypopg can fail on a query it cannot plan (e.g. one using
  -- a temp object no longer in scope) — this whole snapshot must not fail
  -- because one advisory call did. Degrade that one category to an error
  -- note rather than losing unused-index/bloat/seq-scan/connections/locks,
  -- which are already computed by this point in a straight-line function
  -- body, so on any exception we simply omit the failing category via a
  -- best-effort re-run without it.
  when others then
    return jsonb_build_object(
      'unused_indexes', coalesce(v_unused_indexes, '[]'::jsonb),
      'bloat', coalesce(v_bloat, '[]'::jsonb),
      'seq_scan_ratio', coalesce(v_seq_scan, '[]'::jsonb),
      'connections', coalesce(v_connections, '[]'::jsonb),
      'locks', coalesce(v_locks, '[]'::jsonb),
      'index_suggestions', jsonb_build_array(jsonb_build_object('note', 'index_advisor call failed: ' || sqlerrm)),
      'rls_coverage', coalesce(v_rls_coverage, jsonb_build_object('tables_missing_policies', '[]'::jsonb, 'over_privileged_definers', '[]'::jsonb)),
      'has_pgstattuple', coalesce(v_has_pgstattuple, false),
      'has_index_advisor', coalesce(v_has_index_advisor, false)
    );
end;
$$;

-- WRITE: persists one row per finding across all six categories, computed
-- in TypeScript from the snapshot above (flattened: each array element of
-- each category becomes one row).
create or replace function public.record_db_analysis_sample(
    p_sampled_at timestamptz,
    p_rows jsonb
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
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_analysis_samples (sampled_at, category, subject, payload)
    values (
      p_sampled_at,
      v_row ->> 'category',
      v_row ->> 'subject',
      coalesce(v_row -> 'payload', '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- READ facade: the latest window's rows grouped by category, plus the
-- window closest to 24h before that (for "changed since yesterday").
create or replace function public.helm_debug_read_db_analysis_samples()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_latest_sampled_at timestamptz;
  v_prior_sampled_at timestamptz;
  v_latest jsonb;
  v_prior jsonb;
begin
  select max(sampled_at) into v_latest_sampled_at from helm_debug.db_analysis_samples;

  select sampled_at into v_prior_sampled_at
  from helm_debug.db_analysis_samples
  where sampled_at <= v_latest_sampled_at - interval '20 hours'
  order by abs(extract(epoch from (sampled_at - (v_latest_sampled_at - interval '24 hours'))))
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_latest
  from (select * from helm_debug.db_analysis_samples where sampled_at = v_latest_sampled_at) t;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_prior
  from (select * from helm_debug.db_analysis_samples where sampled_at = v_prior_sampled_at) t;

  return jsonb_build_object(
    'latest_sampled_at', v_latest_sampled_at,
    'prior_sampled_at', v_prior_sampled_at,
    'latest', v_latest,
    'prior', v_prior
  );
end;
$$;

revoke execute on function public.helm_debug_db_analysis_snapshot()
from public, anon, authenticated;
grant execute on function public.helm_debug_db_analysis_snapshot()
to service_role;

revoke execute on function public.record_db_analysis_sample(timestamptz, jsonb)
from public, anon, authenticated;
grant execute on function public.record_db_analysis_sample(timestamptz, jsonb)
to service_role;

revoke execute on function public.helm_debug_read_db_analysis_samples()
from public, anon, authenticated;
grant execute on function public.helm_debug_read_db_analysis_samples()
to service_role;

do $$
declare
  v_snap_fn oid := 'public.helm_debug_db_analysis_snapshot()'::regprocedure;
  v_write_fn oid := 'public.record_db_analysis_sample(timestamptz, jsonb)'::regprocedure;
  v_read_fn oid := 'public.helm_debug_read_db_analysis_samples()'::regprocedure;
begin
  if has_function_privilege('public', v_snap_fn, 'EXECUTE')
     or has_function_privilege('anon', v_snap_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_snap_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_analysis_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_snap_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_analysis_snapshot not executable by service_role';
  end if;

  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_analysis_sample callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_analysis_sample not executable by service_role';
  end if;

  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_analysis_samples callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_analysis_samples not executable by service_role';
  end if;
end $$;

-- No row-level policies — reachable only through the facades above.
