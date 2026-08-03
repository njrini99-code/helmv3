-- ============================================================================
-- #1257 — two policies made every team joinable by any authenticated user.
--
--   golf_teams_select_by_join_code   SELECT  USING (join_code IS NOT NULL)
--     Policies are OR'd, so this overrode the correctly-scoped sibling and made
--     every team row — including its join_code — world-readable to any signed-in
--     user. Measured: 13/13 teams, 13/13 codes, across 12 real organizations.
--
--   "Players can join teams"         INSERT  WITH CHECK (... AND EXISTS (
--                                      SELECT 1 FROM golf_teams gt
--                                       WHERE gt.id = team_id
--                                         AND gt.join_code IS NOT NULL))
--     The second clause asserts the team HAS a code. It never compares one, and
--     a WITH CHECK cannot see what the user typed, so it can never do what it
--     was written to do. Reproduced: inserting the demo player into a foreign
--     team with no code supplied succeeded.
--
-- The application layer did not compensate: joinGolfTeamImpl(playerId, teamId)
-- takes a team id and never sees a code at all, so RLS was the only backstop.
--
-- Fix: a join now has to PROVE the code, which a WITH CHECK structurally
-- cannot do — so the write moves into a SECURITY DEFINER RPC that resolves the
-- team from the code itself. The coach-side insert is unaffected: it is already
-- covered by golf_team_members_insert_coach USING is_golf_team_coach(team_id).
-- ============================================================================

-- 1. Stop leaking every team and every code -----------------------------------
DROP POLICY IF EXISTS golf_teams_select_by_join_code ON public.golf_teams;

-- The join page needs to resolve ONE team from a code before the visitor is a
-- member of it. A USING clause cannot express that — it can only widen
-- visibility — so it becomes a lookup function that returns the single match
-- and deliberately does NOT return join_code.
CREATE OR REPLACE FUNCTION public.golf_team_by_join_code(p_code text)
RETURNS TABLE (
  id uuid,
  name text,
  season text,
  organization_id uuid,
  organization_name text,
  organization_city text,
  organization_state text,
  organization_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.name, t.season, t.organization_id,
         o.name, o.location_city, o.location_state, o.logo_url
  FROM public.golf_teams t
  LEFT JOIN public.organizations o ON o.id = t.organization_id
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.golf_team_by_join_code(text) IS
  'Resolves exactly the team matching a supplied join code, for the /golf/join/[code] '
  'landing page. Returns no join_code. Replaces the USING (join_code IS NOT NULL) '
  'policy that exposed every team and every code (#1257).';

REVOKE EXECUTE ON FUNCTION public.golf_team_by_join_code(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.golf_team_by_join_code(text) TO authenticated, service_role;

-- 2. Make the join itself require the code ------------------------------------
DROP POLICY IF EXISTS "Players can join teams" ON public.golf_team_members;

CREATE OR REPLACE FUNCTION public.golf_join_team_with_code(p_code text)
RETURNS TABLE (team_id uuid, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_player_id uuid;
  v_team      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT gp.id INTO v_player_id
  FROM public.golf_players gp
  WHERE gp.user_id = v_uid
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'no golf player profile for this account' USING ERRCODE = '42501';
  END IF;

  -- The code is resolved HERE, server-side, from the caller's input. This is
  -- the check the old WITH CHECK clause could not perform.
  SELECT t.id, t.name INTO v_team
  FROM public.golf_teams t
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'invalid join code' USING ERRCODE = '22023';
  END IF;

  -- Golf players belong to one team at a time; preserve that rule.
  IF EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.player_id = v_player_id
      AND m.status = 'active'
      AND m.team_id <> v_team.id
  ) THEN
    RAISE EXCEPTION 'already on another team' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.golf_team_members (player_id, team_id, status)
  VALUES (v_player_id, v_team.id, 'active')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_team.id, v_team.name;
END;
$$;

COMMENT ON FUNCTION public.golf_join_team_with_code(text) IS
  'Joins the caller''s golf player to the team matching the supplied code. The '
  'code is verified server-side, which a WITH CHECK clause cannot do — that is '
  'why the self-join INSERT policy was removed rather than rewritten (#1257).';

REVOKE EXECUTE ON FUNCTION public.golf_join_team_with_code(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.golf_join_team_with_code(text) TO authenticated;
