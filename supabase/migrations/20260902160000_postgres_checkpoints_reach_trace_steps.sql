-- Postgres-side Flight Recorder checkpoints now reach trace_steps, not only
-- the server log.
--
-- Measured in production 2026-09-02, over helm_debug.trace_runs/trace_steps:
-- 1313 trace runs, 2420 trace steps, ZERO steps carrying function_name,
-- table_name or trigger_name -- and only eight step keys were EVER
-- recorded: db.save_partial_round_atomic, db.submit_round_atomic,
-- server.auth, server.player, server.validation, verify.holes, verify.round,
-- verify.shots. Every one of those is written by the APPLICATION side
-- (public.helm_debug_record_trace_step, called from
-- src/lib/observability/helm-flight-recorder.ts). The DATABASE side --
-- helm_private.trace_checkpoint(), called from inside
-- public.submit_round_atomic and public.save_partial_round_atomic at eight
-- more granular points -- has always done exactly one thing:
-- `RAISE LOG 'HELM_TRACE %', ...`. Nothing in production collects Postgres
-- logs, so every one of those checkpoints has fired since 20260825200811
-- shipped and left no trace anyone can query. The Bridge's trace tree
-- (src/app/admin/traces/trace-tree.ts) can only render what
-- helm_debug.trace_steps holds, so it has never shown a Postgres-layer child
-- under db.submit_round_atomic -- none has ever existed there.
--
-- WHAT CHANGES. Both functions keep their signatures, their RAISE LOG line,
-- their SECURITY INVOKER setting, their search_path, and every existing
-- call site -- nothing in either RPC body changes. Each now also UPSERTS a
-- row into helm_debug.trace_steps when the transaction's trace context is
-- enabled:
--
--   trace_id       helm.trace_id (plain variant), or p_round_data's
--                  _helm_trace.trace_id (exception variant -- a GUC set
--                  inside a block PostgreSQL is about to roll back to that
--                  block's own savepoint does not survive the rollback,
--                  which is exactly why trace_exception_checkpoint has
--                  always taken p_round_data as an argument rather than
--                  reading current_setting()).
--   step_key       p_step_key, verbatim.
--   parent_step_key  p_parent_step_key when supplied (every call site
--                  today supplies one); otherwise the RPC-level key -- the
--                  step key's first two dot-segments, e.g.
--                  'db.submit_round_atomic' out of
--                  'db.submit_round_atomic.insert_holes' -- so a future
--                  call site that omits it still nests correctly.
--   layer          'postgres' on first insert. An UPSERT never changes an
--                  already-recorded layer: db.save_partial_round_atomic is
--                  declared layer 'supabase' in the JS workflow definition
--                  (golf-round-flight-workflow.ts), and this write must
--                  not fight the application layer over a row it already
--                  owns.
--   status         'started' for the RPC's own entry checkpoint
--                  (p_phase = 'enter', before any work has happened --
--                  writing 'success' there would let a fail-open JS
--                  completion write leave a failed round permanently
--                  marked successful, the exact defect 20260901140000
--                  closed); 'success' for every other plain checkpoint,
--                  because reaching one with no exception IS the
--                  observation; 'failure' for the exception variant, with
--                  metadata carrying {sqlstate, message}.
--   requiredness   'best_effort' on first insert, never overwritten after
--                  (same reasoning as layer above). A substep like
--                  insert_shots correctly never fires when p_shots is
--                  empty; treating that as a broken trace would make
--                  trace-tree.ts's missing-required-step diff cry wolf on
--                  a normal save.
--   function_name  the enclosing RPC name, derived from the step key's
--                  second dot-segment, or taken from metadata->>'function'
--                  when the caller supplies one (as the entry checkpoint
--                  already does). An UPSERT never overwrites an
--                  already-recorded value with NULL.
--   table_name     derived from the step's last dot-segment for the four
--                  substeps that touch exactly one table (update_round ->
--                  golf_rounds, insert_holes -> golf_holes, insert_shots
--                  -> golf_shots, recalculate_strokes_gained ->
--                  golf_rounds), or from metadata->>'table' when supplied.
--                  replace_snapshot touches two tables and already
--                  carries them in metadata->'tables' -- table_name stays
--                  null there, by design, not by omission.
--   started_at /   finished_at is clock_timestamp() -- the instant the
--   finished_at    checkpoint fired. These are point-in-time markers, not
--                  start/end pairs, so started_at approximates the
--                  PREVIOUS checkpoint's finished_at for the same trace
--                  (or clock_timestamp() for the first checkpoint seen).
--                  Documented approximation of "time since the last thing
--                  we know happened," not a measured duration: two
--                  checkpoints from different parents can be adjacent in
--                  call order without being causally related. An UPSERT
--                  never regresses an already-recorded started_at.
--
-- FAIL-OPEN BY CONSTRUCTION. The new write sits inside its own
-- BEGIN...EXCEPTION WHEN OTHERS...END block, wrapping only the SELECT and
-- INSERT -- never the RAISE LOG line, which keeps firing regardless. A
-- checkpoint write that cannot succeed (the table renamed, a grant
-- revoked, a bad cast) can therefore never abort or slow the round write
-- it instruments beyond that one already-failed statement; it logs its own
-- failure under a distinct tag and returns. With tracing off, the existing
-- top-of-function gate returns before any of this runs.
--
-- WHAT THIS DOES NOT CLOSE. The exception variant's new row is subject to
-- the SAME rollback this migration's header used to warn about for the
-- RAISE LOG line's necessity: submit_round_atomic's own handler ends in a
-- bare `RAISE;`, so on every current call site the error propagates out of
-- the RPC, the request's one transaction aborts, and EVERY write made
-- during that call is discarded -- including this migration's own
-- exception-checkpoint row. RAISE LOG remains the only record that
-- survives that path today. The write is added anyway because it is
-- fail-open and harmless, and because it becomes durable the moment any
-- caller catches the RPC's error without rolling back the whole
-- transaction -- but nothing here should be read as "failures are now
-- captured in helm_debug.trace_steps." They still are not, for the
-- request shape production actually uses.
--
-- SECURITY MODEL, UNCHANGED. Both functions stay SECURITY INVOKER with
-- their existing search_path and are called only from inside
-- public.submit_round_atomic / public.save_partial_round_atomic, which are
-- SECURITY DEFINER owned by `postgres` -- the same role that owns
-- helm_debug.trace_steps (read-only catalog check against production
-- 2026-09-02: `select pg_get_userbyid(relowner) from pg_class where
-- oid = 'helm_debug.trace_steps'::regclass` returns `postgres`), so the
-- INSERT below runs with the table owner's implicit privileges and needs
-- no new GRANT. helm_debug keeps zero row-level policies and this
-- migration grants nothing new to anon or authenticated.
--
-- KNOWN LOG-VOLUME SIDE EFFECT. `persistStart`'s 1500ms timeout
-- (helm-flight-recorder.ts) degrades the JS recorder to no-ops on a slow
-- write, but the round-data payload still embeds `_helm_trace` either way
-- (buildHelmTraceContext does not know the timeout happened). When that
-- race is lost, `helm_debug.trace_runs` never gets its row, every
-- checkpoint insert in this migration fails its foreign key, and the new
-- EXCEPTION handler below logs one HELM_TRACE_STEP_WRITE_FAILED line per
-- checkpoint -- up to eight per submit. Fail-open handles it correctly;
-- this is a log-volume note, not a defect.
--
-- KNOWN COUNTER LAG, SELF-HEALING ON EVERY CURRENT CALL SITE.
-- `helm_debug.trace_runs.observed_step_count` (what `helm_debug_list_traces`
-- shows in the Bridge's trace list) is maintained only by
-- `public.helm_debug_record_trace_step`'s own `UPDATE ... SET
-- observed_step_count = (SELECT count(*) FROM helm_debug.trace_steps WHERE
-- trace_id = ...)` -- the JS-side facade. The INSERTs this migration adds go
-- straight into helm_debug.trace_steps and never call that facade, so they do
-- not bump the counter themselves: verified locally 2026-09-02 -- immediately
-- after a traced submit_round_atomic, trace_runs.observed_step_count read 0
-- while trace_steps already held all 7 Postgres-written rows for that trace.
-- The gap is transient, not permanent: helm_debug_record_trace_step
-- recomputes via a fresh count(*) regardless of which layer wrote the rows
-- it is counting, so the NEXT call to it for the same trace_id (any step key)
-- brings observed_step_count fully current -- verified locally the same way:
-- one such call afterward moved it from 0 to 7. In production every current
-- call site reaches that facade at least once per request
-- (flightRecorder.complete/.fail/.warn in src/app/golf/actions/golf.ts fires
-- immediately after the RPC returns, on every path), so the undercount window
-- is bounded by that one request's own lifecycle, not indefinite. A trace
-- read in the narrow gap between the RPC returning and that JS write lands
-- would still show the true count in `helm_debug_get_trace`'s `steps` array
-- (this migration's own contract) with a stale `run.observed_step_count` next
-- to it -- a list-view undercount, not a lost checkpoint.
--
-- R3 (privileged: rewrites two functions the round-submit and
-- round-autosave path calls on every request). Prepared by an agent; only
-- the owner applies. See supabase/migrations/HELD.md for the pre-apply
-- fingerprint to re-check before applying.

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
$$;

-- Grants restated, house convention: CREATE OR REPLACE preserves the ACL
-- 20260825200811 set (revoked from public; these two are SECURITY INVOKER
-- so no role is separately granted EXECUTE beyond what already reaches
-- them through the SECURITY DEFINER RPCs that call them), but a migration
-- that touches these functions says so explicitly rather than relying on
-- it.
revoke all on function helm_private.trace_checkpoint(
    text, text, text, text, jsonb
) from public;
revoke all on function helm_private.trace_exception_checkpoint(
    jsonb, text, text, text, text
) from public;
