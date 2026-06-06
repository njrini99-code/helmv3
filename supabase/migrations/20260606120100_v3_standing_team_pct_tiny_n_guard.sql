-- team_pct tiny-N guard (P1, part of EC-2) for the two remaining standing RPCs.
--
-- WHY: PERCENT_RANK() OVER (PARTITION BY team_id ...) returns 0 for the only
-- (or worst) row in a team. On a team of one — or the single worst of two — a
-- 94.8%-from-3-5ft elite putter is told "Bottom 1% on your team." 43% of live
-- standing rows sit at a synthetic 0/100. Mirror the MIN_COHORT_N treatment of
-- level_* : NULL team_pct when team_n < 3 so the read path can suppress tiny-N
-- percentile prose rather than render a meaningless rail.
--
-- The round-metrics sibling is guarded in the companion migration
-- (20260606120000). This file guards:
--   1. refresh_player_standing            (cache-backed metrics, dynamic EXECUTE)
--   2. refresh_player_standing_shot_metrics (approach proximity by band)
-- Both bodies below are byte-for-byte their latest definitions
-- (20260605120000 / 20260605130000); the ONLY change is the team_pct column in
-- the INSERT being wrapped in a CASE WHEN team_n >= v_min_team_n.
--
-- SAFETY: pure CREATE OR REPLACE of existing SECURITY-DEFINER functions;
-- identical signatures, grants preserved, lock-free (Squawk-safe).

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) RETURNS TABLE("metric_id" "text", "rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- (metric_id, value_expr, direction) — value_expr is plain SQL,
  -- evaluated against `golf_player_stats_cache cache`. Trusted at
  -- function-creation time; not derived from caller input.
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
    -- Lag putts (2026-06-05): v3 edges are 15-25 / 25+; cache buckets are
    -- 15-20 / 20+ — a ~5ft edge approximation (PuttDistanceGenerator uses the
    -- same mapping). Lag speed is the domain's #1 3-putt driver.
    ['putts_made_15_25ft_pct',    'cache.putt_make_pct_15_20ft',       'higher_better'],
    ['putts_made_25_plus_ft_pct', 'cache.putt_make_pct_20_plus_ft',    'higher_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int;
  v_metric text;
  v_expr text;
  v_dir text;
  v_rank_order text;
  v_sql text;
  v_rows bigint;
  -- Min population size before a cohort baseline is trustworthy. Below this we
  -- leave level_avg NULL and the TS counterfactual falls back to the Tour value.
  v_min_cohort_n constant int := 8;
  -- Min team size before a team percentile is trustworthy. Below this we NULL
  -- team_pct so the read path can suppress "Bottom 1% on your team" prose.
  v_min_team_n constant int := 3;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];

    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;

    v_sql := format($q$
      WITH team_values AS (
        SELECT
          p.id AS player_id,
          tm.team_id,
          (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm
          ON tm.player_id = p.id
         AND tm.status = 'active'::team_member_status
        JOIN public.golf_player_stats_cache cache
          ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1)
          AND cache.rounds_played >= 5
          AND (%s) IS NOT NULL
      ),
      team_stats AS (
        SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
        FROM team_values
        GROUP BY team_id
      ),
      ranked AS (
        SELECT
          tv.player_id,
          tv.team_id,
          tv.player_value,
          ts.team_avg,
          ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv
        JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      -- App-wide college POPULATION (V1 cohort): NOT filtered by $1. DISTINCT so a
      -- player on >1 active team is counted once. cache is 1:1 with player.
      population_values AS (
        SELECT DISTINCT
          p.id AS player_id,
          (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm
          ON tm.player_id = p.id
         AND tm.status = 'active'::team_member_status
        JOIN public.golf_player_stats_cache cache
          ON cache.player_id = p.id
        WHERE cache.rounds_played >= 5
          AND (%s) IS NOT NULL
      ),
      pop_stats AS (
        SELECT AVG(player_value) AS level_avg, COUNT(*) AS level_n
        FROM population_values
      ),
      pop_ranked AS (
        SELECT
          player_id,
          100 * (PERCENT_RANK() OVER (ORDER BY player_value %s)) AS level_pct
        FROM population_values
      ),
      pga AS (
        SELECT pga_tour_value, pga_p50
        FROM public.golf_pga_standards
        WHERE metric_id = $2
        ORDER BY season DESC
        LIMIT 1
      )
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value,
        team_avg, team_n, team_pct,
        level_avg, level_n, level_pct,
        pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value,
        r.team_avg, r.team_n::int,
        CASE WHEN r.team_n >= $4 THEN r.team_pct ELSE NULL END,
        CASE WHEN ps.level_n >= $3 THEN ps.level_avg ELSE NULL END,
        ps.level_n::int,
        CASE WHEN ps.level_n >= $3 THEN pr.level_pct ELSE NULL END,
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
          team_avg = EXCLUDED.team_avg,
          team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct,
          level_avg = EXCLUDED.level_avg,
          level_n = EXCLUDED.level_n,
          level_pct = EXCLUDED.level_pct,
          pga_value = EXCLUDED.pga_value,
          pga_delta = EXCLUDED.pga_delta,
          computed_at = now();
    $q$, v_expr, v_expr, v_rank_order, v_expr, v_expr, v_rank_order);

    EXECUTE v_sql USING p_team_ids, v_metric, v_min_cohort_n, v_min_team_n;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    metric_id := v_metric;
    rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$_$;

COMMENT ON FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) IS 'v3 W11 + cohort baseline (2026-06-05) + tiny-N team_pct guard (EC-2, 2026-06-06). Per-team-chunk team_avg/team_pct AND an app-wide college-population level_avg/level_n/level_pct (V1 cohort, MIN_COHORT_N=8). team_pct is NULLed when team_n<3. Trusted SECURITY DEFINER. Returns one (metric_id, rows_upserted) row per metric.';


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
  v_min_team_n constant int := 3;     -- min team size before a team percentile is trusted
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
    SELECT r.player_id, v_metric, r.player_value, r.team_avg, r.team_n::int,
      CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
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

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05 + tiny-N team_pct guard (EC-2, 2026-06-06). Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd, on-green feet) with team + app-wide cohort + PGA. team_pct is NULLed when team_n<3. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*). MIN_GREENS=3 per band, MIN_COHORT_N=8.';
