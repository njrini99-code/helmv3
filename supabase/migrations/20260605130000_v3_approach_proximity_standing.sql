-- v3 approach-proximity-by-band standings (foundation for "smarter by distance").
--
-- The cache only has one overall approach_proximity_average, so the 3 v3 band
-- metrics (approach_proximity_50_125ft / 125_175ft / 175_plus_ft) were deferred.
-- This companion RPC computes per-player ON-GREEN proximity (feet) by approach
-- distance band straight from golf_shots, with the same team_avg/team_pct +
-- app-wide cohort (level_avg/level_pct) + PGA structure as refresh_player_standing.
-- Direction is lower_better (closer = better). Mirrors the round-metrics RPC
-- shape so the cron concatenates results.
--
-- Proximity is averaged ONLY over green-finding approaches (a proximity over a
-- missed green is meaningless), gated at MIN_GREENS per band. Off-green misses
-- are excluded, so distance_unit_after is on-green feet (the rare legacy yards
-- row is ×3'd). Static SQL (no dynamic EXECUTE) — band bounds are function-local.
--
-- The 50-125 yd wedge band is the #1 college->Tour approach gap; surfacing a
-- real proximity standing lets the StandingBar + counterfactual show it.

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[])
    RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- (metric_id, band_lo_yards, band_hi_yards) — hi is exclusive; last band open-ended.
  v_bands text[][] := ARRAY[
    ['approach_proximity_50_125ft',   '50',  '125'],
    ['approach_proximity_125_175ft',  '125', '175'],
    ['approach_proximity_175_plus_ft','175', '100000']
  ];
  v_n int := array_length(v_bands, 1);
  v_i int;
  v_metric text;
  v_lo numeric;
  v_hi numeric;
  v_rows bigint;
  v_min_greens constant int := 3;     -- min on-green shots in the band, per player
  v_min_cohort_n constant int := 8;   -- min population before a cohort baseline is trusted
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bands[v_i][1];
    v_lo := v_bands[v_i][2]::numeric;
    v_hi := v_bands[v_i][3]::numeric;

    WITH base AS (
      -- One row per active player: their avg ON-GREEN proximity (feet) in this band.
      SELECT
        p.id AS player_id,
        AVG(
          CASE WHEN lower(coalesce(s.distance_unit_after, 'feet')) = 'yards'
               THEN s.distance_to_hole_after * 3.0
               ELSE s.distance_to_hole_after END
        ) AS player_value,
        COUNT(*) AS greens
      FROM public.golf_players p
      JOIN public.golf_team_members tmx
        ON tmx.player_id = p.id AND tmx.status = 'active'::team_member_status
      JOIN public.golf_rounds r
        ON r.player_id = p.id AND r.status = 'completed'
      JOIN public.golf_shots s
        ON s.round_id = r.id
       AND s.shot_type = 'approach'
       AND s.distance_to_hole_before IS NOT NULL
       AND s.distance_to_hole_after IS NOT NULL
       AND (lower(coalesce(s.result, '')) IN ('green', 'hole', 'gir')
            OR lower(coalesce(s.lie_after, '')) = 'green')
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) >= v_lo
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) < v_hi
      GROUP BY p.id
      HAVING COUNT(*) >= v_min_greens
    ),
    team_values AS (
      SELECT b.player_id, tm.team_id, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      WHERE tm.team_id = ANY (p_team_ids)
    ),
    team_stats AS (
      SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
      FROM team_values GROUP BY team_id
    ),
    ranked AS (
      SELECT tv.player_id, tv.team_id, tv.player_value, ts.team_avg, ts.team_n,
        100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
      FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
    ),
    pop_stats AS (SELECT AVG(player_value) AS level_avg, COUNT(*) AS level_n FROM base),
    pop_ranked AS (
      SELECT player_id, 100 * (PERCENT_RANK() OVER (ORDER BY player_value DESC)) AS level_pct FROM base
    ),
    pga AS (
      SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards
      WHERE metric_id = v_metric ORDER BY season DESC LIMIT 1
    )
    INSERT INTO public.golf_player_standing AS s (
      player_id, metric_id, player_value, team_avg, team_n, team_pct,
      level_avg, level_n, level_pct, pga_value, pga_delta, computed_at
    )
    SELECT r.player_id, v_metric, r.player_value, r.team_avg, r.team_n::int, r.team_pct,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
      ps.level_n::int,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
      COALESCE(pga.pga_tour_value, pga.pga_p50),
      r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50), now()
    FROM ranked r
    CROSS JOIN pop_stats ps
    LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id
    CROSS JOIN pga
    WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
    ON CONFLICT (player_id, metric_id) DO UPDATE
    SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
        team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
        level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta,
        computed_at = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    out_metric_id := v_metric;
    out_rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$_$;

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05. Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd, on-green feet) with team + app-wide cohort + PGA, since the cache has no per-band proximity. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*). MIN_GREENS=3 per band, MIN_COHORT_N=8.';

GRANT ALL ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO "service_role";
