-- Strokes gained: price an 'Other' lie as what it is, not as fairway, and
-- price a shot the player marked blocked (recovery tap) as a recovery.
-- WRITTEN, NOT APPLIED. Held in supabase/migrations/HELD.md; the owner applies.
--
-- WHAT IS WRONG TODAY. golf_shots.lie_before 'other' is the logger's catch-all
-- lie: trees, pine straw, waste areas, hazard edges, the 'hazard' approach miss
-- and any result that is not fairway/rough/sand/green. sg_normalize_lie() sends
-- it to the ELSE branch, i.e. 'fairway', so a ball in the trees is expected to
-- cost the same as one in the middle of the fairway. On production (read-only,
-- 2026-10-23; completed, non-test rounds, non-penalty shots 20-300 yd) players
-- took, on average, this many strokes MORE than the Tour expectation for the
-- lie they played from:
--     fairway +0.21   rough +0.22   sand +0.31   (8,695 / 4,858 / 942 shots)
--     'other' priced as fairway  +0.78  (883 shots)
--
-- THE 'OTHER' CURVE, in three parts (owner decision 2026-10-23):
--   * 50 yd and in: the ROUGH curve. Near the green 'other' plays like rough
--     (collar, pine straw, hardpan): on production 10-19 yd took 2.63 strokes
--     from 'other' against 2.60 from rough, under 10 yd 2.15 against 2.48.
--   * 100 yd and out: halfway between rough and Broadie's RECOVERY curve ("the
--     golfer's shot to the hole is impeded by trees or other obstacles"; "Assessing
--     Golfer Performance on the PGA TOUR", Apr 2011 preprint of Interfaces 42(2),
--     Appendix A, Table 9, the table the fairway/rough/sand anchors already
--     match). Out there 'other' is a mix of blocked and open shots: on the
--     recovery curve alone they land at -0.07, halfway at about +0.24.
--   * 50 to 100 yd: a straight blend from the first to the second.
--   Not a published curve: the halfway point is fitted to our own data. Over
--   the curve, by band (fairway / rough / 'other'): under 20 yd -0.07/-0.02/-0.10,
--   20-49 +0.25/+0.19/+0.42, 50-99 +0.23/+0.22/+0.28, 100-199 +0.18/+0.21/+0.24,
--   200+ +0.28/+0.28/+0.41.
--
-- THE RECOVERY TAP. Held 20261021091000 (applied 2026-10-21, flag
-- coachhelm_data_prompts_v2 OFF) stores golf_shots.lie_after_recovery on a tee
-- shot that finished in rough or 'other': true = the next shot was blocked. The
-- next shot then starts from 'recovery' (Broadie's recovery column, as published)
-- and the blocked shot ends there too, so the punch-out is judged against a
-- punch-out, the drive carries the cost, and each hole still telescopes. A
-- shot is "the next shot" by the same rule as Q-89's nx lateral. Today every
-- row is NULL, so this part changes no number until the tap ships.
--
-- WHAT MOVES. With Q-89 a hole's SG is expected(first shot) - strokes, so the
-- 'other' curve moves strokes between categories (off the tee / approach /
-- around the green), not the round total, except at a hole whose last recorded
-- shot is not holed. Read-only simulation over 819 completed rounds, in the PR.
--
-- ORDER: apply AFTER 20260930150000 (Q-89). The guard below refuses to run
-- unless both round functions are exactly Q-89's bodies.
--
-- TS MIRROR: src/lib/utils/golf-stats-calculator-shots.ts
-- STROKES_GAINED_BENCHMARKS.other / .recovery carry the same anchors, and
-- withRecoveryStart / withNextShotStart the same recovery rule (the Stats
-- pages compute SG in TypeScript on read). supabase/schemas/functions/public.sql
-- is updated to these bodies in the same PR.
--
-- RECOMPUTE (separate step, service role, after apply): the RECOMPUTE block in
-- the header of 20260930150000 (batched recalculate_round_strokes_gained by
-- player, then refresh_player_stats_cache, then the three Standing refreshes).
-- When both files are applied together, run it once, after this one.
--
-- ROLLBACK: supabase/rollbacks/20261023170000_golf_sg_other_lie_curve.rollback.sql
-- (the three live lie/curve bodies verbatim, and the two Q-89 round bodies),
-- then the same RECOMPUTE.
-- VERIFY: select 1 where public.sg_normalize_lie('other') = 'other' and public.sg_normalize_lie('recovery') = 'recovery' and public.sg_normalize_lie('water') = 'fairway';
-- VERIFY: select 1 where public.sg_expected_strokes('other'::text, 200::numeric, 1.0::numeric) = 3.65 and public.sg_expected_strokes('other'::text, 20::numeric, 1.0::numeric) = public.sg_expected_strokes('rough'::text, 20::numeric, 1.0::numeric) and public.sg_expected_strokes('recovery'::text, 100::numeric, 1.0::numeric) = 3.80 and public.sg_expected_strokes('fairway'::text, 200::numeric, 1.0::numeric) = 3.19;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'recalculate_round_strokes_gained' and p.prosrc like '%rc.from_blocked%' and p.prosrc like '%IF v_is_test THEN%' and not p.prosecdef;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'calculate_round_strokes_gained' and p.prosrc like '%rc.from_blocked%' and p.prosecdef;

DO $guard$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_normalize_lie'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text';
  IF v_src IS NULL OR md5(v_src) <> 'c2bc337b51b7bc24f6f79929478d91f6' THEN
    RAISE EXCEPTION 'sg other curve: live sg_normalize_lie is not the known body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric';
  -- 69c1ac90... is live; eac106bc... is what a fresh migration replay leaves
  -- (20260606140000's body). The two differ only in comments and spacing.
  IF v_src IS NULL OR md5(v_src) NOT IN ('69c1ac904be30a3b4b24210f4986b89e', 'eac106bc7b389bc0999cc9f19dea8a18') THEN
    RAISE EXCEPTION 'sg other curve: live sg_expected_strokes(text,numeric) is not the known body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric, p_scale numeric';
  IF v_src IS NULL OR md5(v_src) <> '751626746d671d72cf115159a1259153' THEN
    RAISE EXCEPTION 'sg other curve: live sg_expected_strokes(text,numeric,numeric) is not the known body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  -- Q-89 first, exactly: a shot's end must come from the next shot's start.
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalculate_round_strokes_gained'
    AND pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid';
  IF v_src IS NULL OR md5(v_src) <> '20670746741f13d5be47a86e86913d11' THEN
    RAISE EXCEPTION 'sg other curve: apply 20260930150000 (Q-89) first; live recalculate_round_strokes_gained is not its body (md5 %).', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'calculate_round_strokes_gained'
    AND pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid';
  IF v_src IS NULL OR md5(v_src) <> '9ada07cac6dd8ab2c556dd127ffede2f' THEN
    RAISE EXCEPTION 'sg other curve: apply 20260930150000 (Q-89) first; live calculate_round_strokes_gained is not its body (md5 %).', md5(v_src);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'golf_shots' AND column_name = 'lie_after_recovery') THEN
    RAISE EXCEPTION 'sg other curve: golf_shots.lie_after_recovery is missing (20261021091000).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.sg_normalize_lie(p_lie text) RETURNS text
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  CASE lower(coalesce(p_lie, 'fairway'))
    WHEN 'tee', 'teebox'                                           THEN RETURN 'tee';
    WHEN 'fairway'                                                 THEN RETURN 'fairway';
    WHEN 'rough', 'primary_rough'                                  THEN RETURN 'rough';
    WHEN 'sand', 'bunker', 'greenside_bunker', 'fairway_bunker'    THEN RETURN 'sand';
    WHEN 'green', 'fringe'                                         THEN RETURN 'green';
    WHEN 'other'                                                   THEN RETURN 'other';
    WHEN 'recovery'                                                THEN RETURN 'recovery';
    ELSE                                                                RETURN 'fairway';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_distances NUMERIC[]; v_strokes NUMERIC[]; v_distance NUMERIC;
  n INTEGER; i INTEGER; ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
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
  ELSIF p_lie = 'other' THEN
    -- 'Other' (catch-all: trees, pine straw, waste, hazard edges): the rough
    -- curve to 50 yd, halfway between rough and recovery from 100 yd, a
    -- straight blend between (see 20261023170000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,20]::NUMERIC[];
    v_strokes   := ARRAY[5.19,5.10,5.00,4.91,4.81,4.72,4.62,4.53,4.44,4.35,4.25,4.14,4.05,3.96,3.88,3.81,3.73,3.65,3.58,3.54,3.49,3.44,3.41,3.31,3.19,3.06,2.91,2.751,2.59]::NUMERIC[];
  ELSIF p_lie = 'recovery' THEN
    -- Blocked (recovery tap): Broadie's recovery curve, Interfaces 42(2),
    -- Appendix A, Table 9 (see 20261023170000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20]::NUMERIC[];
    v_strokes   := ARRAY[5.70,5.60,5.51,5.41,5.32,5.22,5.13,5.03,4.94,4.84,4.75,4.66,4.56,4.44,4.31,4.20,4.10,4.03,3.97,3.92,3.87,3.82,3.81,3.80,3.78,3.80,3.82,3.84,3.84,3.83,3.79,3.71,3.57,3.51]::NUMERIC[];
  ELSE
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  END IF;
  IF v_distance <= 0 THEN RETURN 0; END IF;
  n := array_length(v_distances, 1);
  IF v_distance >= v_distances[1] THEN RETURN v_strokes[1]; END IF;
  IF v_distance <= v_distances[n] THEN RETURN v_strokes[n]; END IF;
  FOR i IN 1..(n-1) LOOP
    ud := v_distances[i]; ld := v_distances[i+1];
    IF v_distance <= ud AND v_distance >= ld THEN
      us := v_strokes[i]; ls := v_strokes[i+1];
      RETURN ls + (v_distance - ld)/(ud - ld)*(us - ls);
    END IF;
  END LOOP;
  RETURN 3.0;
END;
$$;

CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric, p_scale numeric DEFAULT 1.0) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  ELSIF p_lie = 'other' THEN
    -- 'Other' (catch-all: trees, pine straw, waste, hazard edges): the rough
    -- curve to 50 yd, halfway between rough and recovery from 100 yd, a
    -- straight blend between (see 20261023170000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,20]::NUMERIC[];
    v_strokes   := ARRAY[5.19,5.10,5.00,4.91,4.81,4.72,4.62,4.53,4.44,4.35,4.25,4.14,4.05,3.96,3.88,3.81,3.73,3.65,3.58,3.54,3.49,3.44,3.41,3.31,3.19,3.06,2.91,2.751,2.59]::NUMERIC[];
  ELSIF p_lie = 'recovery' THEN
    -- Blocked (recovery tap): Broadie's recovery curve, Interfaces 42(2),
    -- Appendix A, Table 9 (see 20261023170000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20]::NUMERIC[];
    v_strokes   := ARRAY[5.70,5.60,5.51,5.41,5.32,5.22,5.13,5.03,4.94,4.84,4.75,4.66,4.56,4.44,4.31,4.20,4.10,4.03,3.97,3.92,3.87,3.82,3.81,3.80,3.78,3.80,3.82,3.84,3.84,3.83,3.79,3.71,3.57,3.51]::NUMERIC[];
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
$$;

CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id UUID; v_is_test BOOLEAN; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_scale NUMERIC := 1.0;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'stats_cache', true);
  SELECT player_id, is_test INTO v_player_id, v_is_test FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- A test (QA / demo) round carries no strokes gained: NULL keeps it out of
  -- the player cache and Standing, which aggregate only non-null SG.
  IF v_is_test THEN
    UPDATE golf_round_stats_cache SET strokes_gained_total=NULL, strokes_gained_tee=NULL,
      strokes_gained_approach=NULL, strokes_gained_around_green=NULL,
      strokes_gained_putting=NULL, updated_at=now()
    WHERE round_id=p_round_id AND (
      strokes_gained_total IS NOT NULL OR strokes_gained_tee IS NOT NULL
      OR strokes_gained_approach IS NOT NULL OR strokes_gained_around_green IS NOT NULL
      OR strokes_gained_putting IS NOT NULL);
    UPDATE golf_rounds SET strokes_gained_total=NULL, strokes_gained_tee=NULL,
      strokes_gained_approach=NULL, strokes_gained_around_green=NULL, strokes_gained_putting=NULL
    WHERE id=p_round_id AND (
      strokes_gained_total IS NOT NULL OR strokes_gained_tee IS NOT NULL
      OR strokes_gained_approach IS NOT NULL OR strokes_gained_around_green IS NOT NULL
      OR strokes_gained_putting IS NOT NULL);
    RETURN;
  END IF;

  v_scale := sg_scale_for_player(v_player_id);

  SELECT COUNT(*) INTO v_shot_count FROM golf_shots gs
  WHERE gs.round_id = p_round_id AND gs.shot_type IS NOT NULL AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before > 0
    AND (gs.distance_to_hole_after IS NOT NULL OR gs.putt_made = TRUE OR gs.result IN ('holed','hole'));
  IF v_shot_count > 0 THEN
    WITH normalized AS (
      SELECT gs.shot_type, gs.shot_number, gh.par,
        -- the shot after one the player marked blocked (recovery tap) starts on
        -- Broadie's recovery curve (20261023170000)
        CASE WHEN gs.shot_type='putting' THEN 'green'
          WHEN COALESCE(rc.from_blocked, FALSE) AND sg_normalize_lie(gs.lie_before) IN ('rough','other') THEN 'recovery'
          ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
        CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
        (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
        -- a shot ends where the next non-penalty shot starts; its own recorded
        -- end only for the last shot of the hole (20260928160000)
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.distance_unit_before='feet' THEN nx.distance_to_hole_before/3.0 ELSE nx.distance_to_hole_before END
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
          ELSE 0 END AS dist_after_yards,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.shot_type='putting' THEN 'green'
              WHEN gs.lie_after_recovery IS TRUE AND NOT COALESCE(gs.is_penalty, FALSE)
                   AND sg_normalize_lie(nx.lie_before) IN ('rough','other') THEN 'recovery'
              ELSE sg_normalize_lie(nx.lie_before) END
          WHEN gs.lie_after IS NOT NULL THEN
            CASE WHEN gs.lie_after_recovery IS TRUE AND NOT COALESCE(gs.is_penalty, FALSE)
                 AND sg_normalize_lie(gs.lie_after) IN ('rough','other') THEN 'recovery'
            ELSE sg_normalize_lie(gs.lie_after) END
          ELSE NULL END AS lie_after_norm,
        COALESCE(gs.is_penalty,FALSE) AS is_penalty,
        org.has_origin AS org_found, org.lie_norm AS org_lie_norm, org.dist_yards AS org_dist_yards
      FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
      LEFT JOIN LATERAL (
        SELECT n.shot_type, n.lie_before, n.distance_to_hole_before, n.distance_unit_before
        FROM golf_shots n
        WHERE n.hole_id = gs.hole_id AND n.shot_number > gs.shot_number
          AND NOT COALESCE(n.is_penalty, FALSE)
          AND n.distance_to_hole_before IS NOT NULL AND n.distance_to_hole_before > 0
          AND (n.lie_before IS NOT NULL OR n.shot_type = 'putting')
        ORDER BY n.shot_number, n.id
        LIMIT 1
      ) nx ON TRUE
      -- recovery tap: this shot is the next shot (same rule as nx) of a
      -- non-penalty shot the player marked blocked (golf_shots.lie_after_recovery)
      LEFT JOIN LATERAL (
        SELECT TRUE AS from_blocked
        FROM golf_shots p
        WHERE NOT COALESCE(gs.is_penalty, FALSE)
          AND gs.distance_to_hole_before > 0 AND (gs.lie_before IS NOT NULL OR gs.shot_type = 'putting')
          AND p.hole_id = gs.hole_id AND p.shot_number < gs.shot_number
          AND p.lie_after_recovery IS TRUE AND NOT COALESCE(p.is_penalty, FALSE)
          AND NOT EXISTS (
            SELECT 1 FROM golf_shots m
            WHERE m.hole_id = gs.hole_id AND m.shot_number > p.shot_number AND m.shot_number < gs.shot_number
              AND NOT COALESCE(m.is_penalty, FALSE)
              AND m.distance_to_hole_before IS NOT NULL AND m.distance_to_hole_before > 0
              AND (m.lie_before IS NOT NULL OR m.shot_type = 'putting'))
        LIMIT 1
      ) rc ON TRUE
      -- where a penalty was earned: the nearest preceding non-penalty shot, else
      -- the nearest following one (TS resolvePenaltyOrigin); no row for a shot
      LEFT JOIN LATERAL (
        SELECT TRUE AS has_origin,
          CASE WHEN o.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(o.lie_before) END AS lie_norm,
          CASE WHEN o.distance_to_hole_before IS NULL THEN NULL
               WHEN o.distance_unit_before='feet' THEN o.distance_to_hole_before/3.0
               ELSE o.distance_to_hole_before END AS dist_yards
        FROM golf_shots o
        WHERE COALESCE(gs.is_penalty, FALSE)
          AND o.hole_id = gs.hole_id AND o.shot_number <> gs.shot_number
          AND NOT COALESCE(o.is_penalty, FALSE) AND COALESCE(o.shot_type, '') <> 'penalty'
        ORDER BY (o.shot_number < gs.shot_number) DESC,
                 CASE WHEN o.shot_number < gs.shot_number THEN -o.shot_number ELSE o.shot_number END, o.id
        LIMIT 1
      ) org ON TRUE
      WHERE gs.round_id=p_round_id
        AND (COALESCE(gs.is_penalty, FALSE)
             OR (gs.shot_type IS NOT NULL AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0))
    ),
    attributed AS (
      SELECT normalized.*,
        CASE WHEN org_found THEN org_lie_norm ELSE lie_before_norm END AS pen_lie,
        CASE WHEN org_found THEN org_dist_yards ELSE dist_before_yards END AS pen_dist_yards
      FROM normalized
    ),
    categorized AS (
      SELECT CASE
               WHEN is_penalty THEN
                 CASE WHEN pen_lie='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                      WHEN pen_lie='green' THEN 'around_green'
                      WHEN pen_dist_yards<=50 THEN 'around_green'
                      ELSE 'approach' END
               WHEN shot_type='putting' THEN 'putting'
               WHEN shot_type='tee' THEN 'off_tee'
               WHEN shot_type='around_green' THEN 'around_green'
               ELSE 'approach' END AS category,
        CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
        CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
        CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
      FROM attributed WHERE dist_before_yards>0 OR is_penalty
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
 LANGUAGE plpgsql
 -- search_path is set just below; the rule mis-anchors on a header comment (owner-approved 2026-09-30).
 -- nosemgrep: helmv3-security-definer-without-search-path
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
  v_player_id UUID; v_scale NUMERIC := 1.0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  v_scale := sg_scale_for_player(v_player_id);

  WITH normalized AS (
    SELECT gs.shot_type, gs.shot_number, gh.par,
      -- the shot after one the player marked blocked (recovery tap) starts on
      -- Broadie's recovery curve (20261023170000)
      CASE WHEN gs.shot_type='putting' THEN 'green'
        WHEN COALESCE(rc.from_blocked, FALSE) AND sg_normalize_lie(gs.lie_before) IN ('rough','other') THEN 'recovery'
        ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
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
          CASE WHEN nx.shot_type='putting' THEN 'green'
            WHEN gs.lie_after_recovery IS TRUE AND NOT COALESCE(gs.is_penalty, FALSE)
                 AND sg_normalize_lie(nx.lie_before) IN ('rough','other') THEN 'recovery'
            ELSE sg_normalize_lie(nx.lie_before) END
        WHEN gs.lie_after IS NOT NULL THEN
          CASE WHEN gs.lie_after_recovery IS TRUE AND NOT COALESCE(gs.is_penalty, FALSE)
               AND sg_normalize_lie(gs.lie_after) IN ('rough','other') THEN 'recovery'
          ELSE sg_normalize_lie(gs.lie_after) END
        ELSE NULL END AS lie_after_norm,
      COALESCE(gs.is_penalty,FALSE) AS is_penalty,
      org.has_origin AS org_found, org.lie_norm AS org_lie_norm, org.dist_yards AS org_dist_yards
    FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
    LEFT JOIN LATERAL (
      SELECT n.shot_type, n.lie_before, n.distance_to_hole_before, n.distance_unit_before
      FROM golf_shots n
      WHERE n.hole_id = gs.hole_id AND n.shot_number > gs.shot_number
        AND NOT COALESCE(n.is_penalty, FALSE)
        AND n.distance_to_hole_before IS NOT NULL AND n.distance_to_hole_before > 0
        AND (n.lie_before IS NOT NULL OR n.shot_type = 'putting')
      ORDER BY n.shot_number, n.id
      LIMIT 1
    ) nx ON TRUE
    -- recovery tap: this shot is the next shot (same rule as nx) of a
    -- non-penalty shot the player marked blocked (golf_shots.lie_after_recovery)
    LEFT JOIN LATERAL (
      SELECT TRUE AS from_blocked
      FROM golf_shots p
      WHERE NOT COALESCE(gs.is_penalty, FALSE)
        AND gs.distance_to_hole_before > 0 AND (gs.lie_before IS NOT NULL OR gs.shot_type = 'putting')
        AND p.hole_id = gs.hole_id AND p.shot_number < gs.shot_number
        AND p.lie_after_recovery IS TRUE AND NOT COALESCE(p.is_penalty, FALSE)
        AND NOT EXISTS (
          SELECT 1 FROM golf_shots m
          WHERE m.hole_id = gs.hole_id AND m.shot_number > p.shot_number AND m.shot_number < gs.shot_number
            AND NOT COALESCE(m.is_penalty, FALSE)
            AND m.distance_to_hole_before IS NOT NULL AND m.distance_to_hole_before > 0
            AND (m.lie_before IS NOT NULL OR m.shot_type = 'putting'))
      LIMIT 1
    ) rc ON TRUE
    LEFT JOIN LATERAL (
      SELECT TRUE AS has_origin,
        CASE WHEN o.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(o.lie_before) END AS lie_norm,
        CASE WHEN o.distance_to_hole_before IS NULL THEN NULL
             WHEN o.distance_unit_before='feet' THEN o.distance_to_hole_before/3.0
             ELSE o.distance_to_hole_before END AS dist_yards
      FROM golf_shots o
      WHERE COALESCE(gs.is_penalty, FALSE)
        AND o.hole_id = gs.hole_id AND o.shot_number <> gs.shot_number
        AND NOT COALESCE(o.is_penalty, FALSE) AND COALESCE(o.shot_type, '') <> 'penalty'
      ORDER BY (o.shot_number < gs.shot_number) DESC,
               CASE WHEN o.shot_number < gs.shot_number THEN -o.shot_number ELSE o.shot_number END, o.id
      LIMIT 1
    ) org ON TRUE
    WHERE gs.round_id=p_round_id
      AND (COALESCE(gs.is_penalty, FALSE)
           OR (gs.shot_type IS NOT NULL AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0))
  ),
  attributed AS (
    SELECT normalized.*,
      CASE WHEN org_found THEN org_lie_norm ELSE lie_before_norm END AS pen_lie,
      CASE WHEN org_found THEN org_dist_yards ELSE dist_before_yards END AS pen_dist_yards
    FROM normalized
  ),
  categorized AS (
    SELECT CASE
             WHEN is_penalty THEN
               CASE WHEN pen_lie='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                    WHEN pen_lie='green' THEN 'around_green'
                    WHEN pen_dist_yards<=50 THEN 'around_green'
                    ELSE 'approach' END
             WHEN shot_type='putting' THEN 'putting'
             WHEN shot_type='tee' THEN 'off_tee'
             WHEN shot_type='around_green' THEN 'around_green'
             ELSE 'approach' END AS category,
      CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
      CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
      CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
    FROM attributed WHERE dist_before_yards>0 OR is_penalty
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
