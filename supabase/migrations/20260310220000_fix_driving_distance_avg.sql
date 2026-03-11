-- Fix: update_round_stats_cache trigger was never computing driving_distance_avg
-- The column existed in golf_round_stats_cache but the trigger skipped it entirely.
-- This adds the calculation (AVG of tee shot distances) and backfills existing rounds.

CREATE OR REPLACE FUNCTION update_round_stats_cache()
RETURNS TRIGGER AS $$
DECLARE
  v_front_nine INTEGER; v_back_nine INTEGER;
  v_eagles INTEGER; v_birdies INTEGER; v_pars INTEGER;
  v_bogeys INTEGER; v_double_bogeys INTEGER; v_triple_plus INTEGER;
  v_one_putts INTEGER; v_three_putts INTEGER;
  v_scrambles_converted INTEGER; v_scramble_attempts INTEGER;
  v_sand_saves INTEGER; v_sand_attempts INTEGER;
  v_total_putts_from_holes INTEGER; v_total_penalties_from_holes INTEGER;
  v_hole_count INTEGER;
  v_driving_distance_avg NUMERIC;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_hole_count FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Compute driving distance average from tee shot distances
  SELECT AVG(gs.shot_distance)
  INTO v_driving_distance_avg
  FROM golf_shots gs
  JOIN golf_holes gh ON gh.id = gs.hole_id
  WHERE gh.round_id = NEW.id
    AND gs.shot_type = 'tee'
    AND gs.shot_distance IS NOT NULL
    AND gs.shot_distance > 0;

  IF v_hole_count = 0 THEN
    INSERT INTO golf_round_stats_cache (
      round_id, player_id, total_score, score_to_par, front_nine, back_nine,
      fairways_hit, fairways_total, greens_hit, greens_total,
      total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
      sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
      penalty_strokes, driving_distance_avg,
      strokes_gained_total, strokes_gained_tee,
      strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
      created_at, updated_at
    ) VALUES (
      NEW.id, NEW.player_id, NEW.total_score, NEW.score_to_par,
      NEW.front_nine, NEW.back_nine, NEW.total_fairways_hit, NEW.total_fairways,
      NEW.total_gir, NEW.total_gir_possible, NEW.total_putts, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, v_driving_distance_avg,
      NEW.strokes_gained_total, NEW.strokes_gained_tee,
      NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
      NEW.strokes_gained_putting, NOW(), NOW()
    ) ON CONFLICT (round_id) DO UPDATE SET
      total_score = EXCLUDED.total_score, score_to_par = EXCLUDED.score_to_par,
      front_nine = EXCLUDED.front_nine, back_nine = EXCLUDED.back_nine,
      fairways_hit = EXCLUDED.fairways_hit, fairways_total = EXCLUDED.fairways_total,
      greens_hit = EXCLUDED.greens_hit, greens_total = EXCLUDED.greens_total,
      total_putts = EXCLUDED.total_putts,
      driving_distance_avg = EXCLUDED.driving_distance_avg,
      strokes_gained_total = EXCLUDED.strokes_gained_total,
      strokes_gained_tee = EXCLUDED.strokes_gained_tee,
      strokes_gained_approach = EXCLUDED.strokes_gained_approach,
      strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
      strokes_gained_putting = EXCLUDED.strokes_gained_putting, updated_at = NOW();
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hole_number > 9 THEN score ELSE 0 END), 0)
  INTO v_front_nine, v_back_nine FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN (score-par)<=-2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=-1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)>=3 THEN 1 ELSE 0 END),0)
  INTO v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN putts=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN putts>=3 THEN 1 ELSE 0 END),0), COALESCE(SUM(putts),0)
  INTO v_one_putts, v_three_putts, v_total_putts_from_holes
  FROM golf_holes WHERE round_id = NEW.id AND putts IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN gir=false AND (score-par)<=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN sand_save=true THEN 1 ELSE 0 END),0),
    COALESCE(COUNT(*) FILTER (WHERE sand_save IS NOT NULL),0)
  INTO v_sand_saves, v_sand_attempts FROM golf_holes WHERE round_id = NEW.id;

  SELECT COALESCE(SUM(COALESCE(penalty_strokes,0)),0) INTO v_total_penalties_from_holes
  FROM golf_holes WHERE round_id = NEW.id;

  INSERT INTO golf_round_stats_cache (
    round_id, player_id, total_score, score_to_par, front_nine, back_nine,
    fairways_hit, fairways_total, greens_hit, greens_total,
    total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes, driving_distance_avg,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.player_id,
    COALESCE(NEW.total_score, v_front_nine + v_back_nine),
    COALESCE(NEW.score_to_par, (v_front_nine + v_back_nine) - (SELECT COALESCE(SUM(par),0) FROM golf_holes WHERE round_id = NEW.id)),
    v_front_nine, v_back_nine,
    COALESCE(NEW.total_fairways_hit, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND fairway_hit = true)),
    COALESCE(NEW.total_fairways, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND par > 3 AND fairway_hit IS NOT NULL)),
    COALESCE(NEW.total_gir, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND gir = true)),
    COALESCE(NEW.total_gir_possible, v_hole_count),
    COALESCE(NEW.total_putts, v_total_putts_from_holes),
    v_one_putts, v_three_putts, v_scrambles_converted, v_scramble_attempts,
    v_sand_saves, v_sand_attempts,
    v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus,
    v_total_penalties_from_holes, v_driving_distance_avg,
    NEW.strokes_gained_total, NEW.strokes_gained_tee,
    NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
    NEW.strokes_gained_putting, NOW(), NOW()
  ) ON CONFLICT (round_id) DO UPDATE SET
    total_score=EXCLUDED.total_score, score_to_par=EXCLUDED.score_to_par,
    front_nine=EXCLUDED.front_nine, back_nine=EXCLUDED.back_nine,
    fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    total_putts=EXCLUDED.total_putts, one_putts=EXCLUDED.one_putts, three_putts=EXCLUDED.three_putts,
    scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars,
    bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    penalty_strokes=EXCLUDED.penalty_strokes,
    driving_distance_avg=EXCLUDED.driving_distance_avg,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee,
    strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting=EXCLUDED.strokes_gained_putting, updated_at=NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing rounds
UPDATE golf_round_stats_cache rsc
SET driving_distance_avg = sub.avg_dist,
    updated_at = NOW()
FROM (
  SELECT gh.round_id, AVG(gs.shot_distance) as avg_dist
  FROM golf_shots gs
  JOIN golf_holes gh ON gh.id = gs.hole_id
  WHERE gs.shot_type = 'tee'
    AND gs.shot_distance IS NOT NULL
    AND gs.shot_distance > 0
  GROUP BY gh.round_id
) sub
WHERE rsc.round_id = sub.round_id
AND rsc.driving_distance_avg IS NULL;
