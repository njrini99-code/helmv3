-- Round-submission RPCs dropped course_id.
--
-- submit_round_atomic and save_partial_round_atomic both mapped tee_id from
-- p_round_data into golf_rounds but had NO course_id assignment — so a round
-- started from a Cloud Course Library tee never persisted course_id (the app
-- derives it from the tee at submit time, but the RPC threw it away). The new
-- "Recently played" picker carousel keys off golf_rounds.course_id, so without
-- this fix a played cloud course would never appear there.
--
-- Inject a course_id assignment immediately after the (byte-identical) tee_id
-- clause in each RPC, via a drift-free literal replace on the live function
-- definition. Idempotent (skips if course_id is already mapped) and fails loudly
-- if the tee_id anchor is ever missing (definition drift). COALESCE-preserve so
-- a partial save can never null an already-linked course.
--
-- Mirrors the drift-free DO-block pattern from
-- 20260613170000_course_library_round_tee_id.sql.

do $mig$
declare
  fn text;
  def text;
  anchor text := 'tee_id = CASE WHEN p_round_data->>''tee_id'' IS NULL THEN NULL ELSE (p_round_data->>''tee_id'')::uuid END';
  inject text := 'tee_id = CASE WHEN p_round_data->>''tee_id'' IS NULL THEN NULL ELSE (p_round_data->>''tee_id'')::uuid END, course_id = COALESCE((p_round_data->>''course_id'')::uuid, course_id)';
begin
  foreach fn in array array['submit_round_atomic', 'save_partial_round_atomic'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;

    if def is null then
      raise exception 'function public.% not found', fn;
    end if;

    -- already maps course_id -> idempotent skip
    if position('course_id =' in def) > 0 then
      continue;
    end if;

    if position(anchor in def) = 0 then
      raise exception 'tee_id anchor not found in % — aborting (definition drifted)', fn;
    end if;

    execute replace(def, anchor, inject);
  end loop;
end $mig$;
