-- Helm Debug — Database Tab (D5): remove `index_advisor` from the PostgREST
-- call path.
--
-- RISK TIER: R3, additive-by-replacement. Replaces one SECURITY DEFINER
-- function body; no table, grant, policy or type changes.
--
-- WHY. `extensions.index_advisor(query text)` executes `DEALLOCATE ALL`
-- (twice — verified against prod `pg_proc.prosrc`). This function is invoked
-- over PostgREST as `service_role` by `/api/cron/db-table-health`
-- (vercel.json cron `7 * * * *`), so that `DEALLOCATE ALL` lands on a
-- PostgREST *backend connection* and wipes every prepared statement PostgREST
-- is holding on it. PostgREST names its prepared statements with an integer
-- counter and keeps reusing them, so every later request routed onto that
-- poisoned pooled connection failed with SQLSTATE 26000,
-- `prepared statement "N" does not exist`.
--
-- MEASURED, 2026-09-09. Migration 20260906120100 (which introduced this call)
-- was applied to production at 12:47:44Z. The first 26000 error in the
-- preceding 60 hours appeared at 13:07 — the first `7 * * * *` run after the
-- function existed. Every subsequent burst starts at :07 past the hour
-- (13:07, 14:07, 16:07, 18:07, 19:07, 20:07, 22:07); no other cron runs at
-- :07. 303 admin_events rows / 646 postgres_logs rows in 72h, 9 distinct
-- affected users, across auth.verifyPlayerAccess, the CoachHelm v3 generator
-- fleet, messaging, player hub, stats, savePartialRound, /api/jobs/consume
-- and /api/admin/log-event.
--
-- WHAT CHANGES. The `index_suggestion` category degrades to the same
-- single `note` row the "extension not installed" branch already emits, which
-- `flattenAnalysisSnapshot` (src/lib/observability/supabase/db-analysis.ts)
-- already handles — so no TypeScript change is required and the Database Tab
-- keeps rendering the category. The other six categories (unused_index,
-- bloat, seq_scan_ratio, connections, locks, rls_coverage) are untouched.
--
-- `index_advisor` is NOT safe to call from anything PostgREST invokes. If
-- index suggestions are wanted back, compute them from a pg_cron job — a
-- background-worker connection PostgREST does not reuse — writing straight
-- into `helm_debug.db_analysis_samples`, and have this function only read
-- them. See docs/observability/DATABASE_TAB.md.
--
-- ROLLBACK: re-run 20260906120100's `create or replace function
-- public.helm_debug_db_analysis_snapshot()` block. Doing so reinstates the
-- 26000 cascade.
--
-- VERIFY:
--   -- 1. no PostgREST-reachable function still CALLS index_advisor.
--   --    Must strip full-line comments first: prosrc includes the comment
--   --    text, and this function's comments name index_advisor on purpose,
--   --    so a plain ilike '%index_advisor%' is a false positive.
--   with code as (
--     select string_agg(line, E'\n') as src
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     cross join unnest(string_to_array(p.prosrc, E'\n')) as line
--    where n.nspname = 'public'
--      and p.proname = 'helm_debug_db_analysis_snapshot'
--      and btrim(line) not like '--%'
--   )
--   select count(*) from code where src ~* 'index_advisor\s*\(';
--   -- expect: 0
--
--   -- 2. the snapshot still returns all seven categories
--   select jsonb_object_keys(public.helm_debug_db_analysis_snapshot());
--   -- expect: unused_indexes, bloat, seq_scan_ratio, connections, locks,
--   --         index_suggestions, rls_coverage, has_pgstattuple,
--   --         has_index_advisor
--
--   -- 3. after the next `7 * * * *` db-table-health run, no new 26000
--   select count(*), max(created_at) from public.admin_events
--    where created_at > now() - interval '90 minutes'
--      and message ilike '%prepared statement%does not exist%';
--   -- expect: 0

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

  -- Index suggestions: DISABLED on this path. `index_advisor` runs
  -- `DEALLOCATE ALL`, and this function is called over PostgREST, so running
  -- it poisons PostgREST's pooled connection (SQLSTATE 26000). The capability
  -- probe is kept so the Database Tab can still report whether the extension
  -- is present.
  select exists(select 1 from pg_extension where extname = 'index_advisor') into v_has_index_advisor;
  v_index_suggestions := jsonb_build_array(jsonb_build_object(
    'note', 'index_advisor is not run on the PostgREST path — it executes DEALLOCATE ALL, which invalidates PostgREST''s prepared statements (SQLSTATE 26000). Move it to a pg_cron job to restore suggestions.'
  ));

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
  -- Any single category (pgstattuple_approx on a huge relation, a pg_locks
  -- snapshot under contention) can fail without the whole snapshot being
  -- worthless. Degrade to whatever was already computed in this
  -- straight-line body rather than losing the window entirely.
  when others then
    return jsonb_build_object(
      'unused_indexes', coalesce(v_unused_indexes, '[]'::jsonb),
      'bloat', coalesce(v_bloat, '[]'::jsonb),
      'seq_scan_ratio', coalesce(v_seq_scan, '[]'::jsonb),
      'connections', coalesce(v_connections, '[]'::jsonb),
      'locks', coalesce(v_locks, '[]'::jsonb),
      'index_suggestions', jsonb_build_array(jsonb_build_object('note', 'analysis snapshot degraded: ' || sqlerrm)),
      'rls_coverage', coalesce(v_rls_coverage, jsonb_build_object('tables_missing_policies', '[]'::jsonb, 'over_privileged_definers', '[]'::jsonb)),
      'has_pgstattuple', coalesce(v_has_pgstattuple, false),
      'has_index_advisor', coalesce(v_has_index_advisor, false)
    );
end;
$$;

-- db:apply — record this file in the ledger, in the same transaction. The
-- MCP apply path does not write the ledger itself; the Supabase CLI does, so
-- under a local `supabase db reset` this row already exists by the time the
-- file body runs (CI: "duplicate key value violates unique constraint
-- schema_migrations_pkey"). Idempotent on purpose.
insert into supabase_migrations.schema_migrations (version, name)
values ('20260909230000', 'helm_debug_analysis_drop_index_advisor')
on conflict (version) do nothing;
