-- Team percentile floor 3 -> 5 in the three Standing refresh functions
-- (GolfHelm UI/UX audit, NUM-35 follow-up, 2026-09-25). AWAITING OWNER APPLY.
-- Do not apply without the owner's go-ahead.
--
-- DEPENDS ON 20260924120000_golf_countable_round_stats_cache.sql (OD-01) and
-- 20260924140000_golf_standing_pressure_gap_parity.sql (NUM-24), both held.
-- Apply OD-01, then NUM-24, then this file, in the same session. The DO block
-- below refuses to run unless each live function body is exactly the one this
-- file was built from:
--   refresh_player_standing               md5 69ee2ec456e3847986ba314e7eeb094c (live 2026-09-25)
--   refresh_player_standing_round_metrics md5 e014336d66939113f5dfcb07954bca28 (NUM-24's body)
--   refresh_player_standing_shot_metrics  md5 549c46300dc9156d103142ecb4cc6ff5 (live 2026-09-25)
-- Without the check, applying this before NUM-24 would replace the live
-- round-metrics body with NUM-24's (and OD-01's) changes as a side effect.
--
-- WHY. NUM-35 made the app withhold a team percentile ranked among fewer than
-- five teammates (PERCENTILE_MIN_TEAM_N = 5 in
-- src/lib/coachhelm/v2/stats/percentiles.ts). The SQL still wrote team_pct
-- for teams of 3 or 4 (v_min_team_n = 3), so golf_player_standing carried a
-- number every reader then had to throw away. This puts the floor where the
-- app reads it.
--
-- WHAT CHANGES. In each of the three functions, one line:
--   v_min_team_n constant int := 3;  ->  v_min_team_n constant int := 5;
-- and the matching COMMENT ON FUNCTION text ("team_n<3" / "MIN_TEAM_N=3" ->
-- 5). Nothing else: signatures, return shapes, SECURITY DEFINER, search_path,
-- the pressure-bucket floors (>= 3), MIN_GREENS / MIN_ROUNDS / MIN_ATTEMPTS
-- and the cohort floor (8) are byte-for-byte the source bodies above.
--
-- Read-only production sizing (2026-09-25): golf_player_standing has 994
-- rows, 956 with a team_pct. 10 rows (7 players) have team_n 3 or 4 and would
-- lose their team_pct on the next refresh. The app already hides those.
--
-- SAFETY: CREATE OR REPLACE of existing SECURITY DEFINER functions with the
-- same signatures; owner (postgres), search_path and grants
-- (service_role only) are unchanged, so no GRANT/REVOKE is restated; no table
-- locks. supabase/schemas/functions/public.sql carries the same constants.
--
-- AFTER APPLY (owner, service role): refresh Standing so existing rows pick
-- up the floor (the round-metrics call also covers OD-01 and NUM-24):
--   SELECT public.refresh_player_standing(ARRAY(SELECT id FROM public.golf_teams));
--   SELECT public.refresh_player_standing_round_metrics(ARRAY(SELECT id FROM public.golf_teams));
--   SELECT public.refresh_player_standing_shot_metrics(ARRAY(SELECT id FROM public.golf_teams));
--
-- ROLLBACK: CREATE OR REPLACE each function with its source body: refresh_player_standing
-- ROLLBACK: from supabase/schemas/functions/public.sql as of this commit's parent,
-- ROLLBACK: refresh_player_standing_round_metrics from 20260924140000 (NUM-24), and
-- ROLLBACK: refresh_player_standing_shot_metrics from 20260922120000; then run the refreshes above.
--
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_standing' and md5(p.prosrc) = '40887c39948601e5ac744e793013cc85'
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_standing_round_metrics' and md5(p.prosrc) = 'fa4f30acb694a44697f830ac44c2ddb3'
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_standing_shot_metrics' and md5(p.prosrc) = '4eee486c0c4c4946c4d25deac9af8100'

