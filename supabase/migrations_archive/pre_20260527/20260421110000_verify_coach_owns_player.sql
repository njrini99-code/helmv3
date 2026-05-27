-- Team C — Task C1 — verify_coach_owns_player
-- Multi-team-safe coach ownership check: returns true when the given user
-- staffs any team that the given player is an active member of.

CREATE OR REPLACE FUNCTION public.verify_coach_owns_player(p_player_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_members gtm
    JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtm.player_id = p_player_id
      AND gtm.status = 'active'::team_member_status
      AND gc.user_id = p_user_id
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.verify_coach_owns_player(UUID, UUID) TO authenticated;

-- Team-scoped variant for actions that take teamId directly.
CREATE OR REPLACE FUNCTION public.verify_coach_owns_team(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff gtcs
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = p_team_id
      AND gc.user_id = p_user_id
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.verify_coach_owns_team(UUID, UUID) TO authenticated;
