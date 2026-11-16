-- A round's cached fairways count par 4 and 5 holes only, in the numerator
-- as in the denominator (stats and charts audit 2026-11-15, SC-12).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md).
--
-- WHAT IS WRONG TODAY. update_round_stats_cache writes fairways_hit from the
--   round's total_fairways_hit, and when that is NULL falls back to counting
--   every hole with fairway_hit = true, par 3s included, while fairways_total
--   falls back to par 4 and 5 holes only. A par 3 marked "fairway hit" lifts
--   the numerator and not the denominator, so the rate can pass 100%.
--
-- WHAT CHANGES. The fallback adds par >= 4. Nothing else in the body changes.
--
-- WHAT MOVES. Only cache rows whose round has total_fairways_hit NULL (rounds
--   recompute_golf_round_totals has not touched since it began writing the
--   column, which it always fills), and only when that round's cache next
--   refreshes; there is no backfill. How many could move, read-only:
--   COUNTS: select count(*) from public.golf_rounds r where r.status = 'completed' and r.total_fairways_hit is null and exists (select 1 from public.golf_holes h where h.round_id = r.id and h.par < 4 and h.fairway_hit);
--
-- ORDER. None; the DO guard refuses unless update_round_stats_cache is the
--   live body this file was written on (prosrc md5
--   168f1e542c26d5d39c76bbff8b10cac9), and refuses a second apply.
--
-- ROLLBACK: supabase/rollbacks/20261115231000_golf_round_cache_fairways_par4.rollback.sql
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('public.update_round_stats_cache()') and md5(prosrc) = '81bdb47ae70329fc9ae898251750ca53';

SET LOCAL lock_timeout = '3s';

DO $guard$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.update_round_stats_cache()');
  IF v_src IS NULL OR md5(v_src) <> '168f1e542c26d5d39c76bbff8b10cac9' THEN
    RAISE EXCEPTION 'cache fairways par 4: live update_round_stats_cache() is not the body this file was written on (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION "public"."update_round_stats_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
    -- SC-12 (20261115231000): the fallback counts par 4 and 5 fairways only, as its denominator below does.
    COALESCE(NEW.total_fairways_hit, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND par >= 4 AND fairway_hit = true)),
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
$$;
