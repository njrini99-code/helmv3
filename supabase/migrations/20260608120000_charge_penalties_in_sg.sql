-- Charge penalty strokes -1 in Strokes Gained (telescoping fix).
--
-- Both SG writers previously routed penalty shots to category NULL (CASE WHEN
-- is_penalty THEN NULL ...), so each penalty contributed 0 to SG instead of -1.
-- A penalty is a counted stroke that makes zero progress, so its correct SG
-- contribution is exactly -1.0. Dropping it made SG_total too high (less
-- negative) by the penalty count and broke the invariant SG_total ≈ -(over par);
-- it also disagreed with the TS engine (calculateStatsFromShots), which charges
-- penalties -1 — so the player Stats page and the DB cache showed different SG
-- for the same player.
--
-- Fix: charge each penalty a flat -1 to the OFFENDING category (mirrors TS
-- getPenaltyCategory): tee -> off_tee (unless par 3 -> approach), on/around the
-- green or <=50yd -> around_green, else approach. Implemented by forcing
-- exp_before=0, exp_after=0, has_after=TRUE for penalties so
-- (exp_before - exp_after - 1) = -1. Everything else (the per-team baseline
-- v_scale via sg_scale_for_player, the normalized CTE) is unchanged from
-- 20260607200000.
--
-- Apply to prod via MCP; then recompute every team's SG so the cache reflects it.

CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id UUID; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_scale NUMERIC := 1.0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_scale := sg_scale_for_player(v_player_id);

  SELECT COUNT(*) INTO v_shot_count FROM golf_shots gs
  WHERE gs.round_id = p_round_id AND gs.shot_type IS NOT NULL AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before > 0
    AND (gs.distance_to_hole_after IS NOT NULL OR gs.putt_made = TRUE OR gs.result IN ('holed','hole'));
  IF v_shot_count > 0 THEN
    WITH normalized AS (
      SELECT gs.shot_type, gs.shot_number, gh.par,
        CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
        CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
        (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
          ELSE CASE WHEN LEAD(gs.distance_unit_before) OVER w='feet'
            THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0)/3.0
            ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0) END END AS dist_after_yards,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w) END AS lie_after_norm,
        COALESCE(gs.is_penalty,FALSE) AS is_penalty
      FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
      WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
      WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
    ),
    categorized AS (
      SELECT CASE
               WHEN is_penalty THEN
                 CASE WHEN lie_before_norm='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                      WHEN lie_before_norm='green' THEN 'around_green'
                      WHEN dist_before_yards<=50 THEN 'around_green'
                      ELSE 'approach' END
               WHEN shot_type='putting' THEN 'putting'
               WHEN shot_type='tee' THEN 'off_tee'
               WHEN shot_type='around_green' THEN 'around_green'
               ELSE 'approach' END AS category,
        CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
        CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
        CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
      FROM normalized WHERE dist_before_yards>0
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM categorized;
  ELSE
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM sg_estimate_from_holes(p_round_id);
  END IF;
  v_sg_total := ROUND((COALESCE(v_sg_off_tee,0)+COALESCE(v_sg_approach,0)+COALESCE(v_sg_around,0)+COALESCE(v_sg_putting,0))::NUMERIC,3);
  INSERT INTO golf_round_stats_cache (id, round_id, player_id, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, created_at, updated_at)
  SELECT gen_random_uuid(), p_round_id, v_player_id, v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM golf_round_stats_cache WHERE round_id=p_round_id);
  UPDATE golf_round_stats_cache SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around,
    strokes_gained_putting=v_sg_putting, updated_at=now() WHERE round_id=p_round_id;
  UPDATE golf_rounds SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around, strokes_gained_putting=v_sg_putting
  WHERE id=p_round_id AND (
    strokes_gained_total IS DISTINCT FROM v_sg_total OR strokes_gained_tee IS DISTINCT FROM v_sg_off_tee
    OR strokes_gained_approach IS DISTINCT FROM v_sg_approach OR strokes_gained_around_green IS DISTINCT FROM v_sg_around
    OR strokes_gained_putting IS DISTINCT FROM v_sg_putting);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid)
 RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
  v_player_id UUID; v_scale NUMERIC := 1.0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  v_scale := sg_scale_for_player(v_player_id);

  WITH normalized AS (
    SELECT gs.shot_type, gs.shot_number, gh.par,
      CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
      CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
      (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
        WHEN gs.distance_to_hole_after IS NOT NULL THEN
          CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
        ELSE CASE WHEN LEAD(gs.distance_unit_before) OVER w='feet'
          THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0)/3.0
          ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0) END END AS dist_after_yards,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
        WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
        ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w) END AS lie_after_norm,
      COALESCE(gs.is_penalty,FALSE) AS is_penalty
    FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
    WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
      AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
    WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
  ),
  categorized AS (
    SELECT CASE
             WHEN is_penalty THEN
               CASE WHEN lie_before_norm='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                    WHEN lie_before_norm='green' THEN 'around_green'
                    WHEN dist_before_yards<=50 THEN 'around_green'
                    ELSE 'approach' END
             WHEN shot_type='putting' THEN 'putting'
             WHEN shot_type='tee' THEN 'off_tee'
             WHEN shot_type='around_green' THEN 'around_green'
             ELSE 'approach' END AS category,
      CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
      CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
      CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
    FROM normalized WHERE dist_before_yards>0
  )
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
  INTO v_off_tee, v_approach, v_around, v_putting FROM categorized;

  sg_tee := v_off_tee; sg_approach := v_approach; sg_around_green := v_around; sg_putting := v_putting;
  sg_total := ROUND((COALESCE(v_off_tee,0)+COALESCE(v_approach,0)+COALESCE(v_around,0)+COALESCE(v_putting,0))::NUMERIC,3);
  RETURN NEXT;
END;
$function$;
