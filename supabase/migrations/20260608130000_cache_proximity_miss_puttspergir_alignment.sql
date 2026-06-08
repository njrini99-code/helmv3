-- Stats-correctness audit (2026-06-07): align four shot-derived cache stats with
-- the canonical TS engine (calculateStatsFromShots), the source of truth the
-- player-profile + team pages display and that CoachHelm reads from the cache.
--
-- Verified against the engine over PAGINATED (un-truncated) shot data for two
-- players — Nick Rini (1092 shots) and Grace Saunders (633, women's) — every
-- value below matches the engine to the same precision:
--
--   stat                       engine=cache (Nick / Grace)
--   approach_proximity_average 16.69 / 18.90   (was 17.7 / 20.4 — over-counted)
--   driving_distance_average   (ROUND 2 now, was ROUND 1 → 239.6 vs true 239.57)
--   putts_per_gir              1.92 / 1.98     (was NULL — never written)
--   approach_miss_*_pct        52.3/29.5/26.1/43.2 · 48.4/25.8/11.3/29.0 (was NULL)
--   putt_make_pct_* bands      96.6/46.5/28.0/15.6/14.7 · 98.7/77.8/46.2/7.7/4.5
--
-- WHY the old values were wrong:
--  * approach_proximity_average AVG'd EVERY shot_type='approach' that found the
--    green — including non-regulation recovery approaches — and ×3'd any finish
--    whose unit was not literally 'feet'. The engine records proximity ONLY for
--    the regulation-attempt approach shot (shot_number = par-2, or an earlier
--    green-finder for par-5 go-for-it), and treats a non-'yards' unit as feet
--    (normalizeToFeet ×3 ONLY when unit='yards'). It also folds in par-3 GIRs
--    (tee shots) the old shot_type filter missed.
--  * driving_distance_average rounded to 1 dp; the engine's safeAverage rounds
--    to 2 (Math.round(x*100)/100).
--  * putts_per_gir + approach_miss_*_pct were never populated by any writer.
--  * putt_make_pct_* used putt_distance_feet (or distance_to_hole_before ×3 for
--    non-feet) with '<' band edges; the engine uses distance_to_hole_before as
--    feet (normalizePuttFeet — clamp [0,120], NEVER ×3, a putt is on the green)
--    with '<=' upper edges, e.g. a 3.0 ft putt is a 0-3 ft make, not 3-5 ft.
--
-- Round set: completed AND total_score IS NOT NULL — the exact set the engine
-- (player-profile-stats) uses, so cache == displayed.
--
-- NOTE: function signatures are unchanged, so the existing PERFORM hooks inside
-- refresh_player_stats_cache() keep working and the service_role lock from
-- 20260607030000 is re-asserted at the end.

-- 1) update_player_distance_proximity: driving distance, approach proximity,
--    putts_per_gir, and approach-miss direction — all from the regulation-attempt
--    approach shot per hole, matching the engine.
CREATE OR REPLACE FUNCTION public.update_player_distance_proximity(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  WITH hole_shots AS (
    SELECT gs.shot_number, lower(gs.shot_type) AS shot_type, gs.result,
           gs.miss_direction, gs.distance_to_hole_after, gs.distance_unit_after,
           h.id AS h_id, h.par, h.gir, h.putts
    FROM golf_shots gs
    JOIN golf_holes h  ON h.round_id = gs.round_id AND h.hole_number = gs.hole_number
    JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
  ),
  -- first shot that found the green (the GIR shot, if any)
  gf AS (
    SELECT DISTINCT ON (h_id) h_id, shot_number AS gf_num, result AS gf_result,
           miss_direction AS gf_md, distance_to_hole_after AS gf_da, distance_unit_after AS gf_ua
    FROM hole_shots WHERE result IN ('green','gir','hole') ORDER BY h_id, shot_number
  ),
  -- the regulation-attempt shot: shot_number = GREATEST(par-2, 1)
  rs AS (
    SELECT DISTINCT ON (h_id) h_id, result AS reg_result, miss_direction AS reg_md,
           distance_to_hole_after AS reg_da, distance_unit_after AS reg_ua
    FROM hole_shots WHERE shot_number = GREATEST(par - 2, 1) ORDER BY h_id, shot_number
  ),
  putt_counts AS (
    SELECT h_id, COUNT(*) FILTER (WHERE shot_type = 'putting') AS pc FROM hole_shots GROUP BY h_id
  ),
  ho AS (SELECT DISTINCT h_id, par, gir, putts FROM hole_shots),
  perhole AS (
    SELECT
      -- greenInRegulation = holeInfo.gir ?? derivedGir (green found by shot <= par-2)
      COALESCE(ho.gir, (gf.gf_num IS NOT NULL AND gf.gf_num <= ho.par - 2)) AS gir_eff,
      COALESCE(ho.putts, pc.pc) AS putts,
      -- approachShot = earlier green-finder, else the regulation shot, else any green-finder
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_result
           WHEN rs.h_id IS NOT NULL THEN rs.reg_result
           WHEN gf.h_id IS NOT NULL THEN gf.gf_result END AS a_result,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_md
           WHEN rs.h_id IS NOT NULL THEN rs.reg_md
           WHEN gf.h_id IS NOT NULL THEN gf.gf_md END AS a_md,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_da
           WHEN rs.h_id IS NOT NULL THEN rs.reg_da
           WHEN gf.h_id IS NOT NULL THEN gf.gf_da END AS a_da,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_ua
           WHEN rs.h_id IS NOT NULL THEN rs.reg_ua
           WHEN gf.h_id IS NOT NULL THEN gf.gf_ua END AS a_ua
    FROM ho
    LEFT JOIN gf ON gf.h_id = ho.h_id
    LEFT JOIN rs ON rs.h_id = ho.h_id
    LEFT JOIN putt_counts pc ON pc.h_id = ho.h_id
  ),
  -- proximity: only when the regulation approach found the green (feet; holed = 0;
  -- ×3 ONLY for an explicit 'yards' unit, matching normalizeToFeet)
  prox AS (
    SELECT CASE WHEN a_result IN ('green','gir','hole') THEN
             CASE WHEN a_result = 'hole' THEN 0
                  WHEN a_da IS NOT NULL THEN (CASE WHEN a_ua = 'yards' THEN a_da * 3 ELSE a_da END)
             END
           END AS p
    FROM perhole
  ),
  -- approach miss directions on non-GIR holes where the regulation approach missed
  miss AS (
    SELECT lower(a_md) AS md FROM perhole
    WHERE gir_eff IS NOT TRUE AND a_result IS NOT NULL
      AND a_result NOT IN ('green','gir','hole') AND a_md IS NOT NULL
  ),
  miss_agg AS (
    SELECT
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('short','short_left','short_right')) / NULLIF(COUNT(*),0), 1) AS s,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('long','long_left','long_right'))   / NULLIF(COUNT(*),0), 1) AS lo,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('left','short_left','long_left'))    / NULLIF(COUNT(*),0), 1) AS le,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('right','short_right','long_right'))  / NULLIF(COUNT(*),0), 1) AS ri
    FROM miss
  ),
  dd AS (
    SELECT ROUND(AVG(gs.shot_distance)::numeric, 2) AS v
    FROM golf_shots gs JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
      AND gs.shot_type = 'tee' AND gs.shot_distance IS NOT NULL AND gs.shot_distance > 0
  )
  UPDATE golf_player_stats_cache psc SET
    driving_distance_average   = (SELECT v FROM dd),
    approach_proximity_average = (SELECT ROUND(AVG(p)::numeric, 2) FROM prox WHERE p IS NOT NULL),
    putts_per_gir              = (SELECT ROUND(AVG(putts)::numeric, 2) FROM perhole WHERE gir_eff IS TRUE),
    approach_miss_short_pct    = (SELECT s  FROM miss_agg),
    approach_miss_long_pct     = (SELECT lo FROM miss_agg),
    approach_miss_left_pct     = (SELECT le FROM miss_agg),
    approach_miss_right_pct    = (SELECT ri FROM miss_agg),
    updated_at = now()
  WHERE psc.player_id = p_player_id;
