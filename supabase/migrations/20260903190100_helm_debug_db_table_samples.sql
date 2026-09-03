-- Helm Debug — table health / vacuum / bloat / scans (brief §29, Phase 2 A3)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as every migration before it in this series: new schema objects,
-- revoked from public/anon/authenticated, reached only through the three
-- definer-rights facades below. Never applied by an agent; owner-apply-only
-- after db-migration-reviewer sign-off.
--
-- THREE OBJECTS, SAME "read absolute + prior, diff in TypeScript" SHAPE AS
-- Phase 1's db_health_samples / db_stat_deltas
-- ---------------------------------------------------------------------
-- `helm_debug_db_table_snapshot()` is READ-ONLY: pg_stat_user_tables joined
-- to size functions for the 40 largest relations across `public` and
-- `helm_debug`, PLUS the previously stored row per relation (for exactly
-- those relations, mirroring how helm_debug_stat_statements_snapshot()
-- filters db_stat_prior_state by the current window's queryids rather than
-- returning the whole prior-state table). `record_db_table_samples(jsonb)`
-- batch-inserts the delta rows TypeScript already computed
-- (`computeTableSampleDelta`, src/lib/observability/supabase/
-- table-health.ts). No warnings are stored here — `evaluateTableHealth`
-- runs at READ time in src/lib/admin/database/tables.ts, same pattern as
-- errors.ts grouping by fingerprint at read time rather than write time.
--
-- SIZED BY relid, NOT BY NAME. `pg_total_relation_size`/`pg_indexes_size`
-- take the relation's OID, not a quoted, schema-qualified name string — a
-- name-based lookup needs correct quoting and schema qualification to avoid
-- silently sizing the wrong object (or erroring on a relation whose name
-- needs quoting), and pg_stat_user_tables already carries `relid` directly.
--
-- ROLLBACK: DROP FUNCTION public.helm_debug_read_db_table_health(integer);
-- DROP FUNCTION public.record_db_table_samples(jsonb); DROP FUNCTION
-- public.helm_debug_db_table_snapshot(); DROP TABLE
-- helm_debug.db_table_samples; — safe, nothing else references these.

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_table_samples (
    id bigint generated always as identity primary key,
    sampled_at timestamptz not null default clock_timestamp(),
    relation_name text not null,
    n_live_tup bigint not null,
    n_dead_tup bigint not null,
    dead_ratio numeric(6, 4),
    last_autovacuum timestamptz,
    last_autoanalyze timestamptz,
    seq_scan bigint not null,
    idx_scan bigint not null,
    n_tup_ins bigint not null,
    n_tup_upd bigint not null,
    n_tup_del bigint not null,
    total_bytes bigint not null,
    index_bytes bigint not null,
    -- Deltas vs the previous stored sample for this relation — null on the
    -- first sample of a relation or when a counter reset was detected.
    -- n_dead_tup_delta may be legitimately NEGATIVE (autovacuum shrank it);
    -- it is not itself a reset signal — see table-health.ts's header.
    n_dead_tup_delta bigint,
    seq_scan_delta bigint,
    idx_scan_delta bigint,
    n_tup_ins_delta bigint,
    n_tup_upd_delta bigint,
    n_tup_del_delta bigint,
    -- 'ok' | 'first_sample' | 'reset_detected' — same vocabulary as
    -- db_health_samples.collector_status.
    collector_status text not null default 'ok'
);

