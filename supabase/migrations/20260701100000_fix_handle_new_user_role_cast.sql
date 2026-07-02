-- W0 P0 SECURITY: close two self-service privilege-escalation vectors.
--
-- (1) handle_new_user() previously did COALESCE((raw_user_meta_data->>'role')::user_role, 'player').
--     'admin' is a valid user_role enum value, so a raw Supabase signup API call with
--     user_metadata {"role":"admin"} self-minted an admin row. Restrict the cast to the two
--     self-service roles; everything else (incl. 'admin', junk, NULL) falls back to 'player'.
--     NOTE: the rest of this function body (baseball_players seed, ON CONFLICT, sport/name vars)
--     is preserved VERBATIM from the live prod definition — only the role assignment changed.
--
-- (2) The users_update_own RLS policy (USING auth.uid()=id, no WITH CHECK) let a logged-in user
--     PATCH their own users.role to 'admin' via the REST API. Add a BEFORE UPDATE OF role guard
--     that blocks self-escalation to any non-self-service role. Player<->coach self-changes stay
--     allowed (golf onboarding upserts role via the user-scoped client); service_role updates
--     (auth.uid() IS NULL) and real admin promotions are unaffected.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $function$
DECLARE
  user_role_value user_role;
  user_email TEXT;
  user_sport TEXT;
  meta_first_name TEXT;
  meta_last_name TEXT;
BEGIN
  user_email := NEW.email;

  -- W0 P0: self-service signup may only mint 'player' or 'coach'.
  user_role_value := CASE NEW.raw_user_meta_data->>'role'
    WHEN 'coach'  THEN 'coach'::user_role
    WHEN 'player' THEN 'player'::user_role
    ELSE 'player'::user_role
  END;

  user_sport := NEW.raw_user_meta_data->>'sport';
  meta_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  meta_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');

  INSERT INTO public.users (
    id,
    email,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_email,
    user_role_value,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  IF user_sport = 'baseball' AND user_role_value = 'player'::user_role THEN
    BEGIN
      INSERT INTO public.baseball_players (
        user_id,
        player_type,
        first_name,
        last_name,
        email,
        recruiting_activated,
        onboarding_completed,
        profile_completion_percent
      ) VALUES (
        NEW.id,
        'high_school'::public.baseball_player_type,
        NULLIF(meta_first_name, ''),
        NULLIF(meta_last_name, ''),
        user_email,
        false,
        false,
        0
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: baseball_players seed failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger fires as supabase_auth_admin; nobody should call it directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_users_role_self_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $function$
BEGIN
  IF auth.uid() = OLD.id
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NEW.role NOT IN ('player'::user_role, 'coach'::user_role) THEN
    RAISE EXCEPTION 'role cannot be self-escalated to %', NEW.role;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_users_role_self_change ON public.users;
CREATE TRIGGER trg_guard_users_role_self_change
  BEFORE UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_self_change();

REVOKE ALL ON FUNCTION public.guard_users_role_self_change() FROM PUBLIC, anon, authenticated;

-- ACL assertions — this migration FAILS if any revoke did not stick.
DO $$
DECLARE v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='handle_new_user';
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: handle_new_user executable by anon/authenticated';
  END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='guard_users_role_self_change';
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: guard_users_role_self_change executable by anon/authenticated';
  END IF;
END $$;
