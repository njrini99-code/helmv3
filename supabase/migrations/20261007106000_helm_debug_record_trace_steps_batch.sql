-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.9.
-- Apply: npm run db:apply -- supabase/migrations/20261007106000_helm_debug_record_trace_steps_batch.sql
-- Risk: LOW. Adds one new service_role-only function and changes nothing that
-- exists. The app code falls back to the per-step RPC while this function is
-- missing, so the code can ship before or after this migration.
--
-- Sentry reports an N+1 on helm_debug_record_trace_step: the golf flight
-- recorder (src/lib/observability/helm-flight-recorder.ts) issues one RPC per
-- workflow step, 12 to 18 of them per round save, and each RPC also recounts
-- every step of the trace.
--
-- helm_debug_record_trace_steps(p_trace_id, p_steps) records a whole array of
-- steps in ONE call. Each element is
--   { "step_key": text, "layer": text, "status": text,
--     "requiredness": text, "metadata": object }
-- and goes through exactly the same upsert as helm_debug_record_trace_step
-- (same columns, same on-conflict merge, same finished_at rule), in array
-- order, so a later element for the same step_key updates the earlier one just
-- as two sequential per-step calls would. The observed_step_count recount runs
-- once at the end instead of once per step. The per-step function is untouched
-- and stays the API for callers that record a single step (scripts/trace-db.ts).
--
-- Guards: the argument must be a JSON array of at most 100 elements; the
-- function is SECURITY DEFINER with a pinned search_path and is executable by
-- service_role only, like the other helm_debug_* facades.
--
-- ROLLBACK: DROP FUNCTION public.helm_debug_record_trace_steps(uuid, jsonb);
--   (the app falls back to the per-step RPC when this function is absent)
--
-- VERIFY: select 1 where exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'helm_debug_record_trace_steps' and p.prosecdef);
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('anon', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE');

create or replace function public.helm_debug_record_trace_steps(
  p_trace_id uuid,
  p_steps jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, helm_debug, helm_private
as $$
declare
  v_step jsonb;
  v_metadata jsonb;
  v_status text;
  v_finished_at timestamptz;
  v_count integer := 0;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 100 then
    raise exception 'p_steps may hold at most 100 steps' using errcode = '22023';
  end if;

  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_metadata := helm_private.trace_safe_metadata(coalesce(v_step -> 'metadata', '{}'::jsonb));
    v_status := v_step ->> 'status';
    v_finished_at := case
      when v_status in ('success', 'failure', 'skipped', 'missing', 'warning')
        then clock_timestamp()
      else null
    end;

    insert into helm_debug.trace_steps (
      trace_id, step_key, parent_step_key, layer, category, status, requiredness,
      started_at, finished_at, duration_ms, table_name, function_name, trigger_name,
      error_code, error_summary, expected, observed, metadata
    ) values (
      p_trace_id,
      v_step ->> 'step_key',
      nullif(v_metadata ->> 'parent_step_key', ''),
      v_step ->> 'layer',
      nullif(v_metadata ->> 'category', ''),
      v_status,
      v_step ->> 'requiredness',
      coalesce(nullif(v_metadata ->> 'started_at', '')::timestamptz, clock_timestamp()),
      v_finished_at,
      nullif(v_metadata ->> 'duration_ms', '')::integer,
      nullif(v_metadata ->> 'table_name', ''),
      nullif(v_metadata ->> 'function_name', ''),
      nullif(v_metadata ->> 'trigger_name', ''),
      nullif(v_metadata ->> 'error_code', ''),
      nullif(v_metadata ->> 'error_summary', ''),
      v_metadata -> 'expected',
      v_metadata -> 'observed',
      v_metadata
    )
    on conflict (trace_id, step_key) do update set
      parent_step_key = excluded.parent_step_key,
      layer = excluded.layer,
      category = excluded.category,
      status = excluded.status,
      requiredness = excluded.requiredness,
      finished_at = coalesce(excluded.finished_at, helm_debug.trace_steps.finished_at),
      duration_ms = coalesce(excluded.duration_ms, helm_debug.trace_steps.duration_ms),
      table_name = coalesce(excluded.table_name, helm_debug.trace_steps.table_name),
      function_name = coalesce(excluded.function_name, helm_debug.trace_steps.function_name),
      trigger_name = coalesce(excluded.trigger_name, helm_debug.trace_steps.trigger_name),
      error_code = coalesce(excluded.error_code, helm_debug.trace_steps.error_code),
      error_summary = coalesce(excluded.error_summary, helm_debug.trace_steps.error_summary),
      expected = coalesce(excluded.expected, helm_debug.trace_steps.expected),
      observed = coalesce(excluded.observed, helm_debug.trace_steps.observed),
      metadata = helm_debug.trace_steps.metadata || excluded.metadata,
      updated_at = clock_timestamp();

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    update helm_debug.trace_runs
    set observed_step_count = (
          select count(*) from helm_debug.trace_steps where trace_id = p_trace_id
        ),
        updated_at = clock_timestamp()
    where trace_id = p_trace_id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.helm_debug_record_trace_steps(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.helm_debug_record_trace_steps(uuid, jsonb) to service_role;
