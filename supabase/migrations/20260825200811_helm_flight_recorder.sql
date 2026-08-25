-- Helm Flight Recorder
--
-- These records are intentionally outside the public API schema. Application
-- code writes them through narrow service-role-only RPC facades so a failed
-- business transaction cannot erase the server-side checkpoints that describe
-- it. PostgreSQL-internal checkpoints use helm_private.trace_checkpoint(),
-- which writes structured LOG records and therefore also survives ROLLBACK.

create schema if not exists helm_debug;

revoke all on schema helm_debug from public;

create table if not exists helm_debug.trace_runs (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null unique,
  workflow text not null check (workflow ~ '^golf[.]'),
  environment text not null default 'unknown',
  status text not null default 'started'
    check (status in ('started', 'success', 'failure', 'warning', 'pending')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  round_id uuid,
  team_id uuid,
  player_id uuid,
  sentry_trace_id text,
  root_span_id text,
  expected_step_count integer not null default 0 check (expected_step_count >= 0),
  observed_step_count integer not null default 0 check (observed_step_count >= 0),
  missing_required_step_count integer not null default 0 check (missing_required_step_count >= 0),
  failure_step text,
  failure_code text,
  failure_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists trace_runs_started_at_idx
  on helm_debug.trace_runs (started_at desc);
create index if not exists trace_runs_workflow_started_at_idx
  on helm_debug.trace_runs (workflow, started_at desc);
create index if not exists trace_runs_round_id_idx
  on helm_debug.trace_runs (round_id) where round_id is not null;
create index if not exists trace_runs_status_started_at_idx
  on helm_debug.trace_runs (status, started_at desc);

create table if not exists helm_debug.trace_steps (
  id bigint generated always as identity primary key,
  trace_id uuid not null references helm_debug.trace_runs(trace_id) on delete cascade,
  step_key text not null,
  parent_step_key text,
  layer text not null check (layer in (
    'client', 'next', 'server_action', 'supabase', 'postgres', 'trigger',
    'verification', 'cache', 'background'
  )),
  category text,
  status text not null check (status in (
    'started', 'success', 'failure', 'skipped', 'missing', 'warning', 'pending'
  )),
  requiredness text not null check (requiredness in (
    'required', 'conditional', 'best_effort', 'async'
  )),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  table_name text,
  function_name text,
  trigger_name text,
  error_code text,
  error_summary text,
  expected jsonb,
  observed jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (trace_id, step_key)
);

create index if not exists trace_steps_trace_id_idx
  on helm_debug.trace_steps (trace_id, created_at, id);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- Do not emit request payloads, session material, or authorization headers in
-- a flight-recorder event. The helper is a final defence for common accidental
-- top-level keys; callers are responsible for sending summaries only.
create or replace function helm_private.trace_safe_metadata(p_metadata jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_metadata, '{}'::jsonb) - array[
    'authorization', 'cookie', 'cookies', 'token', 'access_token',
    'refresh_token', 'service_role', 'service_role_key', 'password',
    'payload', 'round_payload', 'headers'
  ]
$$;

-- This helper deliberately logs instead of inserting into helm_debug. It is
-- called from atomic functions/triggers, so a table write would be rolled back
-- with the business operation. PostgreSQL LOG output remains available after a
-- rollback and can be ingested by the optional local trace collector.
create or replace function helm_private.trace_checkpoint(
  p_step_key text,
  p_parent_step_key text default null,
  p_phase text default 'checkpoint',
  p_status text default 'success',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, helm_private
as $$
declare
  v_trace_id text := current_setting('helm.trace_id', true);
  v_enabled text := current_setting('helm.trace_enabled', true);
  v_level integer := coalesce(nullif(current_setting('helm.trace_level', true), '')::integer, 0);
begin
  if v_trace_id is null or v_enabled is distinct from 'on' or v_level < 1 then
    return;
  end if;

  perform set_config('helm.trace_step', p_step_key, true);

  raise log 'HELM_TRACE %', jsonb_build_object(
    'trace_id', v_trace_id,
    'step_key', p_step_key,
    'parent_step_key', p_parent_step_key,
    'phase', p_phase,
    'status', p_status,
    'txid', txid_current_if_assigned(),
    'pid', pg_backend_pid(),
    'metadata', helm_private.trace_safe_metadata(p_metadata)
  )::text;
end;
$$;

create or replace function helm_private.configure_trace_context(p_round_data jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, helm_private
as $$
declare
  v_trace_id text := p_round_data #>> '{_helm_trace,trace_id}';
  v_level integer := coalesce(nullif(p_round_data #>> '{_helm_trace,level}', '')::integer, 1);
begin
  if coalesce(p_round_data #>> '{_helm_trace,enabled}', 'false') <> 'true'
    or v_trace_id is null
    or v_trace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  perform set_config('helm.trace_id', v_trace_id, true);
  perform set_config('helm.trace_enabled', 'on', true);
  perform set_config('helm.trace_level', greatest(1, least(v_level, 3))::text, true);
end;
$$;

-- EXCEPTION blocks run in an implicit PostgreSQL subtransaction. Transaction-
-- local settings configured inside the RPC are restored before the handler
-- executes, so rollback reporting must carry the original request context
-- directly instead of depending on current_setting('helm.trace_id').
create or replace function helm_private.trace_exception_checkpoint(
  p_round_data jsonb,
  p_step_key text,
  p_parent_step_key text,
  p_sqlstate text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, helm_private
as $$
declare
  v_trace_id text := p_round_data #>> '{_helm_trace,trace_id}';
begin
  if coalesce(p_round_data #>> '{_helm_trace,enabled}', 'false') <> 'true'
    or v_trace_id is null
    or v_trace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  raise log 'HELM_TRACE %', jsonb_build_object(
    'trace_id', v_trace_id,
    'step_key', p_step_key,
    'parent_step_key', p_parent_step_key,
    'phase', 'exception',
    'status', 'failure',
    'txid', txid_current_if_assigned(),
    'pid', pg_backend_pid(),
    'metadata', jsonb_build_object('sqlstate', p_sqlstate, 'message', left(p_message, 1000))
  )::text;
end;
$$;

revoke all on function helm_private.trace_safe_metadata(jsonb) from public;
revoke all on function helm_private.trace_checkpoint(text, text, text, text, jsonb) from public;
revoke all on function helm_private.configure_trace_context(jsonb) from public;
revoke all on function helm_private.trace_exception_checkpoint(jsonb, text, text, text, text) from public;

-- The public wrappers are the only write/read gateway for the private schema.
-- They are SECURITY DEFINER by design: PostgREST cannot expose helm_debug, and
-- the service-role-only API keeps trace capture fail-open and out of business
-- transactions without broadening player/coach RLS access.
create or replace function public.helm_debug_start_trace(
  p_trace_id uuid,
  p_workflow text,
  p_environment text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, helm_debug, helm_private
as $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
begin
  if p_workflow !~ '^golf[.]' then
    raise exception using errcode = '22023', message = 'Flight recorder workflow must be a Golf workflow.';
  end if;

  insert into helm_debug.trace_runs (
    trace_id, workflow, environment, round_id, team_id, player_id,
    sentry_trace_id, root_span_id, expected_step_count, metadata
  ) values (
    p_trace_id,
    p_workflow,
    left(coalesce(nullif(p_environment, ''), 'unknown'), 64),
    nullif(v_metadata ->> 'round_id', '')::uuid,
    nullif(v_metadata ->> 'team_id', '')::uuid,
    nullif(v_metadata ->> 'player_id', '')::uuid,
    nullif(v_metadata ->> 'sentry_trace_id', ''),
    nullif(v_metadata ->> 'root_span_id', ''),
    coalesce((v_metadata ->> 'expected_step_count')::integer, 0),
    v_metadata
  )
  on conflict (trace_id) do update set
    workflow = excluded.workflow,
    environment = excluded.environment,
    metadata = helm_debug.trace_runs.metadata || excluded.metadata,
    updated_at = clock_timestamp();

  return p_trace_id;
end;
$$;

create or replace function public.helm_debug_record_trace_step(
  p_trace_id uuid,
  p_step_key text,
  p_layer text,
  p_status text,
  p_requiredness text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, helm_debug, helm_private
as $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
  v_finished_at timestamptz := case when p_status in ('success', 'failure', 'skipped', 'missing', 'warning') then clock_timestamp() else null end;
begin
  insert into helm_debug.trace_steps (
    trace_id, step_key, parent_step_key, layer, category, status, requiredness,
    started_at, finished_at, duration_ms, table_name, function_name, trigger_name,
    error_code, error_summary, expected, observed, metadata
  ) values (
    p_trace_id,
    p_step_key,
    nullif(v_metadata ->> 'parent_step_key', ''),
    p_layer,
    nullif(v_metadata ->> 'category', ''),
    p_status,
    p_requiredness,
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

  update helm_debug.trace_runs
  set observed_step_count = (
        select count(*) from helm_debug.trace_steps where trace_id = p_trace_id
      ),
      updated_at = clock_timestamp()
  where trace_id = p_trace_id;
end;
$$;

create or replace function public.helm_debug_finalize_trace(
  p_trace_id uuid,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, helm_debug, helm_private
as $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
begin
  update helm_debug.trace_runs
  set status = p_status,
      finished_at = clock_timestamp(),
      duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
      missing_required_step_count = coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count),
      failure_step = coalesce(nullif(v_metadata ->> 'failure_step', ''), failure_step),
      failure_code = coalesce(nullif(v_metadata ->> 'failure_code', ''), failure_code),
      failure_summary = coalesce(nullif(v_metadata ->> 'failure_summary', ''), failure_summary),
      metadata = metadata || v_metadata,
      updated_at = clock_timestamp()
  where trace_id = p_trace_id;
end;
$$;

create or replace function public.helm_debug_list_traces(
  p_limit integer default 50,
  p_workflow text default null,
  p_round_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (
    select trace_id, workflow, environment, status, started_at, finished_at,
      duration_ms, round_id, team_id, player_id, sentry_trace_id, root_span_id,
      expected_step_count, observed_step_count, missing_required_step_count,
      failure_step, failure_code, failure_summary
    from helm_debug.trace_runs
    where (p_workflow is null or workflow = p_workflow)
      and (p_round_id is null or round_id = p_round_id)
    order by started_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r
$$;

create or replace function public.helm_debug_get_trace(p_trace_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce((
    select jsonb_build_object(
      'run', to_jsonb(r),
      'steps', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
        from helm_debug.trace_steps s
        where s.trace_id = r.trace_id
      ), '[]'::jsonb)
    )
    from helm_debug.trace_runs r
    where r.trace_id = p_trace_id
  ), '{}'::jsonb)
$$;

revoke all on function public.helm_debug_start_trace(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.helm_debug_record_trace_step(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.helm_debug_finalize_trace(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.helm_debug_list_traces(integer, text, uuid) from public, anon, authenticated;
revoke all on function public.helm_debug_get_trace(uuid) from public, anon, authenticated;
grant execute on function public.helm_debug_start_trace(uuid, text, text, jsonb) to service_role;
grant execute on function public.helm_debug_record_trace_step(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.helm_debug_finalize_trace(uuid, text, jsonb) to service_role;
grant execute on function public.helm_debug_list_traces(integer, text, uuid) to service_role;
grant execute on function public.helm_debug_get_trace(uuid) to service_role;

-- Keep the current production-shaped RPC definitions intact and add only
-- checkpoint calls. The migration reads the live prior definition so it does
-- not accidentally resurrect an older copy of these high-risk functions.
do $do$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
    into v_definition;
  v_original := v_definition;

  if position('helm_private.trace_checkpoint' in v_definition) = 0 then
    v_definition := replace(v_definition,
      '  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);',
      '  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);' || E'\n'
      || '  PERFORM helm_private.configure_trace_context(p_round_data);' || E'\n'
      || '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic'', NULL, ''enter'', ''started'', jsonb_build_object(''function'', ''submit_round_atomic''));'
    );
    v_definition := replace(v_definition,
      '  UPDATE golf_rounds SET',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.update_round'', ''db.submit_round_atomic'', ''before'', ''started'', jsonb_build_object(''table'', ''golf_rounds''));' || E'\n'
      || '  UPDATE golf_rounds SET'
    );
    v_definition := replace(v_definition,
      '  DELETE FROM golf_shots WHERE round_id = p_round_id;',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.replace_snapshot'', ''db.submit_round_atomic'', ''before'', ''started'', jsonb_build_object(''tables'', jsonb_build_array(''golf_shots'', ''golf_holes'')));' || E'\n'
      || '  DELETE FROM golf_shots WHERE round_id = p_round_id;'
    );
    v_definition := replace(v_definition,
      '  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.insert_holes'', ''db.submit_round_atomic'', ''before'', ''started'', jsonb_build_object(''expected_holes'', coalesce(jsonb_array_length(p_holes), 0)));' || E'\n'
      || '  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN'
    );
    v_definition := replace(v_definition,
      '  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.insert_shots'', ''db.submit_round_atomic'', ''before'', ''started'', jsonb_build_object(''shot_groups'', coalesce(jsonb_array_length(p_shots), 0)));' || E'\n'
      || '  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN'
    );
    v_definition := replace(v_definition,
      '  PERFORM recalculate_round_strokes_gained(p_round_id);',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.recalculate_strokes_gained'', ''db.submit_round_atomic'', ''before'', ''started'', jsonb_build_object(''round_id'', p_round_id));' || E'\n'
      || '  PERFORM recalculate_round_strokes_gained(p_round_id);'
    );
    v_definition := replace(v_definition,
      '  RETURN jsonb_build_object(''success'', true, ''round_id'', p_round_id, ''warnings'', v_warnings);',
      '  PERFORM helm_private.trace_checkpoint(''db.submit_round_atomic.commit'', ''db.submit_round_atomic'', ''before_return'', ''success'', jsonb_build_object(''round_id'', p_round_id, ''holes'', jsonb_array_length(v_inserted_holes), ''shots'', jsonb_array_length(v_inserted_shots)));' || E'\n'
      || '  RETURN jsonb_build_object(''success'', true, ''round_id'', p_round_id, ''warnings'', v_warnings);'
    );
    v_definition := replace(v_definition,
      E'\nEND;\n$function$',
      E'\nEXCEPTION WHEN OTHERS THEN\n'
      || '  BEGIN' || E'\n'
      || '    PERFORM helm_private.trace_exception_checkpoint(p_round_data, ''db.submit_round_atomic.exception'', ''db.submit_round_atomic'', SQLSTATE, SQLERRM);' || E'\n'
      || '  EXCEPTION WHEN OTHERS THEN NULL;' || E'\n'
      || '  END;' || E'\n'
      || '  RAISE;' || E'\n'
      || 'END;' || E'\n'
      || '$function$'
    );

    if v_definition = v_original then
      raise exception 'Unable to add submit_round_atomic flight recorder checkpoints: expected anchors changed';
    end if;
    execute v_definition;
  end if;

  select pg_get_functiondef('public.save_partial_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)'::regprocedure)
    into v_definition;
  v_original := v_definition;
  if position('helm_private.trace_checkpoint' in v_definition) = 0 then
    v_definition := replace(v_definition,
      '  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);',
      '  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);' || E'\n'
      || '  PERFORM helm_private.configure_trace_context(p_round_data);' || E'\n'
      || '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic'', NULL, ''enter'', ''started'', jsonb_build_object(''function'', ''save_partial_round_atomic''));'
    );
    v_definition := replace(v_definition,
      '  UPDATE golf_rounds SET',
      '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic.update_round'', ''db.save_partial_round_atomic'', ''before'', ''started'', jsonb_build_object(''table'', ''golf_rounds''));' || E'\n'
      || '  UPDATE golf_rounds SET'
    );
    v_definition := replace(v_definition,
      '  DELETE FROM golf_shots WHERE round_id = p_round_id;',
      '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic.replace_snapshot'', ''db.save_partial_round_atomic'', ''before'', ''started'', jsonb_build_object(''tables'', jsonb_build_array(''golf_shots'', ''golf_holes'')));' || E'\n'
      || '  DELETE FROM golf_shots WHERE round_id = p_round_id;'
    );
    v_definition := replace(v_definition,
      '  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN',
      '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic.insert_holes'', ''db.save_partial_round_atomic'', ''before'', ''started'', jsonb_build_object(''expected_holes'', coalesce(jsonb_array_length(p_holes), 0)));' || E'\n'
      || '  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN'
    );
    v_definition := replace(v_definition,
      '  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN',
      '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic.insert_shots'', ''db.save_partial_round_atomic'', ''before'', ''started'', jsonb_build_object(''shot_groups'', coalesce(jsonb_array_length(p_shots), 0)));' || E'\n'
      || '  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN'
    );
    v_definition := replace(v_definition,
      '  RETURN jsonb_build_object(' || E'\n' || '    ''success'', true,',
      '  PERFORM helm_private.trace_checkpoint(''db.save_partial_round_atomic.commit'', ''db.save_partial_round_atomic'', ''before_return'', ''success'', jsonb_build_object(''round_id'', p_round_id, ''holes'', jsonb_array_length(v_inserted_holes), ''shots'', jsonb_array_length(v_inserted_shots)));' || E'\n'
      || '  RETURN jsonb_build_object(' || E'\n' || '    ''success'', true,'
    );
    v_definition := replace(v_definition,
      E'\nEND;\n$function$',
      E'\nEXCEPTION WHEN OTHERS THEN\n'
      || '  BEGIN' || E'\n'
      || '    PERFORM helm_private.trace_exception_checkpoint(p_round_data, ''db.save_partial_round_atomic.exception'', ''db.save_partial_round_atomic'', SQLSTATE, SQLERRM);' || E'\n'
      || '  EXCEPTION WHEN OTHERS THEN NULL;' || E'\n'
      || '  END;' || E'\n'
      || '  RAISE;' || E'\n'
      || 'END;' || E'\n'
      || '$function$'
    );

    if v_definition = v_original then
      raise exception 'Unable to add save_partial_round_atomic flight recorder checkpoints: expected anchors changed';
    end if;
    execute v_definition;
  end if;
end;
$do$;
