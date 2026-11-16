-- Strokes gained: the PGA Tour expected-strokes curve, every row of Broadie's
-- published table instead of hand-picked knots (SC-03, SC-11).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md), after 20260930150000 (Q-89) and
-- 20261023170000 (the 'other' and recovery curves).
--
-- SOURCE. Mark Broadie, "Assessing Golfer Performance on the PGA TOUR",
-- Interfaces 42(2):146-165 (2012), Appendix B, Table B.1, "PGA TOUR benchmark:
-- average number of strokes to hole out": tee, fairway, rough, sand and
-- recovery, 10-yard rows to 100 yards and 20-yard rows to 600 (tee from 100).
--
-- WHAT IS WRONG TODAY. sg_expected_strokes() holds 7 to 10 knots per lie,
-- picked
-- by hand in 20260606140000, and interpolates straight lines between them. At
-- the knots it is close; between them it is off the table, e.g. (code / table):
--   tee 280 yd 3.56 / 3.65, tee 440 yd 4.18 / 4.08, fairway 60 yd 2.63 / 2.70,
--   fairway 540 yd 4.78 / 4.66, rough 60 yd 2.81 / 2.91, sand 60 yd 2.88 /
--   3.15,
--   sand 140 yd 3.36 / 3.22, sand 540 yd 5.36 / 5.68.
-- Below 20 yards it held the 20-yard value, but the table publishes 10-yard
-- rows that are lower (fairway 2.18, rough 2.34, sand 2.43), so a short chip
-- was priced as a harder shot than it is (SC-11).
--
-- WHAT CHANGES. Both overloads take every Table B.1 row for tee, fairway,
-- rough, sand and recovery (recovery gains its 10-yard row, 3.45). 'Other'
-- keeps the owner's rule from 20261023170000 (rough to 50 yd, halfway between
-- rough and recovery from 100 yd, a straight blend between), now applied to
-- the published rows. Green (feet) is not in Table B.1 and is unchanged.
-- Below the first row a lie holds that row's value: 10 yd off the tee-less
-- lies, 100 yd off the tee. Unknown lies keep the fairway curve. The
-- interpolation, the scale argument and everything else stay as they are.
-- The two-argument overload gets the same rows, though a two-argument call
-- resolves to neither (Postgres reports it "not unique" beside the overload
-- with a defaulted scale); every caller passes the scale.
--
-- WHAT MOVES. With Q-89 a hole's strokes gained is expected(first shot) minus
-- strokes, so a round's total moves by the change in the tee value at each
-- hole's length (a 440-yard par 4: 4.18 to 4.08, so 0.10 less gained), plus a
-- hole whose last recorded shot is not holed. Within the total, strokes move
-- between categories wherever a shot started or ended between the old knots.
--
-- TS MIRROR: src/lib/golf/sg-tour-baseline.ts (one copy, read by
-- strokes-gained.ts, sg-benchmarks.ts and golf-stats-calculator-shots.ts);
-- src/lib/golf/__tests__/sg-tour-baseline.test.ts compares it with
-- supabase/schemas/functions/public.sql, which carries these bodies.
--
-- RECOMPUTE (separate step, service role, after apply; owner's go): the
-- RECOMPUTE block in the header of 20260930150000 (batched
-- recalculate_round_strokes_gained by player, then refresh_player_stats_cache,
-- then the three Standing refreshes). When this file is applied together with
-- 20260930150000 and 20261023170000, run it once, after this one. The Stats
-- pages compute SG in TypeScript on read and change when the app deploys.
--
-- noqa: disable=LT05
-- ROLLBACK: supabase/rollbacks/20261115215000_golf_sg_tour_curve_broadie_table.rollback.sql
-- noqa: enable=LT05
-- (the two bodies 20261023170000 leaves, verbatim), then the same RECOMPUTE.
-- noqa: disable=LT05
-- VERIFY: select 1 where public.sg_expected_strokes('tee'::text, 280::numeric, 1.0::numeric) = 3.65 and public.sg_expected_strokes('tee'::text, 440::numeric, 1.0::numeric) = 4.08 and public.sg_expected_strokes('fairway'::text, 60::numeric, 1.0::numeric) = 2.70 and public.sg_expected_strokes('sand'::text, 540::numeric, 1.0::numeric) = 5.68;
-- VERIFY: select 1 where public.sg_expected_strokes('fairway'::text, 10::numeric, 1.0::numeric) = 2.18 and public.sg_expected_strokes('rough'::text, 5::numeric, 1.0::numeric) = 2.34 and public.sg_expected_strokes('tee'::text, 80::numeric, 1.0::numeric) = 2.92 and public.sg_expected_strokes('recovery'::text, 10::numeric, 1.0::numeric) = 3.45;
-- VERIFY: select 1 where public.sg_expected_strokes('other'::text, 50::numeric, 1.0::numeric) = public.sg_expected_strokes('rough'::text, 50::numeric, 1.0::numeric) and public.sg_expected_strokes('other'::text, 100::numeric, 1.0::numeric) = 3.41 and public.sg_expected_strokes('green'::text, 1::numeric, 1.0::numeric) = 1.04;
-- noqa: enable=LT05

SET LOCAL lock_timeout = '3s';

DO $guard$
DECLARE
  v_src text;
BEGIN
  -- 20261023170000 first, exactly: both overloads must be its bodies, so this
  -- file never lands on the curve that file replaces.
  IF public.sg_normalize_lie('other') IS DISTINCT FROM 'other' THEN
    RAISE EXCEPTION 'sg tour curve: apply 20261023170000 first (sg_normalize_lie(''other'') is not ''other'').';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric';
  IF v_src IS NULL OR md5(v_src) <> '827794d179dfd9c0dc6c8d21e1dd2585' THEN
    RAISE EXCEPTION 'sg tour curve: live sg_expected_strokes(text,numeric) is not the body 20261023170000 leaves (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sg_expected_strokes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lie text, p_distance_yards numeric, p_scale numeric';
  IF v_src IS NULL OR md5(v_src) <> 'e8024d27a69eee41b92f596c416b7f13' THEN
    RAISE EXCEPTION 'sg tour curve: live sg_expected_strokes(text,numeric,numeric) is not the body 20261023170000 leaves (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_distances NUMERIC[]; v_strokes NUMERIC[]; v_distance NUMERIC;
  n INTEGER; i INTEGER; ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
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
  RETURN v_es * COALESCE(p_scale, 1.0);
END;
$$;
