-- Stats accuracy audit 2026-06-09 (write-path findings W1 + W8-partial).
--
-- 1) up_and_down_percentage: the column has existed since baseline and is READ
--    by player-fingerprint (src/app/golf/actions/player-fingerprint.ts), but NO
--    writer ever populated it — 0 non-null cache rows against 1,133
--    golf_holes.up_and_down source rows on prod at audit time. Both player-cache
--    writers now compute it from the canonical per-hole flag:
--      up_and_down_percentage = 100 × COUNT(up_and_down IS TRUE)
--                                   ÷ COUNT(up_and_down IS NOT NULL)
--    (NULL when no attempts recorded — null-honest, no fabrication.)
--    Note this is intentionally DISTINCT from scrambling_percentage, which is
--    derived (gir=false AND score<=par); up_and_down is the player-entered
--    save flag from round entry (hole.scrambleAttempt ? scrambleMade : null).
--
-- 2) trg_update_round_stats_cache UPDATE OF list: round_date and holes_played
--    were missing, so a direct PATCH to either (PostgREST table-wide UPDATE
--    grant, 20260607120000) changed ordering-sensitive player stats
--    (last_round_date, last_5/last_10 windows, season counts, putts-per-18
--    denominators) without any cache recompute. Both columns now fire the
--    cascade.
--
-- APPLY: via MCP apply_migration (apply-time version stamp, NOT this filename).
-- ROLLBACK: re-CREATE both functions from 20260608140000 / baseline and
--   re-create the trigger without the two extra columns.

