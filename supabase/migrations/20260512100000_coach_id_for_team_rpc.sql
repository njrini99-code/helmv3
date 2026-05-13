-- Closes the 2026-05-12 review finding on coachhelm-data.ts:
--   verifyCoachAccess called the canonical verifyTeamAccess (which authorizes
--   via golf_team_coach_staff), then re-queried golf_coaches by user_id alone
--   to attribute writes. For users with multiple coach profiles (multi-org),
--   that lookup could pick an arbitrary coach row that does NOT staff the
--   verified team.
--
-- This RPC returns the SPECIFIC coach.id matched to (team_id, user_id) via
-- golf_team_coach_staff. The canonical verifyTeamAccess helper now uses it
-- and exposes the resolved coachId so callers don't need a second lookup.

BEGIN;

CREATE OR REPLACE FUNCTION public.coach_id_for_team(p_team_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT gc.id
  FROM public.golf_team_coach_staff gtcs
  JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
  WHERE gtcs.team_id = p_team_id
    AND gc.user_id = p_user_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.coach_id_for_team(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.coach_id_for_team(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_id_for_team(UUID, UUID) TO authenticated, service_role;

COMMIT;
