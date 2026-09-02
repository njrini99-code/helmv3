-- A trace that observed nothing must not report success.
--
-- Measured in production 2026-09-01, over 7 days of helm_debug.trace_runs:
--
--   golf.round.autosave   1041 runs  status=success
--                         avg observed 1.02 / expected 8
--                         1038 of them with missing_required_step_count > 0
--   golf.round.submit       23 runs  status=success
--                         avg observed 1.00 / expected 11
--                         all 23 with missing_required_step_count > 0
--
-- Every one of those recorded exactly one step — `db.save_partial_round_atomic`
-- or `db.submit_round_atomic`, the checkpoint the RPC writes itself. The steps
-- that were missing are the application-side ones: server.validation,
-- server.auth, server.player, verify.round, verify.holes, verify.shots. So the
-- database half of the recorder was working and the app half was not, and the
-- run still finalised as `success`.
--
-- The app half was fixed separately and shipped in e5ec5e7b8 (~12:45 UTC
-- 2026-09-01); traces after 13:00 show 7 observed of 8 expected with
-- missing_required_step_count = 0. This migration is not that fix. It closes
-- the reason nobody noticed for the preceding 1,097 runs.
--
-- WHY THE FUNCTION IS THE RIGHT PLACE. `helm_debug_finalize_trace` took
-- `p_status` from the caller and wrote it verbatim, never once consulting the
-- counts stored on the same row it was updating. A recorder that accepts the
-- caller's word for its own health is not an instrument; it is a log line. It
-- is the same shape as a CI gate that exits 0 without running, which is a
-- failure this repo has now hit in the deploy script, in check:types-drift and
-- here.
--
-- WHAT CHANGES. Two things, both narrow:
--
--   1. observed_step_count is DERIVED from helm_debug.trace_steps rather than
--      trusted, so the count cannot disagree with the rows it summarises.
--   2. A caller-supplied 'success' is downgraded to 'warning' when the run is
--      demonstrably blind — either missing_required_step_count > 0, or zero
--      steps were recorded against a run that expected some. 'warning' and not
--      'failure' on purpose: the underlying round very likely succeeded. What
--      failed is our ability to prove it, and those are different claims.
--
-- 'failure' is never upgraded or downgraded. A caller reporting failure knows
-- something this function does not.
--
-- Conditional steps are why the test is missing_required_step_count and not
-- observed < expected: a healthy autosave records 7 of 8 because
-- db.save_partial_round_atomic is `conditional`, and treating that as blind
-- would make the check cry wolf on every correct trace.
--
-- R3 (SECURITY DEFINER). Prepared by an agent; only the owner applies.
-- Live fingerprint of the function this replaces, read 2026-09-01:
--   md5    5bfaba551f001460e12e6477c663d18e   (length 1074)
-- Verify with:
--   select md5(pg_get_functiondef(
--     'public.helm_debug_finalize_trace(uuid,text,jsonb)'::regprocedure));
-- and STOP if it differs from whatever you read at apply time versus what the
-- body below assumes, because CREATE OR REPLACE discards anything that moved.
--
-- Historical rows are deliberately NOT rewritten. The 1,097 mislabelled traces
-- stay as they are: they are the evidence for this change, and silently
-- relabelling recorded history is how a system stops being auditable.

CREATE OR REPLACE FUNCTION public.helm_debug_finalize_trace(
    p_trace_id uuid,
    p_status text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'helm_debug', 'helm_private'
AS $function$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
  v_observed integer;
  v_missing  integer;
  v_expected integer;
  v_status   text;
begin
  -- Truth about what was actually recorded, not what the caller believes.
  select count(*) into v_observed
  from helm_debug.trace_steps
  where trace_id = p_trace_id;

  select
    coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count, 0),
    coalesce(expected_step_count, 0)
  into v_missing, v_expected
  from helm_debug.trace_runs
  where trace_id = p_trace_id;

  -- A run is blind if it is missing a required step, or recorded nothing at
  -- all against a workflow that expected something.
  v_status := p_status;
  if p_status = 'success'
     and (coalesce(v_missing, 0) > 0 or (coalesce(v_expected, 0) > 0 and v_observed = 0)) then
    v_status := 'warning';
  end if;

  update helm_debug.trace_runs
  set status = v_status,
      finished_at = clock_timestamp(),
      duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
      observed_step_count = v_observed,
      missing_required_step_count = coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count),
      failure_step = coalesce(nullif(v_metadata ->> 'failure_step', ''), failure_step),
      failure_code = coalesce(nullif(v_metadata ->> 'failure_code', ''), failure_code),
      failure_summary = coalesce(nullif(v_metadata ->> 'failure_summary', ''), failure_summary),
      metadata = metadata
        || v_metadata
        || case
             when v_status is distinct from p_status
               then jsonb_build_object(
                 'status_downgraded_from', p_status,
                 'status_downgraded_reason', 'required steps missing or no steps recorded')
             else '{}'::jsonb
           end,
      updated_at = clock_timestamp()
  where trace_id = p_trace_id;
end;
$function$;

-- Grants restated, house convention: CREATE OR REPLACE preserves the ACL
-- 20260825200811 set (service_role only), but a migration that touches a
-- definer-rights function says so explicitly rather than relying on it.
-- (Worded this way on purpose: the semgrep search_path rule matches the
-- two-word phrase anywhere in the file, comments included, and only
-- excuses it when a SET search_path follows within the same span.)
REVOKE ALL ON FUNCTION public.helm_debug_finalize_trace(uuid, text, jsonb)
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.helm_debug_finalize_trace(uuid, text, jsonb)
TO service_role;
