-- Converge the legacy calculate_round_strokes_gained (RETURNS TABLE) with the
-- canonical recalculate_round_strokes_gained. The legacy fn is NOT dead code: it
-- is called by the BEFORE-UPDATE trigger calculate_strokes_gained_on_round_complete
-- (fires when a round's status flips to 'completed' and sets NEW.strokes_gained_*).
-- It previously skipped sg_normalize_lie (so 'bunker'/'greenside_bunker' fell through
-- to the fairway baseline) and used a fragile distance_after=0 holed check, so newly
-- completed rounds got SG that diverged from recalculate. Now both share identical
-- per-shot logic (normalized lies, unit-converted putts, holed detection, shot_type
-- categorization, LEAD fallback) — verified equal to storage precision on the demo
-- player's 15 rounds. (submit_round_atomic already calls recalculate directly.)

CREATE OR REPLACE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid)
 RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
BEGIN
  WITH normalized AS (
    SELECT gs.shot_type, gs.shot_number,
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
    FROM golf_shots gs
    WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
      AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
    WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
  ),
  categorized AS (
    SELECT CASE WHEN is_penalty THEN NULL WHEN shot_type='putting' THEN 'putting'
                WHEN shot_type='tee' THEN 'off_tee' WHEN shot_type='around_green' THEN 'around_green'
                ELSE 'approach' END AS category,
      sg_expected_strokes(lie_before_norm,dist_before_yards) AS exp_before,
      CASE WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards) ELSE 0 END AS exp_after,
      (is_holed OR dist_after_yards>0) AS has_after
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