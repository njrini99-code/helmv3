-- #442 — Enforce camp capacity atomically on registration.
--
-- Player camp registration was a client-side insert gated only by a UI "isFull"
-- check; the server action never read capacity, so concurrent sign-ups could
-- overbook a camp. This function locks the camp row (serializing concurrent
-- registrations for that camp) and checks the active (non-cancelled)
-- registration count against capacity inside a single transaction. The calling
-- player is resolved from auth.uid() — a player can never register anyone else.
--
-- Returns one of: 'registered', 'full', 'already_registered', 'not_found',
-- 'unauthorized'.

CREATE OR REPLACE FUNCTION public.baseball_register_for_camp(p_camp_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player_id uuid;
  v_capacity int;
  v_active int;
  v_existing_id uuid;
  v_existing_status text;
BEGIN
  -- Resolve the caller's player row from their authenticated user id (no IDOR).
  SELECT id INTO v_player_id
  FROM public.baseball_players
  WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN 'unauthorized';
  END IF;

  -- Lock the camp row so concurrent registrations serialize on its capacity.
  SELECT capacity INTO v_capacity
  FROM public.baseball_camps
  WHERE id = p_camp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Existing (possibly cancelled) registration for this player + camp?
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM public.baseball_camp_registrations
  WHERE camp_id = p_camp_id AND player_id = v_player_id;

  IF v_existing_id IS NOT NULL AND v_existing_status IS DISTINCT FROM 'cancelled' THEN
    RETURN 'already_registered';
  END IF;

  -- Count active (non-cancelled) registrations while holding the camp lock.
  SELECT count(*) INTO v_active
  FROM public.baseball_camp_registrations
  WHERE camp_id = p_camp_id
    AND status IS DISTINCT FROM 'cancelled';

  IF v_capacity IS NOT NULL AND v_active >= v_capacity THEN
    RETURN 'full';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.baseball_camp_registrations
    SET status = 'registered'
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.baseball_camp_registrations (camp_id, player_id, status, created_at)
    VALUES (p_camp_id, v_player_id, 'registered', now());
  END IF;

  RETURN 'registered';
END;
$$;

-- Revoke PUBLIC *and* anon explicitly: Supabase default privileges auto-grant
-- EXECUTE on new functions to anon, and REVOKE ... FROM PUBLIC does not remove
-- that explicit anon grant. Registration must be authenticated-only.
REVOKE ALL ON FUNCTION public.baseball_register_for_camp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baseball_register_for_camp(uuid) TO authenticated, service_role;