DO $guard$
DECLARE
  v_expected constant text[][] := ARRAY[
    ['refresh_player_standing',               '69ee2ec456e3847986ba314e7eeb094c'],
    ['refresh_player_standing_round_metrics', 'e014336d66939113f5dfcb07954bca28'],
    ['refresh_player_standing_shot_metrics',  '549c46300dc9156d103142ecb4cc6ff5']
  ];
  v_src text;
  v_i int;
BEGIN
  FOR v_i IN 1 .. array_length(v_expected, 1) LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_expected[v_i][1];
    IF v_src IS NULL OR md5(v_src) <> v_expected[v_i][2] THEN
      RAISE EXCEPTION 'team pct floor: live % is not the body this file was built from (md5 %). Apply OD-01 and NUM-24 first, or rebase this file on the live body.',
        v_expected[v_i][1], md5(v_src);
    END IF;
  END LOOP;
END
$guard$;

-- refresh_player_standing
CREATE OR REPLACE FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) RETURNS TABLE("metric_id" "text", "rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_bindings text[][] := ARRAY[
    ['sg_total',                  'cache.sg_total_per_round',          'higher_better'],
    ['sg_ott',                    'cache.sg_tee_per_round',            'higher_better'],
    ['sg_approach',               'cache.sg_approach_per_round',       'higher_better'],
    ['sg_around_green',           'cache.sg_around_green_per_round',   'higher_better'],
    ['sg_putting',                'cache.sg_putting_per_round',        'higher_better'],
    ['putts_made_3_5ft_pct',      'cache.putt_make_pct_3_5ft',         'higher_better'],
    ['putts_made_5_10ft_pct',     'cache.putt_make_pct_5_10ft',        'higher_better'],
    ['putts_made_10_15ft_pct',    'cache.putt_make_pct_10_15ft',       'higher_better'],
    ['gir_pct',                   'cache.gir_percentage',              'higher_better'],
    ['scrambling_pct_sand',       'cache.sand_save_percentage',        'higher_better'],
    ['penalty_rate_per_round',    'cache.penalty_strokes_per_round',   'lower_better'],
    ['big_number_rate',           'CASE WHEN COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0) > 0 THEN 100.0 * (COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0))::numeric / (COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0)) ELSE NULL END',
                                                                       'lower_better'],
    ['scoring_par_3',             'cache.par3_average',                'lower_better'],
    ['scoring_par_4',             'cache.par4_average',                'lower_better'],
    ['scoring_par_5',             'cache.par5_average',                'lower_better'],
    ['putts_made_15_25ft_pct',    'cache.putt_make_pct_15_25ft',       'higher_better'],
    ['putts_made_25_plus_ft_pct', 'cache.putt_make_pct_25_plus_ft',    'higher_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int; v_metric text; v_expr text; v_dir text; v_rank_order text; v_sql text; v_rows bigint;
  v_min_cohort_n constant int := 8;
  v_min_team_n constant int := 5;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN RETURN; END IF;
  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];
    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;
    v_sql := format($q$
      WITH team_values AS (
        SELECT p.id AS player_id, tm.team_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1) AND cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      team_stats AS (SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n FROM team_values GROUP BY team_id),
      ranked AS (
        SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      population_values AS (
        SELECT DISTINCT p.id AS player_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      pop_stats AS (SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n FROM population_values GROUP BY gender),
      pop_ranked AS (SELECT player_id, gender, 100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value %s)) AS level_pct FROM population_values),
      pga AS (SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards WHERE metric_id = $2 ORDER BY season DESC LIMIT 1)
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value, team_avg, team_n, team_pct,
        level_avg, level_n, level_pct, pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value, r.team_avg, r.team_n::int,
        CASE WHEN r.team_n >= $4 THEN r.team_pct ELSE NULL END,
        CASE WHEN ps.level_n >= $3 THEN ps.level_avg ELSE NULL END,
        ps.level_n::int,
        CASE WHEN ps.level_n >= $3 THEN pr.level_pct ELSE NULL END,
        COALESCE(pga.pga_tour_value, pga.pga_p50),
        r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50), now()
      FROM ranked r
      JOIN pop_stats ps ON ps.gender = r.gender
      LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
      CROSS JOIN pga
      WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
      ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
          level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta, computed_at = now();
    $q$, v_expr, v_expr, v_rank_order, v_expr, v_expr, v_rank_order);
    EXECUTE v_sql USING p_team_ids, v_metric, v_min_cohort_n, v_min_team_n;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    metric_id := v_metric; rows_upserted := v_rows; RETURN NEXT;
    v_i := v_i + 1;
  END LOOP;
