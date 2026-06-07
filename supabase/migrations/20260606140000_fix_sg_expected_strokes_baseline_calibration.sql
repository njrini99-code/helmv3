-- Fix: recalibrate sg_expected_strokes() to Broadie-canonical PGA Tour baselines.
--
-- ROOT CAUSE (verified 2026-06-06): the prior expected-strokes curves were
-- internally inconsistent and mis-calibrated, producing nonsense per-category
-- Strokes Gained that cancelled to a near-zero, plausible-looking total:
--   * TEE curve too high AND had no data below 260 yd, so a 442-yd par-4 read
--     4.50 (true ≈ 4.18) and every par-3 / short tee shot floored at 3.62.
--     -> phantom +0.5/drive off the tee (+7.76/round for the demo player).
--   * FAIRWAY / ROUGH curves sagged ~0.3-0.5 below Tour in the scoring band
--     (fairway 140 = 2.61 vs Broadie 2.91; rough 100 = 2.54 vs 3.02).
--   * GREEN/putting curve too low in the makeable range (8 ft = 1.24 vs 1.50),
--     under-crediting every made putt -> phantom -0.23/putt (-7.32/round).
-- Off-tee inflation and putting deflation cancelled, masking the corruption.
--
-- FIX: replace all lie curves with Broadie "Every Shot Counts" / PGA Tour
-- ShotLink expected-strokes-to-hole anchors (2004-2012 baseline, the canonical
-- source cited in docs/v3-research-golf-domain.md). The function interpolates
-- linearly between anchors, so anchors-only is exact at the published points and
-- smooth between. The TEE curve now extends down to 80 yd so par-3 tee shots
-- (categorised as approach, lie='tee') are no longer floored at 3.62.
--
-- Putting anchors derived from / consistent with the Tour make% table in the
-- research doc (3ft 1.04, 5ft 1.23, 8ft 1.50, 10ft 1.61, 20ft 1.87, 30ft 1.98,
-- 50ft 2.14, 90ft 2.40).
--
-- Read-only verification (demo player Nick Rini, 15 rounds) before/after:
--   off_tee +7.76 -> +1.15 | approach +1.61 -> -1.14 |
--   around_green -1.37 -> +0.20 | putting -7.32 -> -3.91 | TOTAL +0.68 -> -3.70
-- Roster-wide: SG_total now tracks (strokes over par) with a tight ~-0.2
-- residual (the expected offset, since Tour plays slightly under par), e.g.
-- Tyler Hayes -3.21 vs +3.09; Luke Wise -5.37 vs +5.23.
--
-- This migration changes the engine only. Caches/standing must be recomputed
-- (recalculate_round_strokes_gained -> update_player_stats_strokes_gained ->
-- refresh_player_standing) for the change to surface; that recompute is run
-- separately/idempotently.

CREATE OR REPLACE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_distances NUMERIC[];
  v_strokes   NUMERIC[];
  v_distance  NUMERIC;
  n           INTEGER;
  i           INTEGER;
  ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    -- convert yards -> feet for green lookups
    v_distance  := p_distance_yards * 3.0;
    -- feet -> expected putts (Broadie PGA Tour)
    v_distances := ARRAY[90,60,50,40,30,20,15,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.21,2.14,2.06,1.98,1.87,1.78,1.61,1.56,1.50,
                         1.42,1.34,1.23,1.13,1.04,1.01,1.00,0]::NUMERIC[];

  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    -- extended below 200 yd so par-3 / short tee shots are not floored at 3.62
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

  ELSE -- unknown lie -> fairway baseline
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  END IF;

  IF v_distance <= 0 THEN RETURN 0; END IF;

  n := array_length(v_distances, 1);

  IF v_distance >= v_distances[1]  THEN RETURN v_strokes[1]; END IF;
  IF v_distance <= v_distances[n]  THEN RETURN v_strokes[n]; END IF;

  FOR i IN 1..(n - 1) LOOP
    ud := v_distances[i];
    ld := v_distances[i + 1];
    IF v_distance <= ud AND v_distance >= ld THEN
      us := v_strokes[i];
      ls := v_strokes[i + 1];
      RETURN ls + (v_distance - ld) / (ud - ld) * (us - ls);
    END IF;
  END LOOP;

  RETURN 3.0;
END;
$function$;
