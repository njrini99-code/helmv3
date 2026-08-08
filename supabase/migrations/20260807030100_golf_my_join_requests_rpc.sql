-- A player must be able to see the NAME of a team they have asked to join.
--
-- getPlayerJoinRequests embedded `team:golf_teams(...)`, which is RLS-blind for
-- exactly this population: a PENDING requester is by definition not yet a
-- member, golf_teams_select requires membership, so the embed resolved to NULL
-- while an `as unknown as` cast asserted it was non-null. The UI renders
-- request.team.name, so the first successfully filed request would have taken
-- down the whole Settings page.
--
-- Rather than widen golf_teams SELECT (which would expose every team to every
-- authenticated user), this returns the caller's OWN pending requests with the
-- team name attached. The scoping lives inside the function: it joins on
-- golf_players.user_id = auth.uid(), so it can only ever answer for the caller.

CREATE OR REPLACE FUNCTION public.golf_my_join_requests()
RETURNS TABLE (
  id uuid,
  status text,
  message text,
  created_at timestamptz,
  team_id uuid,
  team_name text,
  organization_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT r.id,
         r.status,
         r.message,
         r.created_at,
         r.team_id,
         t.name,
         o.name
  FROM   public.golf_team_join_requests r
  JOIN   public.golf_players p ON p.id = r.player_id
  LEFT   JOIN public.golf_teams t ON t.id = r.team_id
  LEFT   JOIN public.organizations o ON o.id = t.organization_id
  WHERE  p.user_id = auth.uid()
    AND  r.status = 'pending'
  ORDER  BY r.created_at DESC;
$fn$;

COMMENT ON FUNCTION public.golf_my_join_requests() IS
  'The CALLER''s own pending golf join requests, with team and organization '
  'names resolved. Runs with definer rights because a pending requester is not yet a '
  'member and so cannot read golf_teams under RLS. Scoped internally by '
  'golf_players.user_id = auth.uid() — it cannot answer for anyone else.';

REVOKE EXECUTE ON FUNCTION public.golf_my_join_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golf_my_join_requests() FROM anon;
GRANT  EXECUTE ON FUNCTION public.golf_my_join_requests() TO authenticated;
