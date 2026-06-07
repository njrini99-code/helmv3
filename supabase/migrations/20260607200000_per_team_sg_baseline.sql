-- Per-team selectable SG baseline (coach setting). The expected-strokes reference a
-- team's SG is computed against becomes a coach-chosen baseline (Coaching Intelligence
-- settings), defaulting to the gender baseline. Reuses sg_expected_strokes(...,p_scale);
-- the chosen baseline maps to a uniform scale factor. Changing the setting recomputes
-- the team's stored SG (server action setTeamSgBaseline), so all SG surfaces just read
-- the stored value. Defaults preserve current behavior (women's -> 'womens' 1.083,
-- men's -> 'pga_tour' 1.0); no backfill needed on apply.
--
-- Applied to prod via Supabase MCP on 2026-06-07; this file is the reproducible source.

ALTER TABLE public.golf_team_settings
  ADD COLUMN IF NOT EXISTS sg_baseline text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_team_settings_sg_baseline_check') THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_sg_baseline_check
      CHECK (sg_baseline IS NULL OR sg_baseline IN ('pga_tour','womens','scratch','ncaa_d1','ncaa_d2','ncaa_d3'));
  END IF;
END $$;

-- Baseline key -> uniform expected-strokes scale factor (general scale from
-- src/lib/golf/sg-benchmarks.ts SCALE_FACTORS; women's = WOMENS_SG_SCALE). Keep in sync with TS.
CREATE OR REPLACE FUNCTION public.sg_baseline_scale(p_key text)
 RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_key
    WHEN 'pga_tour' THEN 1.000
    WHEN 'scratch'  THEN 1.028
    WHEN 'ncaa_d1'  THEN 1.057
    WHEN 'ncaa_d2'  THEN 1.100
    WHEN 'ncaa_d3'  THEN 1.143
    WHEN 'womens'   THEN 1.083
    ELSE 1.000
  END;
$function$;

-- Resolve a player's effective SG scale: team's chosen baseline if set, else the
-- gender default ('womens' for women's teams, 'pga_tour' otherwise).
CREATE OR REPLACE FUNCTION public.sg_scale_for_player(p_player_id uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_gender TEXT; v_baseline TEXT;
BEGIN
  SELECT t.gender, gts.sg_baseline INTO v_gender, v_baseline
  FROM golf_team_members tm
  JOIN golf_teams t ON t.id = tm.team_id
  LEFT JOIN golf_team_settings gts ON gts.team_id = t.id
  WHERE tm.player_id = p_player_id AND tm.status = 'active'
  ORDER BY tm.created_at NULLS LAST LIMIT 1;
  RETURN sg_baseline_scale(COALESCE(v_baseline, CASE WHEN v_gender = 'womens' THEN 'womens' ELSE 'pga_tour' END));
END;
$function$;

-- Both SG writers derive their scale from sg_scale_for_player() (was a hardcoded
-- gender CASE in 20260607170000). Identical behavior for teams on the default baseline.
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

-- One-call team SG recompute, invoked by the setTeamSgBaseline server action after a
-- coach changes the team's baseline: recompute every team player's completed rounds at
-- the updated baseline scale, then refresh the player cache + standing. SECURITY DEFINER,
-- service_role-only.
CREATE OR REPLACE FUNCTION public.recompute_team_sg(p_team_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r RECORD; pid UUID;
BEGIN
  FOR r IN
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_team_members tm ON tm.player_id = gr.player_id AND tm.status='active'
    WHERE tm.team_id = p_team_id AND gr.status = 'completed'
  LOOP
    PERFORM recalculate_round_strokes_gained(r.id);
  END LOOP;
  FOR pid IN
    SELECT tm.player_id FROM golf_team_members tm
    WHERE tm.team_id = p_team_id AND tm.status='active'
  LOOP
    PERFORM refresh_player_stats_cache(pid);
  END LOOP;
  PERFORM refresh_player_standing(ARRAY[p_team_id]);
  PERFORM refresh_player_standing_round_metrics(ARRAY[p_team_id]);
  PERFORM refresh_player_standing_shot_metrics(ARRAY[p_team_id]);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recompute_team_sg(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_team_sg(uuid) TO service_role;