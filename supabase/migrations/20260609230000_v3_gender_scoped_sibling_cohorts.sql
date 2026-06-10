-- Gender-scoped level (population) cohort for the TWO sibling standing RPCs
-- (audit P3, follow-up to 20260609170000_v3_gender_scoped_level_cohort.sql which
-- fixed refresh_player_standing).
--
-- WHY
-- ---
-- refresh_player_standing_round_metrics (practice_tournament_delta,
-- opening_hole_delta) and refresh_player_standing_shot_metrics
-- (approach_proximity_50_125ft / 125_175ft / 175_plus_ft) each build their
-- population_values CTE by pooling EVERY active college player across all teams
-- into ONE app-wide cohort (level_avg / level_n / level_pct) with NO gender
-- split. Verified live: opening_hole_delta and all three approach_proximity
-- bands carry a BYTE-IDENTICAL pooled level_avg for women's-team and men's-team
-- rows, so a women's player's counterfactual + priority are computed against a
-- partly-men's baseline. golf_teams.gender (migration 20260607160000, text
-- 'mens'/'womens', NOT NULL DEFAULT 'mens', CHECK constraint) makes the split
-- trivial and exact: college golf teams are single-gender.
--
-- This mirrors the already-shipped fix in 20260609170000 exactly — same
-- gender-scoping pattern, same MIN cohort gates each sibling already uses.
--
-- WHAT CHANGED (per function — vs the prior canonical bodies, which are:
--   round_metrics: 20260609120000_pressure_gate_count_ge_3.sql
--   shot_metrics:  20260606120100_v3_standing_team_pct_tiny_n_guard.sql):
--   1. team_values now also carries the player's team gender
--      (COALESCE(t.gender,'mens') via a join to golf_teams t), threaded through
--      ranked so each ranked row knows its gender.
--   2. population_values now joins golf_teams t and carries
--      COALESCE(t.gender,'mens') AS gender alongside player_value.
--   3. pop_stats is GROUP BY gender (one level_avg / level_n per gender);
--      pop_ranked is PERCENT_RANK() OVER (PARTITION BY gender ...).
--   4. The final INSERT joins each ranked player to the pop_stats / pop_ranked
--      row for THEIR OWN gender (pop_stats ps ON ps.gender = r.gender;
--      pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender),
--      instead of a blind CROSS JOIN to the single pooled aggregate.
-- Everything else is preserved BYTE-FOR-BYTE:
--   * round_metrics: the pg-2 practice_tournament_delta `>= 3` per-bucket
--     HAVING gates (both team_values and population_values), the
--     opening_hole_delta `> 0` hole-presence gates, COUNT(DISTINCT r.id) round
--     floor, v_window_days=90 / v_min_rounds=5, MIN_COHORT_N=8 / MIN_TEAM_N=3.
--   * shot_metrics: the band loop, on-green/feet-vs-yards unit handling, the
--     v_lo/v_hi band predicates, MIN_GREENS=3 / MIN_COHORT_N=8 / MIN_TEAM_N=3.
-- Both functions are STATIC SQL (no format()/dynamic EXECUTE), unlike the
-- refresh_player_standing template which loops dynamic SQL — preserved as-is.
--
-- SAFETY: pure CREATE OR REPLACE of two existing SECURITY DEFINER functions;
-- identical signatures (uuid[]) -> TABLE(out_metric_id text, out_rows_upserted
-- bigint), search_path pinned to 'public', lock-free (Squawk-safe). Grants are
-- re-asserted service_role-ONLY below (the prior 20260605130000 shot_metrics
-- migration shipped GRANT ALL ... TO anon/authenticated — the exact P0 audit
-- regression; the grant-hardening assertion rpc_grant_hardening locks this).
--
-- VERIFIED: <pending orchestrator apply — run the verification queries below>
--   -- after apply + a standing-refresh cron pass, women & men must NOT share level_avg:
--   --   SELECT s.metric_id, t.gender, COUNT(DISTINCT s.level_avg) AS distinct_level_avgs
--   --   FROM public.golf_player_standing s
--   --   JOIN public.golf_team_members tm ON tm.player_id = s.player_id AND tm.status='active'
--   --   JOIN public.golf_teams t ON t.id = tm.team_id
--   --   WHERE s.metric_id IN ('opening_hole_delta','approach_proximity_125_175ft')
--   --   GROUP BY s.metric_id, t.gender;   -- expect a DIFFERENT level_avg per gender
--
-- ROLLBACK: re-apply the prior CREATE OR REPLACE for each function verbatim:
--   round_metrics -> 20260609120000_pressure_gate_count_ge_3.sql
--   shot_metrics  -> 20260606120100_v3_standing_team_pct_tiny_n_guard.sql (the
--     shot_metrics body therein), THEN re-assert the service_role-only grants.
--   No data migration is needed — the next standing-refresh cron pass overwrites
--   level_avg/level_pct via the ON CONFLICT upsert.

