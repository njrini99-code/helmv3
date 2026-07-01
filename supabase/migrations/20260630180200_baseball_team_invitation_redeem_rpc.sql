-- #395 — Atomic invitation redemption before roster join.

CREATE OR REPLACE FUNCTION public.try_redeem_baseball_team_invitation(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.baseball_team_invitations
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_invitation_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_baseball_team_invitation_redemption(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.baseball_team_invitations
  SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
  WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) TO authenticated, service_role;
