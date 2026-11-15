-- Strokes gained: a team's baseline scale prices the off-green game only, so a
-- sure putt is worth one stroke on every baseline (SC-04).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md), after 20261115210000 (the Table B.1 curve).
--
-- WHAT IS WRONG TODAY. sg_scale_for_player() gives a women's team 1.083
-- (sg_baseline_scale('womens')), and the three-argument sg_expected_strokes()
-- multiplies the whole curve by it, putting included. A 1-foot putt is then
-- expected to take 1.083 strokes, so holing it gains +0.083, and every putt is
-- credited 8.3% of its expectation: about 0.14 strokes a hole, 2.5 a round,
-- moved into putting from the shot that reached the green. The app called the
-- scale "LPGA", but it is the men's curve times a constant, not an LPGA dataset.
--
-- WHAT CHANGES. The three-argument overload returns the putting value
-- unscaled; every off-green lie keeps the scale. The two-argument overload has
-- no scale and is unchanged. Men's teams (scale 1.0) see no change at all.
--
-- WHAT MOVES. Women's teams only. A shot that ends on the green and the putt
-- that starts there read the same unscaled value, so a hole still telescopes to
-- 1.083 x expected(first shot) - strokes and a holed-out round's total does not
-- move. Within it, strokes move from putting to the shot that reached the
-- green: 0.083 x expected(first putt), 0.08 to 0.20 a hole.
--
-- TS MIRROR: getExpectedStrokes() in src/lib/utils/golf-stats-calculator-shots.ts
-- leaves putts unscaled in the same change; src/lib/golf/sg-benchmarks.ts
-- relabels the baseline "Men's Tour, women's estimate".
--
-- RECOMPUTE (separate step, service role, after apply; owner's go): the
-- RECOMPUTE block in the header of 20260930150000, for women's teams' players
-- (it is safe for everyone). When this file is applied together with
-- 20261115210000, run it once, after this one.
--
-- ROLLBACK: supabase/rollbacks/20261115220000_golf_sg_scale_off_green.rollback.sql
-- (the body 20261115210000 leaves, verbatim), then the same RECOMPUTE.
-- VERIFY: select 1 where public.sg_expected_strokes('green'::text, 1::numeric, 1.083::numeric) = public.sg_expected_strokes('green'::text, 1::numeric, 1.0::numeric) and public.sg_expected_strokes('green'::text, 1::numeric, 1.0::numeric) = 1.04;
-- VERIFY: select 1 where public.sg_expected_strokes('fairway'::text, 100::numeric, 1.083::numeric) = 2.80 * 1.083 and public.sg_expected_strokes('tee'::text, 400::numeric, 1.0::numeric) = 3.99;

SET LOCAL lock_timeout = '3s';

DO $guard$
DECLARE
  v_src text;
BEGIN
  -- 20261115210000 first, exactly: the three-argument overload must be the
  -- body it leaves, so this file never undoes the Table B.1 curve.
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric, p_scale numeric';
  IF v_src IS NULL OR md5(v_src) <> 'f8d7dcef4383b6fe73a49035589b7584' THEN
    RAISE EXCEPTION 'sg scale off green: live sg_expected_strokes(text,numeric,numeric) is not the body 20261115210000 leaves (md5 %). Apply 20261115210000 first, or rebase this file on the live body.', md5(v_src);
  END IF;
END
$guard$;

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
    -- Feet. Not in Table B.1; unchanged since 20260606140000.
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,60,50,40,30,20,15,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.21,2.14,2.06,1.98,1.87,1.78,1.61,1.56,1.50,
                         1.42,1.34,1.23,1.13,1.04,1.01,1.00,0]::NUMERIC[];
  ELSIF p_lie = 'tee' THEN
    -- Broadie, Interfaces 42(2), Appendix B, Table B.1, tee column (from 100 yd).
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100]::NUMERIC[];
    v_strokes   := ARRAY[4.82,4.79,4.74,4.65,4.54,4.41,4.28,4.17,4.08,4.02,3.99,3.96,3.92,3.86,3.79,3.71,3.65,3.45,3.25,3.17,3.12,3.05,2.99,2.97,2.99,2.92]::NUMERIC[];
  ELSIF p_lie = 'fairway' THEN
    -- Table B.1, fairway column.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[4.89,4.82,4.74,4.66,4.58,4.50,4.42,4.34,4.27,4.19,4.11,4.03,3.95,3.88,3.84,3.78,3.69,3.58,3.45,3.32,3.19,3.08,2.98,2.91,2.85,2.80,2.77,2.75,2.72,2.70,2.66,2.60,2.52,2.40,2.18]::NUMERIC[];
  ELSIF p_lie = 'rough' THEN
    -- Table B.1, rough column.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[5.25,5.15,5.06,4.96,4.87,4.77,4.68,4.58,4.49,4.40,4.30,4.21,4.11,4.02,3.95,3.90,3.83,3.74,3.64,3.53,3.42,3.31,3.23,3.15,3.08,3.02,2.99,2.96,2.93,2.91,2.87,2.78,2.70,2.59,2.34]::NUMERIC[];
  ELSIF p_lie = 'sand' THEN
    -- Table B.1, sand column.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[6.10,5.96,5.82,5.68,5.54,5.40,5.25,5.11,4.97,4.83,4.69,4.55,4.41,4.26,4.12,4.04,4.00,3.93,3.84,3.70,3.55,3.40,3.28,3.22,3.21,3.23,3.24,3.24,3.21,3.15,2.92,2.82,2.66,2.53,2.43]::NUMERIC[];
  ELSIF p_lie = 'other' THEN
    -- 'Other' (catch-all: trees, pine straw, waste, hazard edges), the owner's
    -- rule of 20261023170000 on Table B.1's rows: the rough curve to 50 yd,
    -- halfway between rough and recovery from 100 yd, a straight blend between.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[5.475,5.375,5.285,5.185,5.095,4.995,4.905,4.805,4.715,4.62,4.525,4.435,4.335,4.23,4.13,4.05,3.965,3.885,3.805,3.725,3.645,3.565,3.52,3.475,3.43,3.41,3.322,3.224,3.112,3.002,2.87,2.78,2.70,2.59,2.34]::NUMERIC[];
  ELSIF p_lie = 'recovery' THEN
    -- Blocked (recovery tap): Table B.1, recovery column.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[5.70,5.60,5.51,5.41,5.32,5.22,5.13,5.03,4.94,4.84,4.75,4.66,4.56,4.44,4.31,4.20,4.10,4.03,3.97,3.92,3.87,3.82,3.81,3.80,3.78,3.80,3.82,3.84,3.84,3.83,3.79,3.71,3.57,3.51,3.45]::NUMERIC[];
  ELSE
    -- Unknown lie: the fairway curve.
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,400,380,360,340,320,300,280,260,240,220,200,180,160,140,120,100,90,80,70,60,50,40,30,20,10]::NUMERIC[];
    v_strokes   := ARRAY[4.89,4.82,4.74,4.66,4.58,4.50,4.42,4.34,4.27,4.19,4.11,4.03,3.95,3.88,3.84,3.78,3.69,3.58,3.45,3.32,3.19,3.08,2.98,2.91,2.85,2.80,2.77,2.75,2.72,2.70,2.66,2.60,2.52,2.40,2.18]::NUMERIC[];
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
  -- The team's baseline scale prices the off-green game only (SC-04): a putt
  -- keeps the Tour putting curve, so a holed 1-foot putt gains 0.00 on every
  -- baseline instead of +0.083 on the women's.
  IF p_lie = 'green' THEN
    RETURN v_es;
  END IF;
  RETURN v_es * COALESCE(p_scale, 1.0);
END;
$$;

