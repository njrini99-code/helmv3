-- Gender-aware Strokes Gained (2026-06-07).
--
-- Women face longer approaches (shorter tees) so the men's Broadie baseline read
-- their SG ~5-6 strokes/round too negative (e.g. -12 to -29 SG/round on the coach
-- standing surface). Scale the women's expected-strokes curve by a single
-- telescoping-preserving factor so women's SG telescopes to ~-(over par) like
-- men's. Factor 1.083 derived from the women's-team data (residual = f*ΣE_tee - par;
-- f ≈ par/ΣE_tee_women) and VERIFIED: women's per-round residual went -6.0 -> -0.20,
-- matching the men's band (-0.32). Men's path is provably unchanged (scale 1.0 =
-- identical computation).
--
-- gender lives on golf_teams (see 20260607160000). All three SG functions become
-- gender-aware: sg_expected_strokes gains an optional p_scale; the two callers
-- (recalculate_round_strokes_gained = authoritative writer; calculate_round_strokes_gained
-- = BEFORE-completion trigger) look up the player's team gender and pass the factor,
-- so women's NEW rounds get the correct baseline via every completion path.
--
-- Applied to prod via Supabase MCP on 2026-06-07; this file is the reproducible source.

-- 1) Expected-strokes lookup gains an optional per-call scale (default 1.0 = men's).
CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric, p_scale numeric DEFAULT 1.0)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_distances NUMERIC[]; v_strokes NUMERIC[]; v_distance NUMERIC;
  n INTEGER; i INTEGER; ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
  v_es NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,60,50,40,30,20,15,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.21,2.14,2.06,1.98,1.87,1.78,1.61,1.56,1.50,
                         1.42,1.34,1.23,1.13,1.04,1.01,1.00,0]::NUMERIC[];
  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,540,400,300,240,200,150,120,100,80]::NUMERIC[];
    v_strokes   := ARRAY[4.85,4.65,3.99,3.71,3.25,3.12,2.95,2.88,2.82,2.78]::NUMERIC[];
  ELSIF p_lie = 'fairway' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  ELSIF p_lie = 'rough' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[4.97,4.30,3.90,3.64,3.42,3.02,2.59]::NUMERIC[];
  ELSIF p_lie = 'sand' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[5.36,4.69,4.04,3.84,3.55,3.23,2.53]::NUMERIC[];
  ELSE
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  END IF;
  IF v_distance <= 0 THEN RETURN 0; END IF;
  n := array_length(v_distances, 1);
  IF v_distance >= v_distances[1] THEN
    v_es := v_strokes[1];
  ELSIF v_distance <= v_distances[n] THEN
    v_es := v_strokes[n];
  ELSE
    v_es := 3.0;
    FOR i IN 1..(n-1) LOOP
      ud := v_distances[i]; ld := v_distances[i+1];
      IF v_distance <= ud AND v_distance >= ld THEN
        us := v_strokes[i]; ls := v_strokes[i+1];
        v_es := ls + (v_distance - ld)/(ud - ld)*(us - ls);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN v_es * COALESCE(p_scale, 1.0);
END;
$function$;

-- 2) Authoritative writer: thread the player's team gender into per-shot SG.
CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id UUID; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_gender TEXT; v_scale NUMERIC := 1.0;
  v_womens_scale CONSTANT NUMERIC := 1.083;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT t.gender INTO v_gender
  FROM golf_team_members tm
  JOIN golf_teams t ON t.id = tm.team_id
  WHERE tm.player_id = v_player_id AND tm.status = 'active'
  ORDER BY tm.created_at NULLS LAST
  LIMIT 1;
  v_scale := CASE WHEN v_gender = 'womens' THEN v_womens_scale ELSE 1.0 END;

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
      SELECT CASE WHEN is_penalty THEN NULL WHEN shot_type='putting' THEN 'putting'
                  WHEN shot_type='tee' THEN 'off_tee' WHEN shot_type='around_green' THEN 'around_green'
                  ELSE 'approach' END AS category,
        sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) AS exp_before,
        CASE WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
        (is_holed OR dist_after_yards>0) AS has_after
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

-- 3) BEFORE-completion trigger fn: same gender-awareness so new women's rounds are
-- correct even before recalculate runs.
CREATE OR REPLACE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid)
 RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
  v_player_id UUID; v_gender TEXT; v_scale NUMERIC := 1.0;
  v_womens_scale CONSTANT NUMERIC := 1.083;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  SELECT t.gender INTO v_gender
  FROM golf_team_members tm JOIN golf_teams t ON t.id = tm.team_id
  WHERE tm.player_id = v_player_id AND tm.status = 'active'
  ORDER BY tm.created_at NULLS LAST LIMIT 1;
  v_scale := CASE WHEN v_gender = 'womens' THEN v_womens_scale ELSE 1.0 END;

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
      sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) AS exp_before,
      CASE WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
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