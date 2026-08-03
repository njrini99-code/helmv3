-- ============================================================================
-- #1258 — golf_coaches SELECT is USING (true): every authenticated user can
-- read every coach's name, email and phone.
--
-- Measured before this change (role impersonation, demo player):
--   golf_players   7 of 61 visible    <- correctly scoped
--   golf_rounds   94 of 299 visible   <- correctly scoped
--   golf_coaches  15 of 15 visible across 12 organizations,
--                 including 10 emails and 3 phone numbers.
--
-- baseball_coaches already has the correct shape:
--   USING (auth.uid() = user_id OR shares_my_baseball_organization(organization_id))
-- This gives golf the same, via a matching helper.
--
-- Note on the player path: `get_user_golf_organization_id()` resolves the org
-- by reading golf_coaches, so it returns NULL for a player. Using it alone
-- would hide a player's own coaches and break author names on announcements,
-- messaging and the roster. The helper below therefore covers both roles:
-- a coach's own organization, and the organizations of the teams a player is
-- actually on.
--
-- Verified as a plain SELECT against production before writing this:
--   demo player -> 2 coaches, 1 org   (was 15 / 12)
--   demo coach  -> 2 coaches, 1 org   (was 15 / 12)
-- Both keep exactly their own organization's staff.
--
-- 178 of the 180 `from('golf_coaches')` call sites already filter by
-- `user_id = <caller>` or a specific id/in-list. The two that do not are
-- `lib/admin/data/users.ts:258` (createAdminClient, service role, behind
-- requireSuperAdmin) and `actions/onboarding.ts:164` (an INSERT, governed by
-- golf_coaches_insert_own). So nothing depends on the current breadth.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shares_my_golf_organization(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org_id IS NOT NULL AND (
    -- caller is a coach in that organization
    EXISTS (
      SELECT 1 FROM public.golf_coaches c
      WHERE c.user_id = (SELECT auth.uid())
        AND c.organization_id = p_org_id
    )
    OR
    -- caller is a player on a team belonging to that organization
    EXISTS (
      SELECT 1
      FROM public.golf_team_members m
      JOIN public.golf_players p ON p.id = m.player_id
      JOIN public.golf_teams   t ON t.id = m.team_id
      WHERE p.user_id = (SELECT auth.uid())
        AND t.organization_id = p_org_id
    )
  );
$$;

COMMENT ON FUNCTION public.shares_my_golf_organization(uuid) IS
  'True when the caller belongs to the given organization, as a coach or as a '
  'player on one of its teams. Mirrors shares_my_baseball_organization. Used by '
  'golf_coaches RLS so a directory read cannot cross tenants (#1258).';

REVOKE EXECUTE ON FUNCTION public.shares_my_golf_organization(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shares_my_golf_organization(uuid) TO authenticated, service_role;

-- Replace the unrestricted policy.
DROP POLICY IF EXISTS golf_coaches_select_all ON public.golf_coaches;

CREATE POLICY golf_coaches_select ON public.golf_coaches
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.shares_my_golf_organization(organization_id)
  );
