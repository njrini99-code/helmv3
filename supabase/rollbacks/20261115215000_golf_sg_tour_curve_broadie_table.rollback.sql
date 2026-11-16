-- Rollback for 20261115215000_golf_sg_tour_curve_broadie_table.sql (SC-03).
--
-- Forward change: branch claude/project-thread-5yymil (PR #2536).
-- Captured 2026-11-15 with pg_get_functiondef from a local stack carrying every
-- migration through 20261115200000: the two sg_expected_strokes bodies that
-- 20261023170000 leaves (prosrc md5 827794d179dfd9c0dc6c8d21e1dd2585 and
-- e8024d27a69eee41b92f596c416b7f13), verbatim. CREATE OR REPLACE keeps the
-- grants.
--
-- Then run the RECOMPUTE block in the header of 20260930150000 again, so the
-- stored strokes gained follow the old curve. Roll the app back with it
-- (src/lib/golf/sg-tour-baseline.ts), or the Stats pages, which compute SG in
-- TypeScript, read the new curve while the cache holds the old one.
--
-- Run as postgres, in one transaction.
--
-- VERIFY (after): returns one row.
--   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'sg_expected_strokes'
--   and md5(p.prosrc) in ('827794d179dfd9c0dc6c8d21e1dd2585', 'e8024d27a69eee41b92f596c416b7f13')
--   having count(*) = 2;

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
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
$function$
;
