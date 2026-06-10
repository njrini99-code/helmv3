-- Stats accuracy audit 2026-06-09: prune_stale_player_standing only deleted
-- stale rows for players who are STILL active members of the refreshed teams.
-- A player removed from every roster never matches the EXISTS, so their
-- standing rows persist forever with frozen cohort values (live example at
-- audit time: 14 rows frozen at 2026-06-07 for a player with zero active
-- memberships). Add a second, team-independent clause: delete rows older than
-- the cutoff whose player has NO active membership anywhere.
--
-- Still failure-isolated: the cron calls this only after the refresh RPCs
-- succeeded, and the cutoff guarantees rows written by the current run are
-- never touched.
--
-- APPLY: via MCP apply_migration (apply-time version stamp, NOT this filename).
-- ROLLBACK: re-CREATE from 20260606120200 (drops the orphan clause).

CREATE OR REPLACE FUNCTION public.prune_stale_player_standing(p_team_ids uuid[], p_cutoff timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint;
  v_orphans bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL OR p_cutoff IS NULL THEN
    RETURN 0;
  END IF;

  -- Stale rows for players still rostered on the just-refreshed teams.
  DELETE FROM public.golf_player_standing s
  WHERE s.computed_at < p_cutoff
    AND EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = s.player_id
        AND tm.status = 'active'::team_member_status
        AND tm.team_id = ANY (p_team_ids)
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Global orphans: players with no active membership anywhere are reachable
  -- by no team's refresh, so no run would ever prune them via the clause
  -- above. Team-independent by design.
  DELETE FROM public.golf_player_standing s
  WHERE s.computed_at < p_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = s.player_id
        AND tm.status = 'active'::team_member_status
    );
  GET DIAGNOSTICS v_orphans = ROW_COUNT;

  RETURN v_deleted + v_orphans;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.prune_stale_player_standing(uuid[], timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_stale_player_standing(uuid[], timestamp with time zone) TO service_role;
