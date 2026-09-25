-- W13 / OD-01 (GolfHelm UI/UX audit, 2026-09-24): the countable-round rule
-- in the database caches. AWAITING OWNER APPLY. Do not apply without the
-- owner's go-ahead (owner decision OD-01: "write it, reviewed, do not apply").
--
-- Why. src/lib/golf/round-countable.ts (isCountableRound) decides which
-- completed rounds feed averages, bests, trends, SG and percentiles in the
-- TypeScript loaders. The database caches did not apply it, so a cached
-- number and a TS-computed number for the same player disagreed (Cole 72.6
-- vs 74.4; Sep 17 round 91301a75, 37 strokes over "18 holes", SG +34.51,
-- sat in best_round, SG and trend). This migration adds the SQL copy of the
-- rule and applies it wherever these functions read golf_rounds:
--
--   golf_round_is_countable(...)          new, IMMUTABLE, pure; the rule.
--   golf_round_canonical_total(...)       new, IMMUTABLE; deriveRoundTotal.
--   update_player_stats_complete()        trigger on golf_round_stats_cache:
--       every aggregate (rsc sums, first/last date, par averages and
--       up-and-down, holes denominator, 18-hole scoring average and to par,
--       best/worst, last-5/10/prev-5 trend, season count, SG) reads
--       countable rounds only. Totals use the hole-summed canonical total.
--       The putts/penalty denominator is now the holes of the SAME rounds
--       the numerators sum (countable rounds that have an rsc row); before,
--       it counted every completed round, with or without an rsc row.
--   update_player_stats_strokes_gained()  same SG columns; countable only,
--       otherwise it would re-write the unfiltered SG after the trigger.
--   refresh_player_stats_cache()          par / up-and-down UPDATE only.
--   refresh_player_standing_round_metrics() pressure gap and opening-hole
--       gap read countable rounds only.
--
-- golf_round_stats_cache keeps one row per completed round (it is per-round
-- data and the round detail reads it); only the player-level aggregates
-- filter. Function signatures, owners, SECURITY DEFINER and grants are
-- unchanged (CREATE OR REPLACE keeps ACLs). Bodies are the production
-- bodies (md5 of prosrc matched supabase/schemas/functions/public.sql on
-- 2026-09-24) with only the filters above changed.
--
-- Reviewer notes:
--   * trg_update_round_stats_cache fires on UPDATE OF status, total_score,
--     score_to_par, total_putts, ..., holes_played. front_nine, back_nine
--     and strokes_gained_total are NOT in that list, so an edit to only
--     those columns does not refresh the caches until the next refresh.
--     Deliberately not widened here.
--   * Not covered (follow-ups): update_player_putt_make_pct and
--     update_player_distance_proximity (called from refresh_player_stats_cache)
--     still read every completed round; refresh_player_standing (shot-level
--     standings) and the genome z-score inputs are unchanged.
--
-- Read-only production sizing (2026-09-24): 654 completed rounds; 634
-- countable under the OLD two-sided SG rule; 20 excluded: 1 implausible_score (91301a75), 4 holes_missing
-- (0b000000-prefixed hole-less seed rounds, total 70–78), 15 implausible_sg.
-- NOTE on the 15: all 15 are REAL high-scoring 18-hole rounds (82–95
-- strokes, +10 to +23, SG −15.6 to −24.1) that the old two-sided ±15 SG
-- ceiling dropped. The TS rule is changed in the same change set to a
-- one-sided +15 ceiling, and this SQL mirrors the one-sided rule, so those
-- 15 rounds COUNT. With the one-sided rule only 91301a75 and the 4
-- hole-less rounds are excluded (plus any SG > +15 round; none today besides
-- 91301a75, which the stroke floor already catches).
--
-- After apply (owner, service role), refresh every player cache and every
-- team's standings so existing rows pick up the rule:
--   SELECT public.refresh_player_stats_cache(p.id)
--     FROM public.golf_players p
--    WHERE EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.player_id = p.id AND r.status = 'completed');
--   SELECT public.refresh_player_standing_round_metrics(ARRAY(SELECT id FROM public.golf_teams));
--
-- ROLLBACK: ORDER MATTERS. First CREATE OR REPLACE the four functions with their previous bodies (supabase/schemas/functions/public.sql at commit d86220d81, which equal production on 2026-09-24), and only then DROP FUNCTION public.golf_round_is_countable(text, integer, integer, integer, integer, integer, numeric); DROP FUNCTION public.golf_round_canonical_total(integer, integer, integer); -- dropping the helpers first would break every write to golf_round_stats_cache (plpgsql records no dependency)
-- VERIFY: select 1 where public.golf_round_is_countable('completed', 18, 74, 37, 37, 32, -1.2) and not public.golf_round_is_countable('completed', 18, 37, 19, 18, 18, 34.51) and public.golf_round_is_countable('completed', 18, 88, 49, 39, 34, -18.77);
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_player_stats_complete' and p.prosrc like '%golf_round_is_countable%';
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_standing_round_metrics' and p.prosrc like '%golf_round_is_countable%';
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_player_stats_strokes_gained' and p.prosrc like '%golf_round_is_countable%';
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refresh_player_stats_cache' and p.prosrc like '%golf_round_is_countable%';

