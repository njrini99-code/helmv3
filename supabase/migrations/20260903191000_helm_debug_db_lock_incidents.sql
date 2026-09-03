-- Helm Debug — locks / blocking / transactions (brief §18, Phase 2 track A1)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Same isolation
-- pattern as the four Phase 1 migrations before it: new schema objects,
-- revoked from public/anon/authenticated, reached only through the three
-- definer-rights facades below. Never applied by an agent; owner-apply-only
-- after db-migration-reviewer sign-off.
--
-- THREE OBJECTS, SAME SHAPE AS PHASE 1's db_health_samples
-- ---------------------------------------------------------------------
-- `helm_debug_db_lock_snapshot()` is READ-ONLY: a bounded, point-in-time
-- read over pg_stat_activity/pg_locks/pg_blocking_pids for THIS database,
-- capped at 50 rows, already reduced in SQL to safe, closed-vocabulary
-- fields (role_class, safe_query_class, blocking_query_class) — no raw
-- query text and no usename ever leave this function. Threshold evaluation
-- happens in TypeScript (src/lib/observability/supabase/locks.ts,
-- `evaluateLockSnapshot`), same reasoning as db-health-delta.ts: fixture
-- tests over plpgsql arithmetic. `record_db_lock_incident(...)` is the
-- WRITE, called once per candidate the evaluator returns, folded into the
-- existing db-health-sampler cron run (brief §27 prefers one collector
-- connection per run) rather than a separate schedule.
--
-- SAFE QUERY CLASS, BOUNDED THE SAME WAY AS PHASE 1's
-- helm_debug_stat_statements_snapshot(): `left(query, 200)` before any
-- pattern match ever runs, and the match extracts at most two short tokens
-- (leading keyword + one identifier following FROM/INTO/UPDATE/JOIN/CALL) —
-- never returns the query text itself, matching brief §18's explicit
-- "never full sensitive query text". `pg_stat_activity.query` reads as the
-- literal string '<insufficient privilege>' for a backend the calling role
-- cannot see the query of; that literal is detected and mapped to the
-- closed label 'unknown_privilege' rather than pattern-matched as if it
-- were real SQL.
--
-- DEDUPE (per the Phase 2 task spec): an unresolved (`resolved_at is null`)
-- row with the same `kind` + `blocked_query_class` detected within the last
-- 15 minutes is refreshed (wait_ms/detected_at/severity) instead of
-- inserted again. `blocked_query_class` is NULL for every `deadlock`
-- candidate (locks.ts never sets one — a deadlock is not "waiting", it
-- already lost), so the match uses `IS NOT DISTINCT FROM`, not `=`: two
-- deadlock rows within the same 15-minute window both have
-- `blocked_query_class IS NULL`, and plain `=` never matches NULL against
-- NULL, which would have inserted a fresh row for every deadlock in the
-- window instead of collapsing them.
--
-- ROLLBACK: DROP FUNCTION public.helm_debug_read_db_lock_incidents(integer);
-- DROP FUNCTION public.record_db_lock_incident(text, text, text, integer,
-- text, text, integer, text, text, text, text, text, jsonb); DROP FUNCTION
-- public.helm_debug_db_lock_snapshot(); DROP TABLE
-- helm_debug.db_lock_incidents; — safe, nothing else references these.

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_lock_incidents (
    id bigint generated always as identity primary key,
    detected_at timestamptz not null default clock_timestamp(),
    kind text not null check (
        kind in ('long_active', 'idle_in_tx', 'lock_wait', 'deadlock')
    ),
    severity text not null check (severity in ('warning', 'critical')),
    role_class text not null check (role_class in ('app', 'service', 'other')),
    wait_ms integer check (wait_ms is null or wait_ms >= 0),
    blocked_query_class text,
    blocking_query_class text,
    blocked_pid_count integer check (
        blocked_pid_count is null or blocked_pid_count >= 0
    ),
    relation_name text,
    feature text,
    action text,
    release_sha text,
    helm_trace_id text,
    safe_metadata jsonb not null default '{}'::jsonb,
    resolved_at timestamptz
);

