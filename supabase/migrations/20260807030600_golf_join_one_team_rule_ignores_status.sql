-- The database's one-team-per-player guard counted only ACTIVE memberships,
-- while the application's guard (validateGolfPlayerCanJoinTeam) counts every
-- membership row. Two guards for one rule, disagreeing.
--
-- A player a coach has marked Inactive — a normal one-click action for injury,
-- academic ineligibility or a semester off — keeps a live session and could call
-- this RPC with another program's join code. The EXISTS skipped their inactive
-- row, the insert went through, and they landed ACTIVE on a second roster while
-- still sitting on the first.
--
-- Removal is a hard DELETE in this product, not a status flip, so 'inactive'
-- genuinely means "still on this roster, not currently participating" — it is
-- not a soft delete, and it should not be a licence to join elsewhere.
--
-- Verified on production 2026-08-07 in a rolled-back transaction:
--   PRE   inactive player joins a second team ... ALLOWED, ended on 2 rosters
--   POST  same attempt ....................... BLOCKED 23505
--   POST  control: re-join their OWN team ..... passes (idempotent join, which
--         the invite flow depends on — see the alreadyOnThisTeam fix)
--   POST  control: player on no team joins .... passes
--
-- Latent rather than live today: all 69 golf_team_members rows are 'active', so
-- no current player could have used it.

CREATE OR REPLACE FUNCTION public.golf_join_team_with_code(p_code text)
 RETURNS TABLE(team_id uuid, team_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_player_id uuid;
  v_team      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT gp.id INTO v_player_id
  FROM public.golf_players gp WHERE gp.user_id = v_uid LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'no golf player profile for this account' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.name INTO v_team
  FROM public.golf_teams t
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'invalid join code' USING ERRCODE = '22023';
  END IF;

  -- No status filter: ANY membership of a DIFFERENT team blocks the join.
  IF EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.player_id = v_player_id AND m.team_id <> v_team.id
  ) THEN
    RAISE EXCEPTION 'already on another team' USING ERRCODE = '23505';
  END IF;

  -- Re-joining the team you are already on stays a no-op success, which the
  -- invite flow relies on: it runs the join twice by design.
  INSERT INTO public.golf_team_members (player_id, team_id, status)
  VALUES (v_player_id, v_team.id, 'active')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_team.id, v_team.name;
END;
$function$;
