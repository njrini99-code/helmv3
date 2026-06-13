-- Team toggle (men's/women's) — data-model + management-authz hardening.
--
-- Context: a "program" (organizations row) can run a men's AND a women's
-- golf_teams row. PR #268 adds addSecondTeam (is_primary=false on the 2nd team).
-- Two problems this migration fixes:
--   1. No DB guarantee against two same-gender teams in one program.
--   2. is_golf_team_primary_coach gates team management (staff insert + CoachHelm
--      settings). A program head is is_primary=TRUE on only ONE of their teams,
--      so they are LOCKED OUT of managing their own second (e.g. women's) team.
--
-- Ordering: this runs AFTER 20260610160000_program_onboarding_backfill.sql, which
-- guarantees every org-having coach has a head_coach staff row, so the head-coach
-- predicate below resolves for all existing coaches.

-- ── 1. One program = at most one men's + one women's team ──────────────────────
-- gender is NOT NULL DEFAULT 'mens' (migration 20260607160000); the partial
-- predicate is defensive in case a nullable variant ever appears.
CREATE UNIQUE INDEX IF NOT EXISTS golf_teams_org_gender_uidx
  ON public.golf_teams (organization_id, gender)
  WHERE gender IS NOT NULL;

COMMENT ON INDEX public.golf_teams_org_gender_uidx IS
  'Enforces one program (organization_id) has at most one team per gender. addSecondTeam catches the 23505 violation.';

-- ── 2. Head-coach management predicate (role-based, is_primary-independent) ─────
-- A head coach manages every team they head, even when is_primary=FALSE on it.
-- is_primary stays reserved for default-active-team selection only.
CREATE OR REPLACE FUNCTION public.is_golf_team_head_coach("team_uuid" uuid)
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.role = 'head_coach'
  );
END;
$$;

COMMENT ON FUNCTION public.is_golf_team_head_coach(uuid) IS
  'True if the current user is a head_coach (any is_primary) on the specified team. Use for team-management policies so a program head can manage BOTH of their teams. SECURITY DEFINER avoids RLS recursion.';

-- Least privilege: authenticated + service_role only (NOT anon). Supabase grants
-- EXECUTE to anon directly by default on new functions, so REVOKE FROM PUBLIC is
-- insufficient — revoke from anon explicitly.
REVOKE EXECUTE ON FUNCTION public.is_golf_team_head_coach(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_golf_team_head_coach(uuid) TO authenticated, service_role;

-- ── 3. Repoint the two management policies: primary → head_coach ────────────────
-- CoachHelm team settings: any head coach of the team (not only the primary) may
-- write. Assistants (role <> 'head_coach') remain locked out — preserves the
-- 2026-05-23 "no assistant can disable CoachHelm team-wide" guarantee.
DROP POLICY IF EXISTS "team_chs_settings_write_team" ON public.golf_team_coachhelm_settings;
CREATE POLICY "team_chs_settings_write_team"
  ON public.golf_team_coachhelm_settings
  TO authenticated
  USING (public.is_golf_team_head_coach(team_id))
  WITH CHECK (public.is_golf_team_head_coach(team_id));

COMMENT ON POLICY "team_chs_settings_write_team" ON public.golf_team_coachhelm_settings IS
  'Only a head coach of the team may write team-level CoachHelm settings. Head-coach (not primary) so a program head can manage both teams; assistants stay locked out.';

-- Self-bootstrap onto a team you head (still self-only via the coach_id = auth.uid() clause).
DROP POLICY IF EXISTS "golf_team_coach_staff_insert" ON public.golf_team_coach_staff;
CREATE POLICY "golf_team_coach_staff_insert"
  ON public.golf_team_coach_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_golf_team_head_coach(team_id)
    AND EXISTS (
      SELECT 1 FROM public.golf_coaches gc
      WHERE gc.id = golf_team_coach_staff.coach_id
        AND gc.user_id = auth.uid()
    )
  );
