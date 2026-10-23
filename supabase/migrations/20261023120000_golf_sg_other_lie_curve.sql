-- Strokes gained: price an 'Other' lie as what it is, not as fairway.
-- WRITTEN, NOT APPLIED. Held in supabase/migrations/HELD.md; the owner applies.
--
-- WHAT IS WRONG TODAY. golf_shots.lie_before / lie_after 'other' is the
-- logger's "Other" lie: trees, pine straw, waste areas, hazard edges, and the
-- 'hazard' approach miss. sg_normalize_lie() sends it to the ELSE branch, i.e.
-- 'fairway', so a ball in the trees is expected to cost the same as one in the
-- middle of the fairway. On production (read-only, 2026-10-23; completed,
-- non-test rounds, non-penalty shots 20-300 yd) players took, on average, this
-- many strokes MORE than the Tour expectation for the lie they played from:
--     fairway +0.21   rough +0.22   sand +0.31   (8,695 / 4,858 / 942 shots)
--     'other' priced as fairway  +0.78  (883 shots)
-- So every shot played from 'Other' is charged about 0.55 strokes that belong
-- to the shot that put it there; 1,187 rough -> 'other' pairs across 563 rounds.
--
-- THE CURVE. Broadie publishes a RECOVERY baseline (shot to the hole impeded by
-- trees or other obstacles): "Assessing Golfer Performance on the PGA TOUR",
-- Apr 2011 preprint of Interfaces 42(2), Appendix A, Table 9 -- the same table
-- the fairway / rough / sand anchors below already match (fairway 100 = 2.80,
-- rough 100 = 3.02, sand 100 = 3.23). 'Other' is a mix of blocked and open
-- shots (the recovery tap in held 20261021091000 will tell them apart), and
-- priced on the recovery curve alone the same 883 shots land at -0.07, i.e.
-- over-charged the other way. Halfway between rough and recovery lands at
-- +0.25, in line with the other lies, so 'other' uses that:
--     other(d) = round((rough(d) + recovery(d)) / 2, 2)
-- at Broadie's recovery anchors 20..540 yd (rough interpolated between its own
-- anchors), clamped outside that range like every other curve. Anything else
-- that is not a known lie ('water', NULL, typos) still uses the fairway curve.
--
-- ORDER: apply AFTER 20260930150000 (Q-89). Before Q-89 the stored engine
-- prices a shot's end from its own lie_after ('rough') and the next shot's
-- start from lie_before ('other'), so raising 'other' would turn today's gap
-- into a gap the other way; with Q-89 a shot ends where the next one starts,
-- the drive into the trees is charged for it and each hole still telescopes.
-- The guard below refuses to run until Q-89's body is live.
--
-- TS MIRROR: src/lib/utils/golf-stats-calculator-shots.ts
-- STROKES_GAINED_BENCHMARKS.other carries the same anchors (the Stats pages
-- compute SG in TypeScript on read). supabase/schemas/functions/public.sql is
-- updated to these bodies in the same PR.
--
-- RECOMPUTE (separate step, service role, after apply): the RECOMPUTE block in
-- the header of 20260930150000 (batched recalculate_round_strokes_gained by
-- player, then refresh_player_stats_cache, then the three Standing refreshes).
-- When both files are applied together, run it once, after this one.
--
-- ROLLBACK: supabase/rollbacks/20261023120000_golf_sg_other_lie_curve.rollback.sql
-- (the three live bodies, verbatim), then the same RECOMPUTE.
-- VERIFY: select 1 where public.sg_normalize_lie('other') = 'other' and public.sg_normalize_lie('water') = 'fairway';
-- VERIFY: select 1 where public.sg_expected_strokes('other'::text, 200::numeric, 1.0::numeric) = 3.65 and public.sg_expected_strokes('fairway'::text, 200::numeric, 1.0::numeric) = 3.19 and public.sg_expected_strokes('other'::text, 150::numeric, 1.0::numeric) = 3.515;

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
  IF v_src IS NULL OR md5(v_src) <> '69c1ac904be30a3b4b24210f4986b89e' THEN
    RAISE EXCEPTION 'sg other curve: live sg_expected_strokes(text,numeric) is not the known body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric, p_scale numeric';
  IF v_src IS NULL OR md5(v_src) <> '751626746d671d72cf115159a1259153' THEN
    RAISE EXCEPTION 'sg other curve: live sg_expected_strokes(text,numeric,numeric) is not the known body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  -- Q-89 first: a shot's end must come from the next shot's start.
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalculate_round_strokes_gained'
    AND pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid';
  IF v_src IS NULL OR v_src NOT LIKE '%nx.distance_to_hole_before%' THEN
    RAISE EXCEPTION 'sg other curve: apply 20260930150000 (Q-89) first; recalculate_round_strokes_gained still prices a shot''s end from its own lie_after.';
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
    -- 'Other' (trees, pine straw, waste, hazard edges): halfway between rough
    -- and Broadie's recovery curve (see 20261023120000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20]::NUMERIC[];
    v_strokes   := ARRAY[5.19,5.10,5.00,4.91,4.81,4.72,4.62,4.53,4.44,4.35,4.25,4.14,4.05,3.96,3.88,3.81,3.73,3.65,3.58,3.54,3.49,3.44,3.41,3.39,3.38,3.35,3.32,3.27,3.20,3.11,3.05]::NUMERIC[];
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
    -- 'Other' (trees, pine straw, waste, hazard edges): halfway between rough
    -- and Broadie's recovery curve (see 20261023120000).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20]::NUMERIC[];
    v_strokes   := ARRAY[5.19,5.10,5.00,4.91,4.81,4.72,4.62,4.53,4.44,4.35,4.25,4.14,4.05,3.96,3.88,3.81,3.73,3.65,3.58,3.54,3.49,3.44,3.41,3.39,3.38,3.35,3.32,3.27,3.20,3.11,3.05]::NUMERIC[];
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

