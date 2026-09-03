-- Helm Debug — pg_cron / pg_net health, read-only (brief §26, §28, Phase 2 A4)
--
-- RISK TIER: R3. HELD — see supabase/migrations/HELD.md. Never applied by
-- an agent; owner-apply-only after db-migration-reviewer sign-off.
--
-- NO NEW TABLE. This adds exactly ONE definer-rights read facade over
-- `cron.job`/`cron.job_run_details` (pg_cron) and
-- `net.http_request_queue`/`net._http_response` (pg_net) — both extensions
-- are already installed in production (measured 2026-09-03, see
-- docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §1, §3).
-- Nothing here is written or persisted by Helm; it is a live read at
-- request time, same shape as `helm_debug_db_lock_snapshot()`'s current-
-- state read (20260903191000) — not an appended history table.
--
-- CAPABILITY DETECTION, SECTION BY SECTION, NOT ALL-OR-NOTHING. Each of the
-- three independent reads below (cron jobs, pg_net queue depth, pg_net
-- responses) is wrapped in its OWN `begin/exception` block catching
-- `undefined_table` (schema/relation absent — e.g. pg_net not installed at
-- all) AND `insufficient_privilege` (schema/relation present but this
-- function's owner cannot see it) separately. A single missing/unreadable
-- piece degrades ONLY that piece to null with an explicit `..._capability:
-- 'unavailable'` flag — it must never take down the other two sections or
-- read as a hard RPC failure the way a genuinely broken migration would.
--
-- PRIVACY: `cron.job.command` (the job's own defined SQL) is DELIBERATELY
-- NEVER returned — only jobid/jobname/schedule/active, matching this
-- series' "no raw SQL text anywhere" discipline even though nothing in the
-- brief names this specific column. `job_run_details.return_message` is
-- bounded to 200 characters via `left(...)`, per the task's own
-- instruction, before it ever leaves this function. pg_net responses are
-- returned as GROUPED COUNTS (status_code, has_error, count) over a
-- bounded 24h window — never individual rows, never `content`/`headers`
-- (which can carry response bodies/secrets), matching brief §28's "counts,
-- not payloads, not URLs".
--
-- ROLLBACK: DROP FUNCTION public.helm_debug_read_jobs_health(); — safe,
-- this migration creates no table and nothing else references this
-- function.

create or replace function public.helm_debug_read_jobs_health()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_cron jsonb;
  v_cron_capability text := 'available';
  v_net_queue_depth bigint;
  v_net_queue_capability text := 'available';
  v_net_responses jsonb;
  v_net_responses_capability text := 'available';
begin
  begin
    select coalesce(jsonb_agg(row_to_json(j)), '[]'::jsonb) into v_cron
    from (
      select
        j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        (
          select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
          from (
            select
              d.status,
              d.start_time,
              d.end_time,
              case
                when d.end_time is not null and d.start_time is not null
                  then (extract(epoch from (d.end_time - d.start_time)) * 1000)::integer
                else null
              end as duration_ms,
              left(coalesce(d.return_message, ''), 200) as return_message
            from cron.job_run_details d
            where d.jobid = j.jobid
            order by d.start_time desc
            limit 20
          ) r
        ) as recent_runs
      from cron.job j
      order by j.jobid
    ) j;
  exception
    when undefined_table or insufficient_privilege then
      v_cron := null;
      v_cron_capability := 'unavailable';
  end;

  begin
    select count(*) into v_net_queue_depth from net.http_request_queue;
  exception
    when undefined_table or insufficient_privilege then
      v_net_queue_depth := null;
      v_net_queue_capability := 'unavailable';
  end;

  begin
    select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) into v_net_responses
    from (
      select
        status_code,
        (error_msg is not null) as has_error,
        count(*) as response_count
      from net._http_response
      where created >= clock_timestamp() - interval '24 hours'
      group by status_code, (error_msg is not null)
    ) s;
  exception
    when undefined_table or insufficient_privilege then
      v_net_responses := null;
      v_net_responses_capability := 'unavailable';
  end;

  return jsonb_build_object(
    'cron', v_cron,
    'cron_capability', v_cron_capability,
    'net_queue_depth', v_net_queue_depth,
    'net_queue_capability', v_net_queue_capability,
    'net_responses_24h', v_net_responses,
    'net_responses_capability', v_net_responses_capability
  );
end;
$$;

revoke execute on function public.helm_debug_read_jobs_health() from public,
anon,
authenticated;
grant execute on function public.helm_debug_read_jobs_health()
to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_jobs_health()'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_jobs_health callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_jobs_health not executable by service_role';
  end if;
end $$;

-- No row-level policies: this migration creates no table, only a
-- definer-rights function over pg_cron/pg_net's own catalog objects.
