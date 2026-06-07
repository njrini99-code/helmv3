-- STAGE 2 wiring: refresh_player_stats_cache() now calls update_player_putt_make_pct()
-- so the per-band putt make% columns stay fresh on every cache refresh (round
-- complete / edit / delete), instead of remaining NULL. Only the trailing
-- PERFORM line is new; the rest is the existing function body verbatim.

CREATE OR REPLACE FUNCTION public.refresh_player_stats_cache(p_player_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    COALESCE(r.total_penalties, SUM(COALESCE(h.penalty_strokes, 0))),
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

  -- STAGE 2: populate per-band putt make% (was previously never computed -> NULL).
  PERFORM update_player_putt_make_pct(p_player_id);

  UPDATE golf_player_stats_cache SET is_stale = false, updated_at = NOW() WHERE player_id = p_player_id;
END;
$function$;
