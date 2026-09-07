SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION "helm_private"."configure_trace_context"("p_round_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $_$
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
$_$;

ALTER FUNCTION "helm_private"."configure_trace_context"("p_round_data" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."guard_golf_round_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user IN ('postgres', 'service_role')
    AND current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    AND (to_jsonb(NEW) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) = (to_jsonb(OLD) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'round_recap'
    AND (to_jsonb(NEW) - ARRAY['ai_recap', 'ai_recap_generated_at'])
      = (to_jsonb(OLD) - ARRAY['ai_recap', 'ai_recap_generated_at']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'coachhelm_terminal'
    AND (to_jsonb(NEW) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) = (to_jsonb(OLD) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    AND (to_jsonb(NEW) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) = (to_jsonb(OLD) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds are permanent history and cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds are permanent history and cannot be changed.';
    END IF;
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
    END IF;
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.round_type IS DISTINCT FROM OLD.round_type
      OR NEW.qualifier_id IS DISTINCT FROM OLD.qualifier_id
      OR NEW.qualifier_round_number IS DISTINCT FROM OLD.qualifier_round_number THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."guard_golf_round_lifecycle"() OWNER TO "postgres";

COMMENT ON FUNCTION "helm_private"."guard_golf_round_lifecycle"() IS 'Blocks direct completed-round mutation and started-round identity changes. The protected atomic submit RPC is the sole terminal-write bypass and enforces its own player authorization and durable qualifier identity.';

CREATE OR REPLACE FUNCTION "helm_private"."prevent_active_team_member_deactivation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' AND EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE team_id = OLD.team_id AND player_id = OLD.player_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This player has a saved in-progress round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_active_team_member_deactivation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_qualifier_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE qualifier_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This qualifier has saved rounds. Have players finish or explicitly discard them before deleting the qualifier.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_qualifier_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_qualifier_entry_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE player_id = OLD.player_id
      AND qualifier_id = OLD.qualifier_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved qualifier round. Have them finish or explicitly discard it before removing their qualifier entry.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_qualifier_entry_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_team_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This team has saved rounds. Have players finish or explicitly discard them before deleting the team.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_team_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_team_member_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.team_id
      AND player_id = OLD.player_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_team_member_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."reject_completed_round_child_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target_round_id uuid;
BEGIN
  IF current_user = 'postgres' AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  target_round_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.round_id ELSE OLD.round_id END;
  IF EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE status = 'completed'
      AND id IN (target_round_id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.round_id END)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shots cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."reject_completed_round_child_mutation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."reject_completed_round_detail_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  old_shot_id uuid;
  new_shot_id uuid;
BEGIN
  IF current_user = 'postgres' AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  old_shot_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.shot_id END;
  new_shot_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.shot_id END;
  IF EXISTS (
    SELECT 1 FROM public.golf_shots s
    JOIN public.golf_rounds r ON r.id = s.round_id
    WHERE r.status = 'completed' AND s.id IN (old_shot_id, new_shot_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shot details cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."reject_completed_round_detail_mutation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id uuid;
  v_recap text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to save a round recap.';
  END IF;
  v_recap := btrim(coalesce(p_recap, ''));
  IF char_length(v_recap) < 30 OR char_length(v_recap) > 400 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Round recap must be between 30 and 400 characters.';
  END IF;

  SELECT player_id
  INTO v_player_id
  FROM public.golf_rounds
  WHERE id = p_round_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Completed round not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.golf_players
    WHERE id = v_player_id
      AND user_id = p_actor_user_id
  ) AND NOT coalesce(public.verify_coach_owns_player(v_player_id, p_actor_user_id), false) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'You do not have access to this round.';
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'round_recap', true);

  UPDATE public.golf_rounds
  SET ai_recap = v_recap,
      ai_recap_generated_at = now()
  WHERE id = p_round_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION "helm_private"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text", "p_actor_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_checkpoint"("p_step_key" "text", "p_parent_step_key" "text" DEFAULT NULL::"text", "p_phase" "text" DEFAULT 'checkpoint'::"text", "p_status" "text" DEFAULT 'success'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $$
declare
  v_trace_id text := current_setting('helm.trace_id', true);
  v_enabled text := current_setting('helm.trace_enabled', true);
  v_level integer := coalesce(nullif(current_setting('helm.trace_level', true), '')::integer, 0);
  v_safe_metadata jsonb;
  v_parts text[];
  v_parent text;
  v_function_name text;
  v_table_name text;
  v_last text;
  v_row_status text;
  v_prev_finished_at timestamptz;
  v_now timestamptz;
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

  -- Best-effort persistence into helm_debug.trace_steps so the Bridge can
  -- render this checkpoint. Never allowed to fail or slow the caller
  -- beyond this block: any error here is caught, logged, and swallowed.
  begin
    v_now := clock_timestamp();
    v_safe_metadata := helm_private.trace_safe_metadata(p_metadata);
    v_parts := string_to_array(p_step_key, '.');

    if p_parent_step_key is not null then
      v_parent := p_parent_step_key;
    elsif array_length(v_parts, 1) >= 3 then
      v_parent := v_parts[1] || '.' || v_parts[2];
    else
      v_parent := null;
    end if;

    v_function_name := coalesce(
      nullif(v_safe_metadata ->> 'function', ''),
      case when array_length(v_parts, 1) >= 2 then v_parts[2] else null end
    );

    v_last := v_parts[array_length(v_parts, 1)];
    v_table_name := coalesce(
      nullif(v_safe_metadata ->> 'table', ''),
      case v_last
        when 'update_round' then 'golf_rounds'
        when 'insert_holes' then 'golf_holes'
        when 'insert_shots' then 'golf_shots'
        when 'recalculate_strokes_gained' then 'golf_rounds'
        else null
      end
    );

    -- The entry checkpoint fires before any work has happened; recording
    -- it as 'success' would let a later fail-open JS write leave a failed
    -- round permanently marked successful. Every other plain checkpoint
    -- reports 'success': reaching it with no exception is the observation.
    v_row_status := case when p_phase = 'enter' then 'started' else 'success' end;

    select finished_at into v_prev_finished_at
    from helm_debug.trace_steps
    where trace_id = v_trace_id::uuid
    order by created_at desc, id desc
    limit 1;

    insert into helm_debug.trace_steps (
      trace_id, step_key, parent_step_key, layer, status, requiredness,
      started_at, finished_at, function_name, table_name, metadata
    ) values (
      v_trace_id::uuid,
      p_step_key,
      v_parent,
      'postgres',
      v_row_status,
      'best_effort',
      coalesce(v_prev_finished_at, v_now),
      v_now,
      v_function_name,
      v_table_name,
      v_safe_metadata
    )
    on conflict (trace_id, step_key) do update set
      parent_step_key = coalesce(helm_debug.trace_steps.parent_step_key, excluded.parent_step_key),
      status = excluded.status,
      started_at = coalesce(helm_debug.trace_steps.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      function_name = coalesce(helm_debug.trace_steps.function_name, excluded.function_name),
      table_name = coalesce(helm_debug.trace_steps.table_name, excluded.table_name),
      metadata = helm_debug.trace_steps.metadata || excluded.metadata,
      updated_at = clock_timestamp();
    -- layer and requiredness are deliberately NOT in the SET list above:
    -- this writer only ever proposes them on first insert (they are
    -- constant for every row it writes) and must never override a value
    -- the JS application layer already recorded for the same key.
  exception when others then
    raise log 'HELM_TRACE_STEP_WRITE_FAILED %', jsonb_build_object(
      'trace_id', v_trace_id,
      'step_key', p_step_key,
      'sqlstate', SQLSTATE,
      'message', left(SQLERRM, 500)
    )::text;
  end;
end;
$$;

ALTER FUNCTION "helm_private"."trace_checkpoint"("p_step_key" "text", "p_parent_step_key" "text", "p_phase" "text", "p_status" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_exception_checkpoint"("p_round_data" "jsonb", "p_step_key" "text", "p_parent_step_key" "text", "p_sqlstate" "text", "p_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $_$
declare
  v_trace_id text := p_round_data #>> '{_helm_trace,trace_id}';
  v_parts text[];
  v_parent text;
  v_function_name text;
  v_metadata jsonb;
  v_prev_finished_at timestamptz;
  v_now timestamptz;
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

  -- Best-effort, same fail-open contract as trace_checkpoint above. See
  -- this file's header for why this specific row does not, today, survive
  -- the outer RPC's own rollback-and-reraise on any current call site.
  begin
    v_now := clock_timestamp();
    v_metadata := jsonb_build_object('sqlstate', p_sqlstate, 'message', left(p_message, 1000));
    v_parts := string_to_array(p_step_key, '.');

    if p_parent_step_key is not null then
      v_parent := p_parent_step_key;
    elsif array_length(v_parts, 1) >= 3 then
      v_parent := v_parts[1] || '.' || v_parts[2];
    else
      v_parent := null;
    end if;

    v_function_name := case when array_length(v_parts, 1) >= 2 then v_parts[2] else null end;

    select finished_at into v_prev_finished_at
    from helm_debug.trace_steps
    where trace_id = v_trace_id::uuid
    order by created_at desc, id desc
    limit 1;

    insert into helm_debug.trace_steps (
      trace_id, step_key, parent_step_key, layer, status, requiredness,
      started_at, finished_at, function_name, error_code, error_summary,
      metadata
    ) values (
      v_trace_id::uuid,
      p_step_key,
      v_parent,
      'postgres',
      'failure',
      'best_effort',
      coalesce(v_prev_finished_at, v_now),
      v_now,
      v_function_name,
      p_sqlstate,
      left(p_message, 1000),
      v_metadata
    )
    on conflict (trace_id, step_key) do update set
      parent_step_key = coalesce(helm_debug.trace_steps.parent_step_key, excluded.parent_step_key),
      status = excluded.status,
      started_at = coalesce(helm_debug.trace_steps.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      function_name = coalesce(helm_debug.trace_steps.function_name, excluded.function_name),
      error_code = excluded.error_code,
      error_summary = excluded.error_summary,
      metadata = helm_debug.trace_steps.metadata || excluded.metadata,
      updated_at = clock_timestamp();
  exception when others then
    raise log 'HELM_TRACE_STEP_WRITE_FAILED %', jsonb_build_object(
      'trace_id', v_trace_id,
      'step_key', p_step_key,
      'sqlstate', SQLSTATE,
      'message', left(SQLERRM, 500)
    )::text;
  end;
end;
$_$;

ALTER FUNCTION "helm_private"."trace_exception_checkpoint"("p_round_data" "jsonb", "p_step_key" "text", "p_parent_step_key" "text", "p_sqlstate" "text", "p_message" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_safe_metadata"("p_metadata" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select coalesce(p_metadata, '{}'::jsonb) - array[
    'authorization', 'cookie', 'cookies', 'token', 'access_token',
    'refresh_token', 'service_role', 'service_role_key', 'password',
    'payload', 'round_payload', 'headers'
  ]
$$;

ALTER FUNCTION "helm_private"."trace_safe_metadata"("p_metadata" "jsonb") OWNER TO "postgres";