create index if not exists db_lock_incidents_detected_at_idx
on helm_debug.db_lock_incidents (detected_at desc);
-- The dedupe lookup itself: unresolved rows of a given kind/class, newest
-- first, is exactly this index's leading columns.
create index if not exists db_lock_incidents_dedupe_idx
on helm_debug.db_lock_incidents (kind, blocked_query_class, detected_at desc)
where resolved_at is null;

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- READ: bounded current-state snapshot. VOLATILE (reads clock_timestamp()
-- and live activity), definer-rights, search_path pinned per this repo's
-- convention.
create or replace function public.helm_debug_db_lock_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows
  from (
    select
      a.pid,
      case
        when a.usename in ('anon', 'authenticated', 'authenticator') then 'app'
        when a.usename = 'service_role' then 'service'
        else 'other'
      end as role_class,
      a.state,
      case
        when a.state = 'idle in transaction' then
          coalesce((extract(epoch from (clock_timestamp() - a.state_change)) * 1000)::integer, 0)
        else
          coalesce((extract(epoch from (clock_timestamp() - a.query_start)) * 1000)::integer, 0)
      end as duration_ms,
      a.wait_event_type,
      coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) as blocked_pid_count,
      (coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) > 0) as is_waiting_on_lock,
      case
        when a.query is null or a.query = '' then 'idle'
        when left(a.query, 200) = '<insufficient privilege>' then 'unknown_privilege'
        else trim(
          coalesce(lower((regexp_match(left(a.query, 200), '^\s*(\w+)'))[1]), 'unknown')
          || ' ' ||
          coalesce(
            lower((regexp_match(
              left(a.query, 200),
              '(?:from|into|update|join|call)\s+"?(?:public|helm_debug)?"?\.?"?([a-zA-Z_][a-zA-Z0-9_]{0,63})"?',
              'i'
            ))[1]),
            ''
          )
        )
      end as safe_query_class,
      (
        select bc.relname
        from pg_locks l
        join pg_class bc on bc.oid = l.relation
        where l.pid = a.pid and not l.granted
        order by l.relation
        limit 1
      ) as relation_name,
      (
        select case
          when ba.query is null or ba.query = '' then null
          when left(ba.query, 200) = '<insufficient privilege>' then 'unknown_privilege'
          else trim(
            coalesce(lower((regexp_match(left(ba.query, 200), '^\s*(\w+)'))[1]), 'unknown')
            || ' ' ||
            coalesce(
              lower((regexp_match(
                left(ba.query, 200),
                '(?:from|into|update|join|call)\s+"?(?:public|helm_debug)?"?\.?"?([a-zA-Z_][a-zA-Z0-9_]{0,63})"?',
                'i'
              ))[1]),
              ''
            )
          )
        end
        from unnest(pg_blocking_pids(a.pid)) as bp(pid)
        join pg_stat_activity ba on ba.pid = bp.pid
        order by bp.pid
        limit 1
      ) as blocking_query_class
    from pg_stat_activity a
    where a.datname = current_database()
      and a.pid <> pg_backend_pid()
      and (
        a.state in ('active', 'idle in transaction')
        or coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) > 0
      )
    order by duration_ms desc
    limit 50
  ) t;

  return v_rows;
end;
$$;

-- WRITE: one candidate per call, dedupe against an unresolved row of the
-- same kind/blocked_query_class detected within the last 15 minutes.
create or replace function public.record_db_lock_incident(
    p_kind text,
    p_severity text,
    p_role_class text,
    p_wait_ms integer,
    p_blocked_query_class text default null,
    p_blocking_query_class text default null,
    p_blocked_pid_count integer default null,
    p_relation_name text default null,
    p_feature text default null,
    p_action text default null,
    p_release_sha text default null,
    p_helm_trace_id text default null,
    p_safe_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_id bigint;
  v_existing_id bigint;
begin
  select id into v_existing_id
  from helm_debug.db_lock_incidents
  where kind = p_kind
    and blocked_query_class is not distinct from p_blocked_query_class
    and resolved_at is null
    and detected_at >= clock_timestamp() - interval '15 minutes'
  order by detected_at desc
  limit 1;

  if v_existing_id is not null then
    update helm_debug.db_lock_incidents
    set wait_ms = p_wait_ms,
        detected_at = clock_timestamp(),
        severity = p_severity,
        blocking_query_class = coalesce(p_blocking_query_class, blocking_query_class),
        blocked_pid_count = coalesce(p_blocked_pid_count, blocked_pid_count),
        relation_name = coalesce(p_relation_name, relation_name),
        feature = coalesce(p_feature, feature),
        action = coalesce(p_action, action),
        release_sha = coalesce(p_release_sha, release_sha),
        helm_trace_id = coalesce(p_helm_trace_id, helm_trace_id),
        safe_metadata = coalesce(p_safe_metadata, safe_metadata)
    where id = v_existing_id;
    return v_existing_id;
  end if;

  insert into helm_debug.db_lock_incidents (
    kind, severity, role_class, wait_ms, blocked_query_class,
    blocking_query_class, blocked_pid_count, relation_name, feature,
    action, release_sha, helm_trace_id, safe_metadata
  ) values (
    p_kind, p_severity, p_role_class, p_wait_ms, p_blocked_query_class,
    p_blocking_query_class, p_blocked_pid_count, p_relation_name, p_feature,
    p_action, p_release_sha, p_helm_trace_id, coalesce(p_safe_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.helm_debug_db_lock_snapshot() from public,
anon,
authenticated;
grant execute on function public.helm_debug_db_lock_snapshot()
to service_role;

revoke execute on function public.record_db_lock_incident(
    text, text, text, integer, text, text, integer, text, text, text,
    text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_db_lock_incident(
    text, text, text, integer, text, text, integer, text, text, text,
    text, text, jsonb
) to service_role;

do $$
declare
  v_read_fn oid := 'public.helm_debug_db_lock_snapshot()'::regprocedure;
  v_write_fn oid := 'public.record_db_lock_incident(text, text, text, integer, text, text, integer, text, text, text, text, text, jsonb)'::regprocedure;
begin
  if has_function_privilege('public', v_read_fn, 'EXECUTE')
     or has_function_privilege('anon', v_read_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_lock_snapshot callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_read_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_db_lock_snapshot not executable by service_role';
  end if;

  if has_function_privilege('public', v_write_fn, 'EXECUTE')
     or has_function_privilege('anon', v_write_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_lock_incident callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_write_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_lock_incident not executable by service_role';
  end if;
end $$;

-- READ facade for the Bridge (src/lib/admin/database/locks.ts).
create or replace function public.helm_debug_read_db_lock_incidents(
    p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.detected_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_lock_incidents
    order by detected_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

revoke execute on function public.helm_debug_read_db_lock_incidents(
    integer
) from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_db_lock_incidents(
    integer
) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_lock_incidents(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_lock_incidents callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_lock_incidents not executable by service_role';
  end if;
end $$;

-- No row-level policies — same reasoning as 20260903180000's tail comment:
-- the schema is revoked from public/anon/authenticated above and not in
-- PostgREST's exposed schema list, so the three definer-rights facades
-- above are the only path in.