CREATE OR REPLACE FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  -- Mirrors deriveRoundTotal (src/lib/golf/round-total.ts): the hole-summed
  -- front + back nine when both exist, else the stored total.
  SELECT CASE
    WHEN p_front_nine IS NOT NULL AND p_back_nine IS NOT NULL THEN p_front_nine + p_back_nine
    ELSE p_total_score
  END;
$$;

ALTER FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) IS 'W13 / OD-01 (2026-09-24). Mirrors deriveRoundTotal in src/lib/golf/round-total.ts: front_nine + back_nine when both are set, else total_score.';

CREATE OR REPLACE FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  -- Mirrors isCountableRound / roundExclusionReason in
  -- src/lib/golf/round-countable.ts, rule for rule:
  --   not_completed      status <> 'completed'
  --   unsupported_length holes (default 18) not 9 or 18
  --   holes_missing      9 per non-null nine <> holes
  --   implausible_score  canonical total null, or below
  --                      max(ceil(holes * 50 / 18), holes + max(putts, 0))
  --   implausible_sg     SG: Total above +15 (one-sided; a bad real round
  --                      has a large NEGATIVE SG)
  WITH x AS (
    SELECT
      COALESCE(p_holes_played, 18) AS holes,
      (CASE WHEN p_front_nine IS NOT NULL THEN 9 ELSE 0 END)
        + (CASE WHEN p_back_nine IS NOT NULL THEN 9 ELSE 0 END) AS recorded,
      CASE
        WHEN p_front_nine IS NOT NULL AND p_back_nine IS NOT NULL THEN p_front_nine + p_back_nine
        ELSE p_total_score
      END AS total
  )
  SELECT
    p_status IS NOT DISTINCT FROM 'completed'
    AND x.holes IN (9, 18)
    AND x.recorded = x.holes
    AND x.total IS NOT NULL
    AND x.total >= GREATEST(CEIL(x.holes * 50.0 / 18)::integer, x.holes + GREATEST(COALESCE(p_total_putts, 0), 0))
    -- NaN sorts above every number in Postgres; the TS rule ignores a
    -- non-finite SG, so NaN must not exclude the round here either.
    AND NOT COALESCE(p_strokes_gained_total > 15 AND p_strokes_gained_total <> 'NaN'::numeric, false)
  FROM x;
$$;

ALTER FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) IS 'W13 / OD-01 (2026-09-24). The DB copy of isCountableRound (src/lib/golf/round-countable.ts). Keep the two in step; supabase/tests/rls/golf_round_is_countable.sql pins the shared cases.';

