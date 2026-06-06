-- PERF-2 (P2): freshness-ordered team selection for the standing-refresh cron.
--
-- WHY: the cron selected teams via `golf_teams ORDER BY created_at ASC LIMIT 50`
-- as a "stable proxy until a freshness column exists." At >50 teams this is a
-- correctness bug, not a perf nit: created_at never changes, so the SAME first-
-- created 50 teams are refreshed every run and every other team's standings go
-- permanently stale (~96% starvation at scale). The self-balancing "stalest 50"
-- design the cron's own docstring promises was never actually implemented.
--
-- WHAT: a helper that returns up to p_limit team ids ordered by each team's REAL
-- standing freshness — the OLDEST computed_at among its active players' standing
-- rows — with teams that have NO standing rows yet sorted FIRST (NULLS FIRST).
-- This makes the next run naturally pick the now-stalest teams, so the roster
-- catches up over a few runs without a state cursor (the intended design).
--
-- We compute freshness on the fly via MIN(computed_at) rather than adding a
-- denormalized per-team column, so there is nothing to keep in sync and no extra
-- write in the hot refresh path. golf_player_standing(computed_at) is indexed
-- (idx_standing_computed_at) and golf_team_members has a partial active index
-- (idx_golf_team_members_team_active).
--
-- SAFETY: CREATE OR REPLACE of a new STABLE SECURITY-DEFINER read-only function;
-- lock-free, Squawk-safe, no writes.

CREATE OR REPLACE FUNCTION "public"."select_stalest_teams"("p_limit" integer)
    RETURNS TABLE("team_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.id AS team_id
  FROM public.golf_teams t
  LEFT JOIN LATERAL (
    SELECT MIN(s.computed_at) AS oldest_standing
    FROM public.golf_team_members tm
    JOIN public.golf_player_standing s
      ON s.player_id = tm.player_id
    WHERE tm.team_id = t.id
      AND tm.status = 'active'::team_member_status
  ) f ON TRUE
  -- NULLS FIRST: teams with no standing rows (never refreshed) are stalest.
  ORDER BY f.oldest_standing ASC NULLS FIRST, t.created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 0), 0);
$$;

COMMENT ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) IS 'v3 PERF-2 (2026-06-06). Returns up to p_limit team ids ordered by real standing freshness (oldest active-player computed_at, NULLS FIRST so never-refreshed teams come first), tie-broken by created_at. Replaces the cron''s created_at-ASC proxy that starved every team past the first-created 50. STABLE read-only SECURITY DEFINER.';

GRANT ALL ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) TO "service_role";