create index if not exists db_table_samples_sampled_at_idx
on helm_debug.db_table_samples (sampled_at desc);
create index if not exists db_table_samples_relation_idx
on helm_debug.db_table_samples (relation_name, sampled_at desc);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- READ: current absolute stats for the 40 largest relations in public +
-- helm_debug, plus the previously stored row for exactly those relations.
create or replace function public.helm_debug_db_table_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_current jsonb;
  v_prior jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_current
  from (
    select
      s.schemaname || '.' || s.relname as relation_name,
      coalesce(s.n_live_tup, 0) as n_live_tup,
      coalesce(s.n_dead_tup, 0) as n_dead_tup,
      s.last_autovacuum,
      s.last_autoanalyze,
      coalesce(s.seq_scan, 0) as seq_scan,
      coalesce(s.idx_scan, 0) as idx_scan,
      coalesce(s.n_tup_ins, 0) as n_tup_ins,
      coalesce(s.n_tup_upd, 0) as n_tup_upd,
      coalesce(s.n_tup_del, 0) as n_tup_del,
      pg_total_relation_size(s.relid) as total_bytes,
      pg_indexes_size(s.relid) as index_bytes
    from pg_stat_user_tables s
    where s.schemaname in ('public', 'helm_debug')
    order by pg_total_relation_size(s.relid) desc
    limit 40
  ) t;

  select coalesce(jsonb_object_agg(p.relation_name, to_jsonb(p) - 'relation_name' - 'sampled_at'), '{}'::jsonb)
  into v_prior
  from (
    select distinct on (relation_name)
      relation_name, sampled_at, n_dead_tup, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
    from helm_debug.db_table_samples
    where relation_name in (select jsonb_array_elements(v_current) ->> 'relation_name')
    order by relation_name, sampled_at desc
  ) p;

  return jsonb_build_object('current', v_current, 'prior', v_prior);
end;
$$;

-- WRITE: batch insert of delta rows computed in TypeScript
-- (computeTableSampleDelta).
create or replace function public.record_db_table_samples(
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
    insert into helm_debug.db_table_samples (
      relation_name, n_live_tup, n_dead_tup, dead_ratio, last_autovacuum,
      last_autoanalyze, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del,
      total_bytes, index_bytes, n_dead_tup_delta, seq_scan_delta,
      idx_scan_delta, n_tup_ins_delta, n_tup_upd_delta, n_tup_del_delta,
      collector_status
    ) values (
      v_row ->> 'relationName',
      (v_row ->> 'nLiveTup')::bigint,
      (v_row ->> 'nDeadTup')::bigint,
      nullif(v_row ->> 'deadRatio', '')::numeric,
      nullif(v_row ->> 'lastAutovacuum', '')::timestamptz,
      nullif(v_row ->> 'lastAutoanalyze', '')::timestamptz,
      (v_row ->> 'seqScan')::bigint,
      (v_row ->> 'idxScan')::bigint,
      (v_row ->> 'nTupIns')::bigint,
      (v_row ->> 'nTupUpd')::bigint,
      (v_row ->> 'nTupDel')::bigint,
      (v_row ->> 'totalBytes')::bigint,
      (v_row ->> 'indexBytes')::bigint,
      nullif(v_row ->> 'nDeadTupDelta', '')::bigint,
      nullif(v_row ->> 'seqScanDelta', '')::bigint,
      nullif(v_row ->> 'idxScanDelta', '')::bigint,
      nullif(v_row ->> 'nTupInsDelta', '')::bigint,
      nullif(v_row ->> 'nTupUpdDelta', '')::bigint,
      nullif(v_row ->> 'nTupDelDelta', '')::bigint,
      coalesce(v_row ->> 'collectorStatus', 'ok')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.helm_debug_db_table_snapshot() from public,
anon,
authenticated;
grant execute on function public.helm_debug_db_table_snapshot()
to service_role;

revoke execute on function public.record_db_table_samples(jsonb) from public,
anon,
authenticated;
grant execute on function public.record_db_table_samples(jsonb)
to service_role;

do $$
declare
  v_read_fn oid := 'public.helm_debug_db_table_snapshot()'::regprocedure;
  v_write_fn oid := 'public.record_db_table_samples(jsonb)'::regprocedure;
begin
  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_table_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_table_snapshot not executable by service_role';
  end if;

  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_table_samples callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_table_samples not executable by service_role';
  end if;
end $$;

-- READ facade for the Bridge (src/lib/admin/database/tables.ts).
create or replace function public.helm_debug_read_db_table_health(
    p_limit integer default 200
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
    from helm_debug.db_table_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 2000))
  ) t
$$;

revoke execute on function public.helm_debug_read_db_table_health(
    integer
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_db_table_health(
    integer
) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_table_health(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_table_health callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_table_health not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as 20260903180000's tail comment.
