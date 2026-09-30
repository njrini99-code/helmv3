-- CoachHelm deep audit row 1 (2026-09-28): stored round SG does not reconcile
-- with the shots. WRITTEN, NOT APPLIED.
--
-- Root cause (read-only prod checks, 2026-09-28, 667 completed non-test 2026
-- rounds with SG): every hole's shot count equals its score and every hole's
-- last shot is holed, so no stroke is missing. But
-- recalculate_round_strokes_gained values each shot's END from that shot's
-- own lie_after / distance_to_hole_after, while the next shot records its own
-- lie_before / distance_to_hole_before. When the two disagree (a lie break:
-- "rough" after vs "fairway" before), the per-shot values stop telescoping and
-- the round total drifts from expected(first shot) - strokes. Rounds with no
-- lie break and no penalty agree within 0.11 strokes (135 rounds); all rounds
-- MAE 0.46 with 67 rounds off by more than a stroke.
--
-- Change. A shot's end state is the NEXT NON-PENALTY shot's start state (the
-- place the ball was actually played from), falling back to the shot's own
-- recorded end only for the last shot of a hole. Penalty rows keep their fixed
-- -1. With that, each hole's SG telescopes exactly to
--   expected(first shot) - strokes,
-- so the round total reconciles by construction; only the split across
-- categories moves where a lie break sat between two shots. Everything else
-- (categories, the hole-estimate fallback, scale, writes) is unchanged.
--
-- After apply (service role), recompute stored SG for every completed round:
--   SELECT public.recalculate_round_strokes_gained(id)
--   FROM public.golf_rounds WHERE status = 'completed';
-- then refresh caches/standings (the nightly standing cron picks them up).
--
-- ROLLBACK: re-apply the previous body (pg_get_functiondef captured
-- 2026-09-28; identical to the body below except the two CASE expressions
-- and the LATERAL join).
--
-- VERIFY: for a completed round, SUM(strokes_gained) over its shots equals
-- expected(first shot of each hole) - strokes, within rounding.

CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(
    p_round_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id UUID; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_scale NUMERIC := 1.0;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'stats_cache', true);
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
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.distance_unit_before='feet' THEN nx.distance_to_hole_before/3.0 ELSE nx.distance_to_hole_before END
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
          ELSE 0 END AS dist_after_yards,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(nx.lie_before) END
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          ELSE NULL END AS lie_after_norm,
        COALESCE(gs.is_penalty,FALSE) AS is_penalty
      FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
      LEFT JOIN LATERAL (
        SELECT n.shot_type, n.lie_before, n.distance_to_hole_before, n.distance_unit_before
        FROM golf_shots n
        WHERE n.hole_id = gs.hole_id AND n.shot_number > gs.shot_number
          AND NOT COALESCE(n.is_penalty, FALSE)
          AND n.distance_to_hole_before IS NOT NULL AND n.distance_to_hole_before > 0
          AND (n.lie_before IS NOT NULL OR n.shot_type = 'putting')
        ORDER BY n.shot_number
        LIMIT 1
      ) nx ON TRUE
      WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
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