-- ---------------------------------------------------------------------------
-- (1a) Trigger-path writer: golf_round_stats_cache → golf_player_stats_cache
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_player_stats_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER; v_total_score NUMERIC; v_total_score_to_par NUMERIC;
  v_best_round INTEGER; v_worst_round INTEGER;
  v_total_eagles INTEGER; v_total_birdies INTEGER; v_total_pars INTEGER;
  v_total_bogeys INTEGER; v_total_double_bogeys INTEGER; v_total_triple_plus INTEGER;
  v_total_fairways_hit INTEGER; v_total_fairways INTEGER;
  v_total_greens_hit INTEGER; v_total_greens INTEGER;
  v_total_scrambles_converted INTEGER; v_total_scramble_attempts INTEGER;
  v_total_sand_saves INTEGER; v_total_sand_attempts INTEGER;
  v_total_putts INTEGER; v_total_one_putts INTEGER; v_total_three_putts INTEGER;
  v_total_penalties INTEGER;
  v_driving_accuracy NUMERIC(5,2); v_gir_percentage NUMERIC(5,2);
  v_scrambling_percentage NUMERIC(5,2); v_sand_save_percentage NUMERIC(5,2);
  v_putts_per_round NUMERIC(4,2); v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2); v_three_putt_percentage NUMERIC(5,2);
  v_penalty_per_round NUMERIC(4,2);
  v_scoring_average NUMERIC(5,2); v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round_normalized NUMERIC(5,2); v_worst_round_normalized NUMERIC(5,2);
  v_first_round_date DATE; v_last_round_date DATE;
  v_par3_average NUMERIC(4,2); v_par4_average NUMERIC(4,2); v_par5_average NUMERIC(4,2);
  v_up_down_made INTEGER; v_up_down_attempts INTEGER; v_up_and_down_pct NUMERIC(5,2);
  v_rounds_18 INTEGER; v_total_score_18 NUMERIC; v_score_to_par_18 NUMERIC;
  v_last_5_avg NUMERIC(5,2); v_last_10_avg NUMERIC(5,2); v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2); v_trend TEXT;
  v_round_ids UUID[]; v_season_start DATE; v_rounds_this_season INTEGER;
  v_sg_total_avg NUMERIC; v_sg_tee_avg NUMERIC; v_sg_approach_avg NUMERIC;
  v_sg_ag_avg NUMERIC; v_sg_putting_avg NUMERIC;
  v_sg_total_sum NUMERIC; v_sg_tee_sum NUMERIC; v_sg_approach_sum NUMERIC;
  v_sg_ag_sum NUMERIC; v_sg_putting_sum NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN v_player_id := OLD.player_id; ELSE v_player_id := NEW.player_id; END IF;

  SELECT COUNT(*), SUM(total_score), SUM(score_to_par), MIN(total_score), MAX(total_score),
    SUM(eagles), SUM(birdies), SUM(pars), SUM(bogeys), SUM(double_bogeys), SUM(triple_plus),
    SUM(fairways_hit), SUM(fairways_total), SUM(greens_hit), SUM(greens_total),
    SUM(scrambles_converted), SUM(scramble_attempts), SUM(sand_saves), SUM(sand_attempts),
    SUM(total_putts), SUM(one_putts), SUM(three_putts), SUM(penalty_strokes)
  INTO v_rounds_played, v_total_score, v_total_score_to_par, v_best_round, v_worst_round,
    v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_total_fairways_hit, v_total_fairways, v_total_greens_hit, v_total_greens,
    v_total_scrambles_converted, v_total_scramble_attempts, v_total_sand_saves, v_total_sand_attempts,
    v_total_putts, v_total_one_putts, v_total_three_putts, v_total_penalties
  FROM golf_round_stats_cache WHERE player_id = v_player_id;

  SELECT MIN(round_date), MAX(round_date) INTO v_first_round_date, v_last_round_date
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT AVG(CASE WHEN par=3 THEN score END), AVG(CASE WHEN par=4 THEN score END), AVG(CASE WHEN par=5 THEN score END),
         COUNT(*) FILTER (WHERE h.up_and_down IS TRUE), COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL)
  INTO v_par3_average, v_par4_average, v_par5_average, v_up_down_made, v_up_down_attempts
  FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  IF v_up_down_attempts > 0 THEN
    v_up_and_down_pct := (v_up_down_made::NUMERIC / v_up_down_attempts) * 100;
  END IF;

  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0) INTO v_total_holes
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par) INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed'
    AND r.total_score IS NOT NULL AND COALESCE(r.holes_played, 18) = 18;

  IF v_total_fairways > 0 THEN v_driving_accuracy := (v_total_fairways_hit::NUMERIC / v_total_fairways) * 100; END IF;
  IF v_total_greens > 0 THEN v_gir_percentage := (v_total_greens_hit::NUMERIC / v_total_greens) * 100; END IF;
  IF v_total_scramble_attempts > 0 THEN v_scrambling_percentage := (v_total_scrambles_converted::NUMERIC / v_total_scramble_attempts) * 100; END IF;
  IF v_total_sand_attempts > 0 THEN v_sand_save_percentage := (v_total_sand_saves::NUMERIC / v_total_sand_attempts) * 100; END IF;
  IF v_rounds_18 > 0 THEN v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18; v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18; END IF;
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  SELECT MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))), MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL;

  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Enhanced stats
  v_season_start := make_date(CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER END, 8, 1);
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC) INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id WHERE rsc.player_id = v_player_id AND r.round_date >= v_season_start;

  SELECT AVG(r.total_score) INTO v_last_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5) r;
  SELECT AVG(r.total_score) INTO v_last_10_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 10) r;
  SELECT AVG(r.total_score) INTO v_prev_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5 OFFSET 5) r;

  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    v_trend := CASE WHEN v_improvement > 1.0 THEN 'improving' WHEN v_improvement < -1.0 THEN 'declining' ELSE 'stable' END;
  ELSE v_improvement := NULL; v_trend := 'stable'; END IF;

  -- Strokes gained
  SELECT AVG(strokes_gained_total), AVG(strokes_gained_tee), AVG(strokes_gained_approach), AVG(strokes_gained_around_green), AVG(strokes_gained_putting),
    SUM(strokes_gained_total), SUM(strokes_gained_tee), SUM(strokes_gained_approach), SUM(strokes_gained_around_green), SUM(strokes_gained_putting)
  INTO v_sg_total_avg, v_sg_tee_avg, v_sg_approach_avg, v_sg_ag_avg, v_sg_putting_avg, v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum
  FROM golf_round_stats_cache WHERE player_id = v_player_id AND strokes_gained_total IS NOT NULL;

  INSERT INTO golf_player_stats_cache (player_id, scoring_average, scoring_average_vs_par, rounds_played, best_round, worst_round,
    par3_average, par4_average, par5_average, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    driving_accuracy_percentage, fairways_hit, fairways_total, gir_percentage, greens_hit, greens_total,
    scrambling_percentage, scrambles_converted, scramble_attempts, sand_save_percentage, sand_saves, sand_attempts,
    putts_per_round, one_putt_percentage, three_putt_percentage, total_putts, penalty_strokes_per_round, total_penalties,
    up_and_down_percentage,
    last_round_date, rounds_in_calculation, calculation_period_start, calculation_period_end,
    last_5_average, last_10_average, improvement_trend, trend_direction, rounds_this_season, season_start_date, round_ids_included,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round,
    is_stale, next_refresh_due, created_at, updated_at
  ) VALUES (
    v_player_id, v_scoring_average, v_scoring_average_vs_par, v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round), COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
    v_par3_average, v_par4_average, v_par5_average, v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_driving_accuracy, v_total_fairways_hit, v_total_fairways, v_gir_percentage, v_total_greens_hit, v_total_greens,
    v_scrambling_percentage, v_total_scrambles_converted, v_total_scramble_attempts, v_sand_save_percentage, v_total_sand_saves, v_total_sand_attempts,
    v_putts_per_round, v_one_putt_percentage, v_three_putt_percentage, v_total_putts, v_penalty_per_round, v_total_penalties,
    v_up_and_down_pct,
    v_last_round_date, v_rounds_played, v_first_round_date, v_last_round_date,
    v_last_5_avg, v_last_10_avg, v_improvement, v_trend, v_rounds_this_season, v_season_start, v_round_ids,
    v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum,
    ROUND(v_sg_total_avg, 2), ROUND(v_sg_tee_avg, 2), ROUND(v_sg_approach_avg, 2), ROUND(v_sg_ag_avg, 2), ROUND(v_sg_putting_avg, 2),
    FALSE, NOW() + INTERVAL '1 hour', NOW(), NOW()
  ) ON CONFLICT (player_id) DO UPDATE SET
    scoring_average=EXCLUDED.scoring_average, scoring_average_vs_par=EXCLUDED.scoring_average_vs_par,
    rounds_played=EXCLUDED.rounds_played, best_round=EXCLUDED.best_round, worst_round=EXCLUDED.worst_round,
    par3_average=EXCLUDED.par3_average, par4_average=EXCLUDED.par4_average, par5_average=EXCLUDED.par5_average,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars, bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    driving_accuracy_percentage=EXCLUDED.driving_accuracy_percentage, fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    gir_percentage=EXCLUDED.gir_percentage, greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    scrambling_percentage=EXCLUDED.scrambling_percentage, scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_save_percentage=EXCLUDED.sand_save_percentage, sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    putts_per_round=EXCLUDED.putts_per_round, one_putt_percentage=EXCLUDED.one_putt_percentage, three_putt_percentage=EXCLUDED.three_putt_percentage,
    total_putts=EXCLUDED.total_putts, penalty_strokes_per_round=EXCLUDED.penalty_strokes_per_round, total_penalties=EXCLUDED.total_penalties,
    up_and_down_percentage=EXCLUDED.up_and_down_percentage,
    last_round_date=EXCLUDED.last_round_date, rounds_in_calculation=EXCLUDED.rounds_in_calculation,
    calculation_period_start=EXCLUDED.calculation_period_start, calculation_period_end=EXCLUDED.calculation_period_end,
    last_5_average=EXCLUDED.last_5_average, last_10_average=EXCLUDED.last_10_average, improvement_trend=EXCLUDED.improvement_trend, trend_direction=EXCLUDED.trend_direction,
    rounds_this_season=EXCLUDED.rounds_this_season, season_start_date=EXCLUDED.season_start_date, round_ids_included=EXCLUDED.round_ids_included,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee, strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green, strokes_gained_putting=EXCLUDED.strokes_gained_putting,
    sg_total_per_round=EXCLUDED.sg_total_per_round, sg_tee_per_round=EXCLUDED.sg_tee_per_round, sg_approach_per_round=EXCLUDED.sg_approach_per_round,
    sg_around_green_per_round=EXCLUDED.sg_around_green_per_round, sg_putting_per_round=EXCLUDED.sg_putting_per_round,
    is_stale=FALSE, next_refresh_due=NOW()+INTERVAL '1 hour', updated_at=NOW();

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_player_stats_complete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_player_stats_complete() TO service_role;

