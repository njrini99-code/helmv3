-- ============================================================================
-- Revoke anon/PUBLIC EXECUTE on every SECURITY DEFINER function in public
-- that anon can execute (45 at time of writing: golf round write paths,
-- RLS/identity helpers, CRM analytics, trigger/sync functions, heartbeat).
--
-- WHY: third pass at the documented anon-grant drift — earlier passes
-- (20260702100300_baseball_anon_grant_drift_revoke) covered baseball only;
-- golf/CRM/shared functions kept their implicit PUBLIC grant, so anyone with
-- the public URL + anon key could POST /rest/v1/rpc/submit_round_atomic etc.
--
-- Verified before applying (2026-07-03): no unauthenticated surface calls any
-- of these — all call sites are authed server actions, authed dashboards
-- (use-presence heartbeat mounts post-auth and fails silent), or
-- service_role crons. SECURITY DEFINER public-directory views evaluate their
-- function calls as the view owner, so anon reads of those are unaffected.
-- Policies with roles={public} that reference the helpers only error for
-- anon table probes that already returned nothing.
--
-- Pattern per repo policy: REVOKE ALL FROM PUBLIC + anon, explicit GRANT to
-- authenticated + service_role. Dynamic so it self-scopes to whatever has
-- drifted by the time it runs, and is a no-op when clean.
--
-- APPLIED TO PROD 2026-07-03 via MCP (revoke_anon_secdef_rpc_drift_full)
-- before this file merged; kept in-repo as source of truth. Post-apply:
-- anon-executable SECURITY DEFINER count 45 -> 0; authenticated smoke green
-- (REST reads on baseball/golf/lift tables + rpc/heartbeat 204; anon
-- rpc/is_admin now 401/42501).
-- ============================================================================
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'hardened % SECURITY DEFINER functions', n;
END $$;
