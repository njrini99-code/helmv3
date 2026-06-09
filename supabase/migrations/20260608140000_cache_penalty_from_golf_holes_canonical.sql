-- Stats-correctness audit (2026-06-07): golf_round_stats_cache.penalty_strokes
-- preferred the denormalized round column r.total_penalties over the canonical
-- per-hole sum. r.total_penalties has drifted from golf_holes.penalty_strokes
-- (which equals the count of golf_shots.is_penalty=true — the value the TS engine
-- uses for penaltiesPerRound). e.g. Nick Rini: r.total_penalties=9 but
-- golf_holes.penalty_strokes=is_penalty=11, so the course_management penalty-rate
-- insight read 0.6/round vs the true 0.76. golf_holes is canonical for every
-- player (verified: is_penalty == golf_holes.penalty_strokes for all 14 with
-- penalties), so derive penalty_strokes from the per-hole sum.
--
-- Only the penalty line changes; the other COALESCE(r.total_X, SUM(h.X)) lines
-- stay (those round columns match golf_holes — check:stats 0 divergent). The
-- per-round penalty_strokes_per_round is recomputed by the
-- update_player_stats_complete trigger when golf_round_stats_cache is rewritten.
--
-- Applied to prod via apply_migration on 2026-06-07; this file is the
-- reproducible source.
CREATE OR REPLACE FUNCTION public.refresh_player_stats_cache(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM golf_round_stats_cache WHERE player_id = p_player_id;

  IF NOT EXISTS (SELECT 1 FROM golf_rounds WHERE player_id = p_player_id AND status = 'completed') THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = p_player_id;
    RETURN;
  END IF;

  INSERT INTO golf_round_stats_cache (
    round_id, player_id, total_score, score_to_par, front_nine, back_nine,
    fairways_hit, fairways_total, greens_hit, greens_total, total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts, sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus, penalty_strokes, driving_distance_avg,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    r.id, r.player_id, r.total_score, r.score_to_par,
    COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0),
    COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0),
    COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)),
    COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)),
    COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)),
    COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)),
    COALESCE(r.total_putts, SUM(h.putts)),
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0),
    -- Canonical penalty source: per-hole sum (== count of is_penalty shots ==
    -- engine penaltiesPerRound). Was COALESCE(r.total_penalties, SUM(...)) which
    -- trusted a drifted round column.
    SUM(COALESCE(h.penalty_strokes, 0)),
    (SELECT AVG(gs.shot_distance) FROM golf_shots gs JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gh.round_id = r.id AND gs.shot_type = 'tee' AND gs.shot_distance IS NOT NULL AND gs.shot_distance > 0),
    r.strokes_gained_total, r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting,
    NOW(), NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id AND r.status = 'completed'
  GROUP BY r.id, r.player_id, r.total_score, r.score_to_par, r.front_nine, r.back_nine,
    r.total_fairways_hit, r.total_fairways, r.total_gir, r.total_gir_possible, r.total_putts, r.total_penalties,
    r.strokes_gained_total, r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score, score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine, back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit, fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit, greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts, one_putts = EXCLUDED.one_putts, three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted, scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves, sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles, birdies = EXCLUDED.birdies, pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys, double_bogeys = EXCLUDED.double_bogeys, triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes, driving_distance_avg = EXCLUDED.driving_distance_avg,
    strokes_gained_total = EXCLUDED.strokes_gained_total, strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach, strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting, updated_at = NOW();

  UPDATE golf_player_stats_cache psc
  SET par3_average = sub.par3_avg, par4_average = sub.par4_avg, par5_average = sub.par5_avg, updated_at = NOW()
  FROM (
    SELECT AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
           AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
           AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg
    FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND h.score IS NOT NULL
  ) sub
  WHERE psc.player_id = p_player_id;

  PERFORM update_player_putt_make_pct(p_player_id);

  PERFORM update_player_distance_proximity(p_player_id);

  UPDATE golf_player_stats_cache SET is_stale = false, updated_at = NOW() WHERE player_id = p_player_id;
END;
$function$;

-- Recompute every cached player so penalty_strokes (and the trigger-derived
-- penalty_strokes_per_round) reflect the canonical per-hole source.
DO $$
DECLARE v_pid uuid;
BEGIN
  FOR v_pid IN SELECT player_id FROM golf_player_stats_cache LOOP
    PERFORM public.refresh_player_stats_cache(v_pid);
  END LOOP;
END $$;

-- VERIFIED 2026-06-09 against prod (qmnssrrolpinvwjjnufo):
--   refresh_player_stats_cache prosrc derives penalty_strokes from golf_holes
--   (canonical per-hole sum), no r.total_penalties preference; check:stats 0
--   divergent.
-- HISTORY: recorded as version 20260608005241
--   ('cache_penalty_from_golf_holes_canonical') — apply-time stamp from MCP
--   apply_migration, NOT this filename. Do not re-apply via db push.
-- ROLLBACK: CREATE OR REPLACE refresh_player_stats_cache with the prior
--   definition (COALESCE(r.total_penalties, ...) preference), then mark caches
--   stale so the next refresh rewrites penalty_strokes.