-- ============================================================================
-- 1) refresh_player_standing_round_metrics — practice_tournament_delta + opening_hole_delta
-- ============================================================================
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
      COALESCE(t.gender, 'mens') AS gender,
      AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
        - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_teams t
      ON t.id = tm.team_id
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
    HAVING
      -- pg-2: per-bucket floor raised from > 0 to >= 3 to match TS MIN_ROUNDS_PER_BUCKET.
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) >= 3
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice') >= 3
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
      -- lower_better: invert percentile so higher pct = better player
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  -- App-wide college POPULATION (V1 cohort): NOT filtered by p_team_ids. DISTINCT
  -- so a player on >1 active team is counted once per (gender, value). Now carries
  -- the player's team gender so the cohort is app-wide WITHIN a gender (audit P3).
  population_values AS (
    SELECT DISTINCT player_id, gender, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        COALESCE(t.gender, 'mens') AS gender,
        AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
          - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND r.status = 'completed'
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        -- pg-2: per-bucket floor raised from > 0 to >= 3 to match TS MIN_ROUNDS_PER_BUCKET.
        COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) >= 3
        AND COUNT(*) FILTER (WHERE r.round_type = 'practice') >= 3
        AND COUNT(*) >= v_min_rounds
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  -- Gender-scoped cohort aggregates (audit P3): one level_avg / level_n per gender.
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

  -- The opening_hole_delta block below also writes its result via the
  -- same out_metric_id / out_rows_upserted OUT params.
  ------------------------------------------------------------
  -- opening_hole_delta
  ------------------------------------------------------------
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
     AND r.status = 'completed'
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
       AND r.status = 'completed'
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

COMMENT ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) IS 'v3 W24 prep + cohort baseline (SC3, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09). Round-level standing for practice_tournament_delta + opening_hole_delta with per-team team_avg/team_pct AND an app-wide college-population level_avg/level_n/level_pct now SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. team_pct is NULLed when team_n<3 (tiny-N percentile guard, EC-2). Companion to refresh_player_standing. Same (metric_id, rows_upserted) return shape (aliased out_*). pg-2 (2026-06-09): pressure buckets gated at >=3 to match the TS MIN_ROUNDS_PER_BUCKET floor.';

-- Lock the SECURITY-DEFINER function to service_role only. anon/authenticated
-- EXECUTE on a standing-refresh RPC was the exact P0 regression the 2026-06-06
-- audit closed (and caught re-shipping). The rpc_grant_hardening pgTAP
-- assertion locks this.
REVOKE EXECUTE ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) TO service_role;


-- ============================================================================
-- 2) refresh_player_standing_shot_metrics — approach_proximity_* (by band)
-- ============================================================================
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
    -- team_values carries the player's team gender (audit P3) so ranked rows can
    -- be matched to their own-gender cohort below.
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
    -- App-wide POPULATION, now carrying the player's team gender (audit P3).
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
    JOIN pop_stats ps ON ps.gender = r.gender
    LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
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

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05 + tiny-N team_pct guard (EC-2, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09). Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd, on-green feet) with team + app-wide cohort (now SCOPED BY golf_teams.gender, MIN_COHORT_N=8) + PGA. team_pct is NULLed when team_n<3. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*). MIN_GREENS=3 per band.';

-- Lock the SECURITY-DEFINER function to service_role only. The original
-- 20260605130000 shot_metrics migration shipped GRANT ALL ... TO anon/authenticated
-- — the exact P0 audit regression; re-assert the hardened surface here. The
-- rpc_grant_hardening pgTAP assertion locks this.
REVOKE EXECUTE ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO service_role;
