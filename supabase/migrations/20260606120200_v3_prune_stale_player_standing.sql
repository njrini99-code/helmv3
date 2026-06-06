-- SC1 (P2): orphan / stale standing-row cleanup, scoped per refresh run.
--
-- WHY: refresh_player_standing{,_round_metrics,_shot_metrics} all UPSERT
-- (INSERT ... ON CONFLICT DO UPDATE) and set computed_at = now() on every row a
-- player still qualifies for. When a player STOPS qualifying for a metric — drops
-- below MIN_ROUNDS / leaves a team / a metric is removed from the bindings — the
-- old row is never touched again, so a stale value lingers forever and a coach
-- sees a standing that no longer reflects reality. There is no DELETE path today.
--
-- WHAT: a computed_at-staleness sweep, scoped to the players on the teams a run
-- just refreshed. The cron captures a cutoff timestamp BEFORE invoking the
-- refresh RPCs, then calls this with that cutoff: any standing row for a player
-- on one of those teams whose computed_at is OLDER than the cutoff was not
-- re-written this run → the player no longer qualifies → delete it.
--
-- WHY THIS IS SAFE (non-destructive on transient failure):
--   * It is scoped to p_team_ids — never a global wipe.
--   * It only removes rows the run DELIBERATELY did not refresh. If a refresh RPC
--     errored before writing, computed_at stays old, but the cron isolates each
--     RPC's failure (the round/shot RPCs are non-blocking) and the operator can
--     skip the prune by passing a cutoff that no row predates; the cron only
--     prunes after the cache-metric RPC succeeded.
--   * A player on >1 active team is keyed only by p_team_ids membership, so a row
--     refreshed via another team in the SAME chunk keeps its fresh computed_at.
--
-- Returns the number of orphan rows removed so the cron can surface it.
--
-- SAFETY: CREATE OR REPLACE of a new SECURITY-DEFINER function; lock-free,
-- Squawk-safe. DELETE is row-scoped (no table rewrite).

CREATE OR REPLACE FUNCTION "public"."prune_stale_player_standing"(
  "p_team_ids" "uuid"[],
  "p_cutoff" timestamp with time zone
) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted bigint;
BEGIN
  IF p_team_ids IS NULL
     OR array_length(p_team_ids, 1) IS NULL
     OR p_cutoff IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.golf_player_standing s
  WHERE s.computed_at < p_cutoff
    AND EXISTS (
      SELECT 1
      FROM public.golf_team_members tm
      WHERE tm.player_id = s.player_id
        AND tm.status = 'active'::team_member_status
        AND tm.team_id = ANY (p_team_ids)
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION "public"."prune_stale_player_standing"("uuid"[], timestamp with time zone) IS 'v3 SC1 (2026-06-06). Scoped orphan/stale cleanup for golf_player_standing. Deletes rows for players on p_team_ids whose computed_at is older than p_cutoff — i.e. rows the refresh run just completed did NOT re-write because the player no longer qualifies. The cron captures p_cutoff before invoking the refresh RPCs. Returns rows removed. Trusted SECURITY DEFINER; row-scoped DELETE (never a global wipe).';

-- Service-role ONLY. This is a destructive (DELETE) SECURITY DEFINER function
-- invoked solely by the standing cron via createAdminClient(). Granting it to
-- anon/authenticated would reintroduce the SEC-RLS-1 class fixed in
-- 20260606090000 — an unauthenticated caller could DELETE standing rows through
-- PostgREST. Lock to service_role.
REVOKE ALL ON FUNCTION "public"."prune_stale_player_standing"("uuid"[], timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."prune_stale_player_standing"("uuid"[], timestamp with time zone) TO "service_role";