CREATE OR REPLACE FUNCTION "public"."update_player_stats_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- W13 / OD-01: only COUNTABLE rounds feed the player cache (mirrors
  -- isCountableRound in src/lib/golf/round-countable.ts). Columns are
  -- rsc-qualified because golf_rounds shares several names.
  SELECT COUNT(*), SUM(rsc.total_score), SUM(rsc.score_to_par), MIN(rsc.total_score), MAX(rsc.total_score),
    SUM(rsc.eagles), SUM(rsc.birdies), SUM(rsc.pars), SUM(rsc.bogeys), SUM(rsc.double_bogeys), SUM(rsc.triple_plus),
    SUM(rsc.fairways_hit), SUM(rsc.fairways_total), SUM(rsc.greens_hit), SUM(rsc.greens_total),
    SUM(rsc.scrambles_converted), SUM(rsc.scramble_attempts), SUM(rsc.sand_saves), SUM(rsc.sand_attempts),
    SUM(rsc.total_putts), SUM(rsc.one_putts), SUM(rsc.three_putts), SUM(rsc.penalty_strokes)
  INTO v_rounds_played, v_total_score, v_total_score_to_par, v_best_round, v_worst_round,
    v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_total_fairways_hit, v_total_fairways, v_total_greens_hit, v_total_greens,
    v_total_scrambles_converted, v_total_scramble_attempts, v_total_sand_saves, v_total_sand_attempts,
    v_total_putts, v_total_one_putts, v_total_three_putts, v_total_penalties
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total);

  SELECT MIN(r.round_date), MAX(r.round_date) INTO v_first_round_date, v_last_round_date
  FROM golf_rounds r WHERE r.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total);

  SELECT AVG(CASE WHEN par=3 THEN score END), AVG(CASE WHEN par=4 THEN score END), AVG(CASE WHEN par=5 THEN score END),
         COUNT(*) FILTER (WHERE h.up_and_down IS TRUE), COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL)
  INTO v_par3_average, v_par4_average, v_par5_average, v_up_down_made, v_up_down_attempts
  FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total);

  IF v_up_down_attempts > 0 THEN
    v_up_and_down_pct := (v_up_down_made::NUMERIC / v_up_down_attempts) * 100;
  END IF;

  -- Putts/penalty denominator: holes of the SAME rounds the numerators sum
  -- (countable rounds that have a golf_round_stats_cache row).
  SELECT COALESCE(SUM(COALESCE(r.holes_played, 18)), 0) INTO v_total_holes
  FROM golf_rounds r WHERE r.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
    AND EXISTS (SELECT 1 FROM golf_round_stats_cache rsc WHERE rsc.round_id = r.id);

  -- Hole-summed totals (src/lib/golf/round-total.ts deriveRoundTotal /
  -- deriveScoreToPar), same as every TS surface.
  SELECT COUNT(*), SUM(public.golf_round_canonical_total(r.total_score, r.front_nine, r.back_nine)), SUM(r.score_to_par + (public.golf_round_canonical_total(r.total_score, r.front_nine, r.back_nine) - r.total_score))
  INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r WHERE r.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
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

  SELECT MIN(public.golf_round_canonical_total(r.total_score, r.front_nine, r.back_nine) * (18.0 / COALESCE(r.holes_played, 18))), MAX(public.golf_round_canonical_total(r.total_score, r.front_nine, r.back_nine) * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r WHERE r.player_id = v_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total) AND r.total_score IS NOT NULL;

  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Enhanced stats
  v_season_start := make_date(CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER END, 8, 1);
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC) INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id WHERE rsc.player_id = v_player_id AND r.round_date >= v_season_start AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total);

  SELECT AVG(r.total_score) INTO v_last_5_avg FROM (SELECT public.golf_round_canonical_total(r2.total_score, r2.front_nine, r2.back_nine) AS total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND public.golf_round_is_countable(r2.status, r2.holes_played, r2.total_score, r2.front_nine, r2.back_nine, r2.total_putts, r2.strokes_gained_total) AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5) r;
  SELECT AVG(r.total_score) INTO v_last_10_avg FROM (SELECT public.golf_round_canonical_total(r2.total_score, r2.front_nine, r2.back_nine) AS total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND public.golf_round_is_countable(r2.status, r2.holes_played, r2.total_score, r2.front_nine, r2.back_nine, r2.total_putts, r2.strokes_gained_total) AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 10) r;
  SELECT AVG(r.total_score) INTO v_prev_5_avg FROM (SELECT public.golf_round_canonical_total(r2.total_score, r2.front_nine, r2.back_nine) AS total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND public.golf_round_is_countable(r2.status, r2.holes_played, r2.total_score, r2.front_nine, r2.back_nine, r2.total_putts, r2.strokes_gained_total) AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5 OFFSET 5) r;

  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    v_trend := CASE WHEN v_improvement > 1.0 THEN 'improving' WHEN v_improvement < -1.0 THEN 'declining' ELSE 'stable' END;
  ELSE v_improvement := NULL; v_trend := 'stable'; END IF;

  -- Strokes gained
  SELECT AVG(rsc.strokes_gained_total), AVG(rsc.strokes_gained_tee), AVG(rsc.strokes_gained_approach), AVG(rsc.strokes_gained_around_green), AVG(rsc.strokes_gained_putting),
    SUM(rsc.strokes_gained_total), SUM(rsc.strokes_gained_tee), SUM(rsc.strokes_gained_approach), SUM(rsc.strokes_gained_around_green), SUM(rsc.strokes_gained_putting)
  INTO v_sg_total_avg, v_sg_tee_avg, v_sg_approach_avg, v_sg_ag_avg, v_sg_putting_avg, v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id AND rsc.strokes_gained_total IS NOT NULL AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total);

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
$$;

