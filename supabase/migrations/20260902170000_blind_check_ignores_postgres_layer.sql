-- The blind-trace check must count only application-layer steps, not
-- Postgres-layer ones the RPC writes about itself.
--
-- `db-migration-reviewer` review of `20260902160000` (2026-09-02, verdict
-- HOLDS) found a real product-of-two-migrations defect: once
-- `helm_private.trace_checkpoint`'s unconditional fail-open UPSERT into
-- `helm_debug.trace_steps` ships, every successful `submit_round_atomic` /
-- `save_partial_round_atomic` call gets 6-7 Postgres-written rows regardless
-- of whether the JS application layer recorded anything. `20260901140000`'s
-- `helm_debug_finalize_trace` computes `v_observed` as a plain `count(*)`
-- over `helm_debug.trace_steps` for the trace and only downgrades a
-- caller-supplied 'success' to 'warning' when `v_expected > 0 and
-- v_observed = 0`. With Postgres-layer rows always present, `v_observed` is
-- never 0 for those two workflows again -- so a trace where the JS layer
-- recorded NOTHING (the exact shape of the 1,097-trace production incident
-- `20260901140000` closed) would finalize as 'success' once more. Reproduced
-- by the reviewer in a rolled-back local transaction.
--
-- WHAT CHANGES. `helm_debug_finalize_trace` now computes the blind check
-- from a SECOND, narrower count -- rows whose `layer` is not 'postgres' --
-- while `observed_step_count` on the run keeps counting every row,
-- unchanged: the Bridge's trace views show both layers and should keep
-- doing so. Only the blindness test moves. `missing_required_step_count`
-- (the other half of the existing downgrade condition) is untouched; it was
-- always JS-computed and is not affected by this defect.
--
-- Nothing else about the function changes: same signature, same SECURITY
-- DEFINER setting, same search_path, same grants, same treatment of a
-- caller-supplied 'failure' (never upgraded or downgraded).
--
-- R3 (security-definer). Prepared by an agent; only the owner applies.
-- Fingerprint of the function this replaces, read against the LOCAL stack
-- 2026-09-02 immediately after applying 20260901140000 (production's own
-- post-apply fingerprint for that same function, per
-- supabase/migrations/HELD.md's row for 20260901140000, is
-- 338d5f344491586a6ab416ed0798548a / length 2021 -- the two differ because
-- pg_get_functiondef's formatting is not byte-identical across the local
-- and production Postgres builds; both describe the SAME function body):
--   md5    e017e6980ce7045f46b5e83c73580bdc   (length 2229)
-- Verify with:
--   select md5(pg_get_functiondef(
--     'public.helm_debug_finalize_trace(uuid,text,jsonb)'::regprocedure));
-- and STOP if it differs from whatever you read at apply time versus what
-- the body below assumes, because CREATE OR REPLACE discards anything that
-- moved -- re-derive the fingerprint against PRODUCTION specifically before
-- applying there, not the local value recorded above.
--
-- Historical rows are deliberately NOT rewritten, same as 20260901140000.

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
  v_observed_app integer;
  v_missing  integer;
  v_expected integer;
  v_status   text;
begin
  -- Truth about what was actually recorded, not what the caller believes.
  -- observed_step_count (below) counts every row, both layers -- the Bridge
  -- shows both. The blind check below counts a SEPARATE, narrower total:
  -- application-layer rows only, so a Postgres-layer checkpoint the RPC
  -- writes about its own execution can never mask a JS layer that recorded
  -- nothing.
  select count(*) into v_observed
  from helm_debug.trace_steps
  where trace_id = p_trace_id;

  select count(*) into v_observed_app
  from helm_debug.trace_steps
  where trace_id = p_trace_id
    and layer is distinct from 'postgres';

  select
    coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count, 0),
    coalesce(expected_step_count, 0)
  into v_missing, v_expected
  from helm_debug.trace_runs
  where trace_id = p_trace_id;

  -- A run is blind if it is missing a required step, or the application
  -- layer recorded nothing at all against a workflow that expected
  -- something -- Postgres-layer rows do not count toward "recorded
  -- something" here, because they exist whether or not the JS layer ever
  -- ran.
  v_status := p_status;
  if p_status = 'success'
     and (coalesce(v_missing, 0) > 0 or (coalesce(v_expected, 0) > 0 and v_observed_app = 0)) then
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
                 'status_downgraded_reason', 'required steps missing or no application-layer steps recorded')
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
