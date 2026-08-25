-- Round recap persist was failing for every real user with 42501
-- "permission denied for schema helm_private" (Sentry JAVASCRIPT-NEXTJS-PT,
-- 9 users, escalating).
--
-- Root cause: public.save_round_ai_recap (20260825041628) is SECURITY INVOKER,
-- so the schema hop into helm_private happens with the CALLER's privileges —
-- and 20260825052141 explicitly revoked ALL on schema helm_private from
-- authenticated. The wrapper therefore cannot resolve
-- helm_private.save_round_ai_recap for any authenticated caller.
--
-- Fix: make the wrapper SECURITY DEFINER (owner postgres) so the hop happens
-- with definer privileges. This grants no new capability:
--   * caller identity still flows through auth.uid(), which reads the request
--     JWT claims GUC and is unaffected by SECURITY DEFINER;
--   * the private implementation independently rechecks player/coach
--     ownership and recap constraints before writing;
--   * anon and PUBLIC still have no EXECUTE on the wrapper;
--   * helm_private stays fully locked (no schema grants added).

CREATE OR REPLACE FUNCTION public.save_round_ai_recap(
    p_round_id uuid,
    p_recap text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT helm_private.save_round_ai_recap(p_round_id, p_recap, auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.save_round_ai_recap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_round_ai_recap(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.save_round_ai_recap(uuid, text) IS
  'Definer-boundary wrapper for helm_private.save_round_ai_recap. Must stay '
  'SECURITY DEFINER: helm_private grants no USAGE to authenticated, so an '
  'invoker wrapper cannot reach the implementation (see 20260825233000).';
