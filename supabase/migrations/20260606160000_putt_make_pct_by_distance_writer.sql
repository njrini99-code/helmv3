-- STAGE 2: populate per-band putt make% on golf_player_stats_cache (was 100% NULL,
-- so the 5 putts_made_*_pct standing metrics produced 0 rows and CoachHelm
-- putt-distance insights had no/stale data — e.g. Nick Rini standing showed a
-- stale 94.8% from 3-5 ft vs the real 60.5%).
--
-- Adds true 15-25 and 25+ columns (matching golf_pga_standards + the research-doc
-- Tour make% bands). The legacy 15_20 / 20_plus columns remain literal for the
-- v2/fingerprint display consumers. Distance source: putt_distance_feet, else
-- distance_to_hole_before converted to feet. Made = putt_made OR result in
-- ('holed','hole').

ALTER TABLE public.golf_player_stats_cache
  ADD COLUMN IF NOT EXISTS putt_make_pct_15_25ft numeric,
  ADD COLUMN IF NOT EXISTS putt_make_pct_25_plus_ft numeric;

CREATE OR REPLACE FUNCTION public.update_player_putt_make_pct(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  WITH putts AS (
    SELECT COALESCE(gs.putt_distance_feet,
             CASE WHEN gs.distance_unit_before = 'feet' THEN gs.distance_to_hole_before
                  ELSE gs.distance_to_hole_before * 3 END) AS feet,
           (gs.putt_made = TRUE OR gs.result IN ('holed','hole')) AS made
    FROM golf_shots gs
    JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id
      AND r.status = 'completed'
      AND gs.shot_type = 'putting'
      AND COALESCE(gs.putt_distance_feet, gs.distance_to_hole_before) IS NOT NULL
  ),
  agg AS (
    SELECT
      ROUND(100.0*COUNT(*) FILTER (WHERE feet<3 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet<3),0),1)              AS p0_3,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=3 AND feet<5 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>=3 AND feet<5),0),1)  AS p3_5,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=5 AND feet<10 AND made)/ NULLIF(COUNT(*) FILTER (WHERE feet>=5 AND feet<10),0),1) AS p5_10,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=10 AND feet<15 AND made)/NULLIF(COUNT(*) FILTER (WHERE feet>=10 AND feet<15),0),1) AS p10_15,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=15 AND feet<20 AND made)/NULLIF(COUNT(*) FILTER (WHERE feet>=15 AND feet<20),0),1) AS p15_20,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=20 AND made)          / NULLIF(COUNT(*) FILTER (WHERE feet>=20),0),1)             AS p20_plus,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=15 AND feet<25 AND made)/NULLIF(COUNT(*) FILTER (WHERE feet>=15 AND feet<25),0),1) AS p15_25,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>=25 AND made)          / NULLIF(COUNT(*) FILTER (WHERE feet>=25),0),1)             AS p25_plus
    FROM putts WHERE feet IS NOT NULL
  )
  UPDATE golf_player_stats_cache psc
  SET putt_make_pct_0_3ft      = agg.p0_3,
      putt_make_pct_3_5ft      = agg.p3_5,
      putt_make_pct_5_10ft     = agg.p5_10,
      putt_make_pct_10_15ft    = agg.p10_15,
      putt_make_pct_15_20ft    = agg.p15_20,
      putt_make_pct_20_plus_ft = agg.p20_plus,
      putt_make_pct_15_25ft    = agg.p15_25,
      putt_make_pct_25_plus_ft = agg.p25_plus,
      updated_at               = now()
  FROM agg
  WHERE psc.player_id = p_player_id;
END;
$function$;
