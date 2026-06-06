-- SC3 (P1) + team_pct guard (P1, part of EC-2) for refresh_player_standing_round_metrics.
--
-- WHY (SC3): the 2026-06-05 cohort migration (20260605120000) added the
-- population_values / pop_stats / pop_ranked cohort CTEs + a MIN_COHORT_N=8
-- guard to refresh_player_standing, and the approach-proximity migration
-- (20260605130000) added them to refresh_player_standing_shot_metrics — but
-- the round-metrics sibling RPC was skipped. As a result practice_tournament_delta
-- and opening_hole_delta have NULL level_avg/level_pct, so their counterfactuals
-- benchmark college players against the PGA Tour value ONLY, permanently
-- over-stating the pressure (practice→tournament) and warm-up (opening-hole)
-- gaps vs a realistic college cohort.
--
-- WHY (team_pct guard / EC-2): PERCENT_RANK() returns 0 for the only (or worst)
-- row in a tiny team, so a "team of one" — or the single worst of two — gets
-- "Bottom 1% on your team" messaging. Mirror the MIN_COHORT_N treatment of the
-- level_* cohort: NULL team_pct when team_n < 3 so the read path can suppress
-- tiny-N percentile prose instead of rendering a synthetic 0/100.
--
-- The two delta blocks below are otherwise byte-for-byte the existing prod body
-- (20260527000000_prod_public_baseline.sql); the only changes are:
--   1. the population CTEs (population_values / pop_stats / pop_ranked) — NOT
--      filtered by the team-chunk arg, so the baseline is app-wide,
--   2. level_avg / level_n / level_pct written into the INSERT + ON CONFLICT,
--      gated by the MIN_COHORT_N=8 guard,
--   3. team_pct NULLed when team_n < 3.
--
-- SAFETY: pure CREATE OR REPLACE of an existing SECURITY-DEFINER function;
-- identical signature, grants preserved, lock-free (Squawk-safe).

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
  -- Min team size before a team percentile is trustworthy. Below this we NULL
  -- team_pct so the read path can suppress "Bottom 1% on your team" prose.
  v_min_team_n constant int := 3;
  -- Min population size before a cohort baseline is trustworthy. Below this we
  -- leave level_* NULL and the TS counterfactual falls back to the Tour value.
  v_min_cohort_n constant int := 8;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  ------------------------------------------------------------
  -- practice_tournament_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
        - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) > 0
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice') > 0
      AND COUNT(*) >= v_min_rounds
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      -- lower_better: invert percentile so higher pct = better player
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  -- App-wide college POPULATION (V1 cohort): NOT filtered by p_team_ids. DISTINCT
  -- so a player on >1 active team is counted once.
  population_values AS (
    SELECT DISTINCT player_id, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
          - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND r.status = 'completed'
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      GROUP BY p.id, tm.team_id
      HAVING
        COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) > 0
        AND COUNT(*) FILTER (WHERE r.round_type = 'practice') > 0
        AND COUNT(*) >= v_min_rounds
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
  ),
  pop_ranked AS (
    SELECT
      player_id,
      100 * (PERCENT_RANK() OVER (ORDER BY player_value DESC)) AS level_pct
    FROM population_values
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'practice_tournament_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    level_avg, level_n, level_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'practice_tournament_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
    ps.level_n::int,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pop_stats ps
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      level_avg    = EXCLUDED.level_avg,
      level_n      = EXCLUDED.level_n,
      level_pct    = EXCLUDED.level_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'practice_tournament_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;

  -- The opening_hole_delta block below also writes its result via the
  -- same out_metric_id / out_rows_upserted OUT params.
  ------------------------------------------------------------
  -- opening_hole_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
        - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    JOIN public.golf_holes h
      ON h.round_id = r.id
     AND h.score IS NOT NULL
     AND h.par IS NOT NULL
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(DISTINCT r.id) >= v_min_rounds
      AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
      AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  population_values AS (
    SELECT DISTINCT player_id, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
          - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND r.status = 'completed'
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      JOIN public.golf_holes h
        ON h.round_id = r.id
       AND h.score IS NOT NULL
       AND h.par IS NOT NULL
      GROUP BY p.id, tm.team_id
      HAVING
        COUNT(DISTINCT r.id) >= v_min_rounds
        AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
        AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
  ),
  pop_ranked AS (
    SELECT
      player_id,
      100 * (PERCENT_RANK() OVER (ORDER BY player_value DESC)) AS level_pct
    FROM population_values
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'opening_hole_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    level_avg, level_n, level_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'opening_hole_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
    ps.level_n::int,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pop_stats ps
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      level_avg    = EXCLUDED.level_avg,
      level_n      = EXCLUDED.level_n,
      level_pct    = EXCLUDED.level_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'opening_hole_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) IS 'v3 W24 prep + cohort baseline (SC3, 2026-06-06). Round-level standing for practice_tournament_delta + opening_hole_delta with per-team team_avg/team_pct AND an app-wide college-population level_avg/level_n/level_pct (V1 cohort, MIN_COHORT_N=8). team_pct is NULLed when team_n<3 (tiny-N percentile guard, EC-2). Companion to refresh_player_standing. Same (metric_id, rows_upserted) return shape (aliased out_*).';