END;
$_$;

COMMENT ON FUNCTION public.refresh_player_standing(uuid[]) IS 'v3 W11 + gender-scoped level cohort (audit P3, 2026-06-09). Loops over the metric bindings and upserts golf_player_standing rows for the given team chunk. team_avg/team_pct per team (MIN_TEAM_N=5); level_avg/level_n/level_pct are now an app-wide cohort SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. Trusted SECURITY DEFINER — value expressions come from the function body, not the caller.';

-- refresh_player_standing_round_metrics
CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
  v_min_team_n constant int := 5;
  v_min_cohort_n constant int := 8;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  -- NUM-24: pressure gap per src/lib/golf/metrics/pressure-gap.ts: 18-hole
  -- to-par basis and the legacy 'qualifying' spelling. Floors stay 3/3/5.
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      COALESCE(t.gender, 'mens') AS gender,
      AVG(r.score_to_par::numeric * 18 / NULLIF(COALESCE(r.holes_played, 18), 0)) FILTER (WHERE r.round_type IN ('tournament','qualifier','qualifying'))
        - AVG(r.score_to_par::numeric * 18 / NULLIF(COALESCE(r.holes_played, 18), 0)) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_teams t
      ON t.id = tm.team_id
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
    HAVING
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier','qualifying') AND r.score_to_par IS NOT NULL) >= 3
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice' AND r.score_to_par IS NOT NULL) >= 3
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
      tv.gender,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  population_values AS (
    SELECT DISTINCT player_id, gender, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        COALESCE(t.gender, 'mens') AS gender,
        AVG(r.score_to_par::numeric * 18 / NULLIF(COALESCE(r.holes_played, 18), 0)) FILTER (WHERE r.round_type IN ('tournament','qualifier','qualifying'))
          - AVG(r.score_to_par::numeric * 18 / NULLIF(COALESCE(r.holes_played, 18), 0)) FILTER (WHERE r.round_type = 'practice')
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier','qualifying') AND r.score_to_par IS NOT NULL) >= 3
        AND COUNT(*) FILTER (WHERE r.round_type = 'practice' AND r.score_to_par IS NOT NULL) >= 3
        AND COUNT(*) >= v_min_rounds
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
    GROUP BY gender
  ),
  pop_ranked AS (
    SELECT
      player_id,
      gender,
      100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
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
  JOIN pop_stats ps ON ps.gender = r.gender
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
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
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      COALESCE(t.gender, 'mens') AS gender,
      AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
        - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_teams t
      ON t.id = tm.team_id
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    JOIN public.golf_holes h
      ON h.round_id = r.id
     AND h.score IS NOT NULL
     AND h.par IS NOT NULL
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
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
      tv.gender,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  population_values AS (
    SELECT DISTINCT player_id, gender, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        COALESCE(t.gender, 'mens') AS gender,
        AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
          - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      JOIN public.golf_holes h
        ON h.round_id = r.id
       AND h.score IS NOT NULL
       AND h.par IS NOT NULL
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        COUNT(DISTINCT r.id) >= v_min_rounds
        AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
        AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
    GROUP BY gender
  ),
  pop_ranked AS (
    SELECT
      player_id,
      gender,
      100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
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
  JOIN pop_stats ps ON ps.gender = r.gender
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
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

COMMENT ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) IS 'v3 W24 prep + cohort baseline (SC3, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09). Round-level standing for practice_tournament_delta + opening_hole_delta with per-team team_avg/team_pct AND an app-wide college-population level_avg/level_n/level_pct now SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. team_pct is NULLed when team_n<5 (tiny-N percentile guard, EC-2). Companion to refresh_player_standing. Same (metric_id, rows_upserted) return shape (aliased out_*). pg-2 (2026-06-09): pressure buckets gated at >=3 to match the TS MIN_ROUNDS_PER_BUCKET floor.';

-- refresh_player_standing_shot_metrics
CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[])
    RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_min_attempts constant int := 10;  -- all-shot floor (addendum A2 §5.2): thin trend guard
  v_min_rounds constant int := 3;     -- distinct rounds contributing, same floor
  v_min_greens constant int := 3;     -- legacy on-green floor, preserved for on_green_proximity_feet
  v_min_cohort_n constant int := 8;   -- min population before a cohort baseline is trusted
  v_min_team_n constant int := 5;     -- min team size before a team percentile is trusted
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bands[v_i][1];
    v_lo := v_bands[v_i][2]::numeric;
    v_hi := v_bands[v_i][3]::numeric;

    WITH shots AS (
      -- Every eligible approach shot in the band, on-green or not (all-shot
      -- basis). par is carried through for the lay-up tag below; a shot whose
      -- hole/par is unresolvable (LEFT JOIN miss) is never tagged a lay-up.
      SELECT
        p.id AS player_id,
        r.id AS round_id,
        h.par,
        (lower(coalesce(s.result, '')) IN ('green', 'hole', 'gir')
         OR lower(coalesce(s.lie_after, '')) = 'green') AS on_green,
        (CASE WHEN lower(coalesce(s.distance_unit_after, 'feet')) = 'yards'
              THEN s.distance_to_hole_after * 3.0
              ELSE s.distance_to_hole_after END) AS after_ft
      FROM public.golf_players p
      JOIN public.golf_rounds r
        ON r.player_id = p.id AND r.status = 'completed'
      JOIN public.golf_shots s
        ON s.round_id = r.id
       AND s.shot_type = 'approach'
       AND s.distance_to_hole_before IS NOT NULL
       AND s.distance_to_hole_after IS NOT NULL
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) >= v_lo
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) < v_hi
      LEFT JOIN public.golf_holes h ON h.id = s.hole_id
      -- db-migration-reviewer (2026-09-22): an inner JOIN to golf_team_members
      -- here duplicated every shot once per active team a player belongs to
      -- (harmless when only AVG'd; now it also inflates attempts/greens/
      -- layup_excluded_n against the new floors). EXISTS keeps it a per-player
      -- membership check, not a row multiplier.
      WHERE EXISTS (
        SELECT 1 FROM public.golf_team_members tmx
         WHERE tmx.player_id = p.id AND tmx.status = 'active'::team_member_status
      )
    ),
    tagged AS (
      SELECT *,
        -- db-migration-reviewer (2026-09-22): `par = 5` is NULL (not false)
        -- when the hole/par is unresolvable (LEFT JOIN miss), which made the
        -- whole AND-chain NULL and silently dropped the shot from BOTH
        -- `NOT is_likely_layup` and `is_likely_layup` filters below.
        -- IS NOT DISTINCT FROM treats a NULL par as "not 5" instead.
        (v_metric = 'approach_proximity_175_plus_ft' AND par IS NOT DISTINCT FROM 5 AND NOT on_green) AS is_likely_layup
      FROM shots
    ),
    -- One row per active player: all-shot proximity (feet) over the
    -- Tour-comparable population (lay-ups excluded), plus the preserved
    -- on-green-only figure over that same population.
    base AS (
      SELECT
        player_id,
        AVG(after_ft) AS player_value,
        COUNT(*) AS attempts,
        COUNT(DISTINCT round_id) AS rounds,
        AVG(after_ft) FILTER (WHERE on_green) AS on_green_avg,
        COUNT(*) FILTER (WHERE on_green) AS greens
      FROM tagged
      WHERE NOT is_likely_layup
      GROUP BY player_id
      HAVING COUNT(*) >= v_min_attempts AND COUNT(DISTINCT round_id) >= v_min_rounds
    ),
    layups AS (
      SELECT player_id, COUNT(*) AS layup_n
      FROM tagged
      WHERE is_likely_layup
      GROUP BY player_id
    ),
    -- team_values carries the player's team gender (audit P3) so ranked rows
    -- can be matched to their own-gender cohort below.
    team_values AS (
      SELECT b.player_id, tm.team_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      WHERE tm.team_id = ANY (p_team_ids)
    ),
    team_stats AS (
      SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
      FROM team_values GROUP BY team_id
    ),
    ranked AS (
      SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
        100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
      FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
    ),
    -- App-wide POPULATION, carrying the player's team gender (audit P3).
    -- DISTINCT so a player on >1 active team is counted once per (gender, value).
    population_values AS (
      SELECT DISTINCT b.player_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
    ),
    -- Gender-scoped cohort aggregates (audit P3): one level_avg / level_n per gender.
    pop_stats AS (
      SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
      FROM population_values GROUP BY gender
    ),
    pop_ranked AS (
      SELECT player_id, gender,
        100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
      FROM population_values
    ),
    pga AS (
      SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards
      WHERE metric_id = v_metric ORDER BY season DESC LIMIT 1
    )
    INSERT INTO public.golf_player_standing AS s (
      player_id, metric_id, player_value, team_avg, team_n, team_pct,
      level_avg, level_n, level_pct, pga_value, pga_delta,
      basis, on_green_proximity_feet, layup_excluded_n, computed_at
    )
    SELECT r.player_id, v_metric, r.player_value, r.team_avg, r.team_n::int,
      CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
      ps.level_n::int,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
      COALESCE(pga.pga_tour_value, pga.pga_p50),
      r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
      'all_shot',
      CASE WHEN b.greens >= v_min_greens THEN b.on_green_avg ELSE NULL END,
      COALESCE(ly.layup_n, 0),
      now()
    FROM ranked r
    JOIN base b ON b.player_id = r.player_id
    JOIN pop_stats ps ON ps.gender = r.gender
    LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
    LEFT JOIN layups ly ON ly.player_id = r.player_id
    CROSS JOIN pga
    WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
    ON CONFLICT (player_id, metric_id) DO UPDATE
    SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
        team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
        level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta,
        basis = EXCLUDED.basis, on_green_proximity_feet = EXCLUDED.on_green_proximity_feet,
        layup_excluded_n = EXCLUDED.layup_excluded_n, computed_at = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    out_metric_id := v_metric;
    out_rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$_$;

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05 + tiny-N team_pct guard (EC-2, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09) + ALL-SHOT basis + lay-up split (Package 7B / addendum A2, 2026-09-22). Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd) with team + app-wide cohort (SCOPED BY golf_teams.gender, MIN_COHORT_N=8) + PGA. player_value is now averaged over every eligible approach in the band (misses included, basis=''all_shot''), matching golf_pga_standards.pga_value''s basis so the Tour marker is comparable; 175+ yd par-5 approaches missing the green are excluded as likely lay-ups (layup_excluded_n) rather than counted as misses. The pre-migration on-green-only figure is kept in on_green_proximity_feet, now ALSO gated behind the all-shot floor (MIN_ATTEMPTS=10, MIN_ROUNDS=3) on top of its own MIN_GREENS=3 -- no current reader consumes that column. Floor for the all-shot population is MIN_ATTEMPTS=10 + MIN_ROUNDS=3 (addendum A2 §5.2). team_pct is NULLed when team_n<5. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*).';
