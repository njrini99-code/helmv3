-- W3: Helm Bridge RPCs.
-- get_active_sessions: auth schema is not PostgREST-exposed; the sanctioned
-- pattern (same as get_admin_errors_rollup) is a SECURITY DEFINER function
-- in public with an internal admin gate on auth.uid() via is_super_admin().
CREATE OR REPLACE FUNCTION public.get_active_sessions() RETURNS jsonb
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
    ORDER BY s.updated_at DESC
    LIMIT 500
  ) rows;

  RETURN v_result;
END;
$$;

-- resolve_admin_event: the ONE writable admin mutation exposed via RPC.
-- Marks events resolved by the invoking super admin; append-only otherwise.
CREATE OR REPLACE FUNCTION public.resolve_admin_event(p_event_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_events
  SET resolved = true,
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = ANY(p_event_ids)
    AND resolved = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Safety rails ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_active_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_admin_event(uuid[]) FROM PUBLIC, anon, authenticated;
-- authenticated EXECUTE required: invoked with Nick's user-scoped JWT (internal
-- is_super_admin() gate does the real filtering). anon: NOTHING.
GRANT EXECUTE ON FUNCTION public.get_active_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_admin_event(uuid[]) TO authenticated;

DO $$
DECLARE
  v_sessions oid; v_resolve oid;
BEGIN
  SELECT p.oid INTO v_sessions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_active_sessions';
  SELECT p.oid INTO v_resolve FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='resolve_admin_event';

  IF has_function_privilege('anon', v_sessions, 'EXECUTE')
     OR has_function_privilege('anon', v_resolve, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: bridge RPC executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_sessions, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_resolve, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: bridge RPC missing authenticated EXECUTE';
  END IF;
END $$;