END;
$function$;

-- 2) update_player_putt_make_pct: bucket EVERY putt by its start distance, made =
--    holed. Distance = distance_to_hole_before treated as feet (clamp [0,120],
--    never ×3); '<=' upper edges so a putt at exactly 3/5/10/15/20 ft falls in
--    the lower band — matching getPuttDistanceBucket + normalizePuttFeet.
CREATE OR REPLACE FUNCTION public.update_player_putt_make_pct(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  WITH putts AS (
    SELECT LEAST(GREATEST(gs.distance_to_hole_before, 0), 120) AS feet,
           (gs.result = 'hole' OR gs.putt_made IS TRUE) AS made
    FROM golf_shots gs
    JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
      AND lower(gs.shot_type) = 'putting' AND gs.distance_to_hole_before IS NOT NULL
  ),
  agg AS (
    SELECT
      ROUND(100.0*COUNT(*) FILTER (WHERE feet<=3 AND made)              / NULLIF(COUNT(*) FILTER (WHERE feet<=3),0),1)               AS p0_3,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>3  AND feet<=5  AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>3  AND feet<=5),0),1)   AS p3_5,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>5  AND feet<=10 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>5  AND feet<=10),0),1)  AS p5_10,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>10 AND feet<=15 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>10 AND feet<=15),0),1)  AS p10_15,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=20 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=20),0),1)  AS p15_20,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>20 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>20),0),1)               AS p20_plus,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=25 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=25),0),1)  AS p15_25,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>25 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>25),0),1)               AS p25_plus
    FROM putts
  )
  UPDATE golf_player_stats_cache psc
  SET putt_make_pct_0_3ft      = agg.p0_3,
      putt_make_pct_3_5ft      = agg.p3_5,
      putt_make_pct_5_10ft     = agg.p5_10,
      putt_make_pct_10_15ft    = agg.p10_15,
      putt_make_pct_15_20ft    = agg.p15_20,
      putt_make_pct_20_plus_ft = agg.p20_plus,
      putt_make_pct_15_25ft    = agg.p15_25,
      putt_make_pct_25_plus_ft = agg.p25_plus,
      updated_at               = now()
  FROM agg
  WHERE psc.player_id = p_player_id;
END;
$function$;

-- Re-assert the service_role lock (CREATE OR REPLACE preserves ACLs, but be explicit).
REVOKE EXECUTE ON FUNCTION public.update_player_distance_proximity(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid)       FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_player_distance_proximity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid)       TO service_role;

-- Backfill every cached player with the corrected stats.
DO $$
DECLARE v_pid uuid;
BEGIN
  FOR v_pid IN SELECT player_id FROM golf_player_stats_cache LOOP
    PERFORM public.update_player_distance_proximity(v_pid);
    PERFORM public.update_player_putt_make_pct(v_pid);
  END LOOP;
END $$;
