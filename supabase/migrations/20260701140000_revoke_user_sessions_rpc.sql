-- W7: sign-out-everywhere for a compromised account. Deleting auth.sessions
-- rows invalidates refresh tokens; access tokens expire within the hour.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid) RETURNS integer
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (auth.uid(), 'admin.revoke_sessions', 'auth.sessions', p_user_id,
          jsonb_build_object('revoked_count', v_count, 'target_user', p_user_id));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO authenticated;

DO $$
DECLARE v_fn oid;
BEGIN
  SELECT p.oid INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='revoke_user_sessions';
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: revoke_user_sessions executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: revoke_user_sessions missing authenticated EXECUTE';
  END IF;
END $$;
