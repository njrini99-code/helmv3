-- bridge-users-sessions-audit Finding 5: get_active_sessions() gains an
-- optional p_user_id filter so a per-user session lookup (/admin/users/[id])
-- can filter in SQL BEFORE the internal LIMIT 500, instead of fetching the
-- platform-wide top-500-by-recency window and filtering client-side — which
-- silently shows "No active sessions" for any user whose session isn't in
-- that top 500.
--
-- Postgres treats `get_active_sessions()` and `get_active_sessions(uuid)` as
-- distinct overloads by argument type (default values don't collapse them),
-- so CREATE OR REPLACE alone would leave the old zero-arg signature in place
-- alongside the new one. Drop the old symbol explicitly first, then create
-- the single new one (callable with zero args via the DEFAULT NULL, which
-- keeps every existing platform-wide caller — /admin/auth's Sessions panel —
-- working unchanged).
DROP FUNCTION IF EXISTS public.get_active_sessions();

CREATE OR REPLACE FUNCTION public.get_active_sessions(p_user_id uuid DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'updated_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'session_id',      s.id,
      'user_id',         s.user_id,
      'email',           u.email,
      'created_at',      s.created_at,
      'updated_at',      s.updated_at,
      'last_sign_in_at', u.last_sign_in_at
    ) AS row_data
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
    WHERE p_user_id IS NULL OR s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 500
  ) rows;

  RETURN v_result;
END;
$$;

-- ── Safety rails (mirrors 20260701130000_bridge_rpcs_sessions_resolve.sql) ──
REVOKE ALL ON FUNCTION public.get_active_sessions(uuid) FROM PUBLIC, anon, authenticated;
-- authenticated EXECUTE required: invoked with the admin's user-scoped JWT
-- (internal is_super_admin() gate does the real filtering). anon: NOTHING.
GRANT EXECUTE ON FUNCTION public.get_active_sessions(uuid) TO authenticated;

DO $$
DECLARE
  v_sessions oid;
BEGIN
  SELECT p.oid INTO v_sessions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_active_sessions';

  IF v_sessions IS NULL THEN
    RAISE EXCEPTION 'get_active_sessions(uuid) did not get created';
  END IF;
  IF has_function_privilege('anon', v_sessions, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_active_sessions executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_sessions, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_active_sessions missing authenticated EXECUTE';
  END IF;
END $$;
