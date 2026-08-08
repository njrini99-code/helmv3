-- user_has_pending_join_request_to_coach_team: staff-strict, and no anon.
--
-- This predicate is live: `golf_players_select` reads
--   (user_id = auth.uid()) OR user_is_coach_of_golf_player(id)
--   OR user_has_pending_join_request_to_coach_team(id)
--   OR user_is_teammate_of_golf_player(id)
-- so it decides whether a coach may read a player's whole golf_players row.
--
-- It joined coaches to teams on ORGANIZATION:
--   JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
-- and it is SECURITY DEFINER, so it answers without RLS in the way. At
-- Shenandoah — one org, a men's and a women's team — that means any coach in
-- the org could read the full profile of any player with a pending request to
-- EITHER team, including the squad they are not staffed on. Every sibling
-- predicate in this policy was already moved to staff scope
-- (`user_is_coach_of_golf_player`, 20260612130000); this one was missed.
--
-- Exposure today is small: golf_team_join_requests has had no new row since
-- 2026-02-23, so the predicate is dormant in practice. It is still the wrong
-- rule, and it is one join-request away from mattering.
--
-- SECOND, AND THE REASON THIS IS NOT ONLY A TIGHTENING: the baseline migration
-- (20260527000000, line 20923) carries
--   GRANT ALL ON FUNCTION ... TO "anon";
-- Production does NOT — its ACL is authenticated + service_role only, so the
-- grant was revoked out of band and never committed. A database rebuilt from
-- these migrations therefore hands ANON execute on a SECURITY DEFINER function,
-- which is precisely the anti-pattern the project's own database rules call
-- out. Committing the revoke makes the migration set match what production
-- actually enforces.
--
-- Anyone holding the publishable key is `anon`.

CREATE OR REPLACE FUNCTION public.user_has_pending_join_request_to_coach_team(check_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_join_requests jr
    JOIN golf_team_coach_staff gtcs ON gtcs.team_id = jr.team_id
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE jr.player_id = check_player_id
      AND jr.status = 'pending'
      AND gc.user_id = auth.uid()
  )
$function$;

COMMENT ON FUNCTION public.user_has_pending_join_request_to_coach_team(uuid) IS
  'True when the current user is STAFFED (golf_team_coach_staff) on a team the player has a pending join request to. Was organization-scoped, which let a coach read players requesting to a sibling team they do not staff (fixed 2026-08-08).';

REVOKE EXECUTE ON FUNCTION public.user_has_pending_join_request_to_coach_team(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_pending_join_request_to_coach_team(uuid) TO authenticated;