CREATE OR REPLACE FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count          INTEGER;
  v_sg_total       NUMERIC;
  v_sg_tee         NUMERIC;
  v_sg_approach    NUMERIC;
  v_sg_around      NUMERIC;
  v_sg_putting     NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    SUM(rsc.strokes_gained_total),
    SUM(rsc.strokes_gained_tee),
    SUM(rsc.strokes_gained_approach),
    SUM(rsc.strokes_gained_around_green),
    SUM(rsc.strokes_gained_putting)
  INTO v_count, v_sg_total, v_sg_tee, v_sg_approach, v_sg_around, v_sg_putting
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id    = p_player_id
    AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
    AND rsc.strokes_gained_total IS NOT NULL;

  IF v_count = 0 THEN RETURN; END IF;

  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total        = ROUND(v_sg_total::NUMERIC,    3),
    strokes_gained_tee          = ROUND(v_sg_tee::NUMERIC,      3),
    strokes_gained_approach     = ROUND(v_sg_approach::NUMERIC, 3),
    strokes_gained_around_green = ROUND(v_sg_around::NUMERIC,   3),
    strokes_gained_putting      = ROUND(v_sg_putting::NUMERIC,  3),
    sg_total_per_round          = ROUND((v_sg_total    / v_count)::NUMERIC, 3),
    sg_tee_per_round            = ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
    sg_approach_per_round       = ROUND((v_sg_approach / v_count)::NUMERIC, 3),
    sg_around_green_per_round   = ROUND((v_sg_around   / v_count)::NUMERIC, 3),
    sg_putting_per_round        = ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
    updated_at                  = now()
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO golf_player_stats_cache (
      id, player_id,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting,
      sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
      sg_around_green_per_round, sg_putting_per_round,
      rounds_played, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_player_id,
      ROUND(v_sg_total::NUMERIC,    3),
      ROUND(v_sg_tee::NUMERIC,      3),
      ROUND(v_sg_approach::NUMERIC, 3),
      ROUND(v_sg_around::NUMERIC,   3),
      ROUND(v_sg_putting::NUMERIC,  3),
      ROUND((v_sg_total    / v_count)::NUMERIC, 3),
      ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
      ROUND((v_sg_approach / v_count)::NUMERIC, 3),
      ROUND((v_sg_around   / v_count)::NUMERIC, 3),
      ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
      v_count, now(), now()
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    WHERE r.player_id = p_player_id AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
  ) sub
  WHERE psc.player_id = p_player_id;

  PERFORM update_player_putt_make_pct(p_player_id);

  PERFORM update_player_distance_proximity(p_player_id);

  UPDATE golf_player_stats_cache SET is_stale = false, updated_at = NOW() WHERE player_id = p_player_id;
END;
$$;

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
     AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
    HAVING
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
       AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) >= 3
        AND COUNT(*) FILTER (WHERE r.round_type = 'practice') >= 3
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

-- Pure helpers: callable by authenticated because update_player_stats_strokes_gained
-- is SECURITY INVOKER and reached over RPC; no anon/PUBLIC access.
REVOKE ALL ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) TO "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) TO "authenticated", "service_role";