-- ---------------------------------------------------------------------------
-- (1b) Full-refresh writer: add up_and_down_percentage to the golf_holes pass
-- ---------------------------------------------------------------------------
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
  SET par3_average = sub.par3_avg, par4_average = sub.par4_avg, par5_average = sub.par5_avg,
      up_and_down_percentage = sub.ud_pct, updated_at = NOW()
  FROM (
    SELECT AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
           AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
           AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg,
           CASE WHEN COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL) > 0
                THEN 100.0 * COUNT(*) FILTER (WHERE h.up_and_down IS TRUE)
                     / COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL)
           END AS ud_pct
    FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed'
  ) sub
  WHERE psc.player_id = p_player_id;

  PERFORM update_player_putt_make_pct(p_player_id);

  PERFORM update_player_distance_proximity(p_player_id);

  UPDATE golf_player_stats_cache SET is_stale = false, updated_at = NOW() WHERE player_id = p_player_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_player_stats_cache(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_player_stats_cache(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- (2) Fire the cache cascade when round_date or holes_played change
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_update_round_stats_cache ON public.golf_rounds;
CREATE TRIGGER trg_update_round_stats_cache
  AFTER INSERT OR UPDATE OF status, total_score, score_to_par, total_putts,
    total_fairways_hit, total_fairways, total_gir, total_gir_possible,
    round_date, holes_played
  ON public.golf_rounds
  FOR EACH ROW
  WHEN (new.status = 'completed'::text)
  EXECUTE FUNCTION update_round_stats_cache();
