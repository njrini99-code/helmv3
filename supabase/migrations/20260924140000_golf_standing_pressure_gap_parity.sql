-- NUM-24 (GolfHelm UI/UX audit, 2026-09-24): Standing's pressure gap uses the
-- same rule as Fingerprint and Genome. AWAITING OWNER APPLY. Do not apply
-- without the owner's go-ahead.
--
-- DEPENDS ON 20260924120000_golf_countable_round_stats_cache.sql (OD-01, also
-- held). Apply OD-01 first, in the same session. The DO block below refuses
-- to run unless the live refresh_player_standing_round_metrics body is
-- exactly OD-01's (md5 of prosrc d343740516f570d7a6a250273ce9bf11, length
-- 9984). Without that check, applying this file alone would succeed and the
-- next Standing refresh would fail on the missing golf_round_is_countable
-- (plpgsql records no dependency).
--
-- WHY. The shared rule in src/lib/golf/metrics/pressure-gap.ts
-- (computePressureGap) is:
--   * pressure rounds are tournament and qualifier, plus the legacy
--     'qualifying' spelling; practice is the baseline;
--   * each round's to par is scaled to 18 holes (a 9-hole +3 counts as +6).
-- The Standing SQL averaged raw to-par (a 9-hole +3 against an 18-hole +6)
-- and did not count 'qualifying' rounds. That was one of the reasons
-- Standing showed "Pressure gap 15.75" while Fingerprint showed +17.4.
--
-- WHAT CHANGES. Only the practice_tournament_delta block, in both team_values
-- and population_values:
--   * AVG(score_to_par) becomes AVG(score_to_par * 18 / holes), with a missing
--     hole count read as 18 (OD-01's countable rule already limits holes to
--     9 or 18);
--   * the pressure side also accepts round_type 'qualifying';
--   * the per-side floors (>= 3) count only rounds with a non-null to par, so
--     a round the average ignores can't satisfy the floor (the TS rule).
-- Left alone on purpose: the 90-day window and the 3-per-side / 5-total
-- floors (each caller keeps its own floor; the Standing copy states 90 days),
-- the opening_hole_delta block, and v_min_team_n = 3 (NUM-35 set the TS team
-- percentile floor to 5; aligning the SQL is a separate follow-up).
--
-- Read-only production sizing (2026-09-24, OD-01's countable rule applied
-- inline): 0 'qualifying' rounds, in the window or ever, so that part changes
-- nothing today. 26 countable 9-hole rounds in the window, all in a practice
-- or pressure bucket. 10 players qualify before and after; 2 of them change,
-- by 0.30 strokes on average (0.33 at most).
--
-- SAFETY: a CREATE OR REPLACE of an existing SECURITY DEFINER function with the
-- same signature; owner, search_path and grants are unchanged; no table locks.
-- supabase/schemas/functions/public.sql carries the same body.
--
-- AFTER APPLY (owner, service role): one standing refresh covers both OD-01
-- and this file:
--   SELECT public.refresh_player_standing_round_metrics(ARRAY(SELECT id FROM public.golf_teams));
--
-- ROLLBACK: CREATE OR REPLACE the function with its body from
-- 20260924120000_golf_countable_round_stats_cache.sql (the OD-01 body).
--
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_standing_round_metrics' and p.prosrc like '%''qualifying''%' and p.prosrc like '%* 18 / NULLIF(COALESCE(r.holes_played, 18), 0)%' and p.prosrc like '%golf_round_is_countable%';

DO $guard$
DECLARE
  v_src text;
BEGIN
  IF to_regprocedure('public.golf_round_is_countable(text,integer,integer,integer,integer,integer,numeric)') IS NULL THEN
    RAISE EXCEPTION 'NUM-24: apply 20260924120000_golf_countable_round_stats_cache.sql (OD-01) first; golf_round_is_countable is missing';
  END IF;
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'refresh_player_standing_round_metrics';
  IF v_src IS NULL OR md5(v_src) <> 'd343740516f570d7a6a250273ce9bf11' THEN
    RAISE EXCEPTION 'NUM-24: live refresh_player_standing_round_metrics is not the OD-01 body (md5 %). Stop and rebase this file on the live body.', md5(v_src);
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
  v_min_team_n constant int := 3;
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
