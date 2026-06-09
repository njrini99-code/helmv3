-- Phase E (window & sample-size honesty): the cache make-% bands carried NO
-- attempt counts, so a "0% from 25+ ft" could ship without disclosing it was
-- over 31 putts (Nick Rini, verified 2026-06-07) or 1. Add per-band attempt
-- counts so the generator can disclose n and gate below a floor. Also expose
-- first_round_date so cache-backed generators can stamp the TRUE lifetime span
-- (the refresh writer aggregates ALL completed+scored rounds — no 90d filter —
-- so window_days:90 was a cross-engine lie). Round set is UNCHANGED.

ALTER TABLE public.golf_player_stats_cache
  ADD COLUMN IF NOT EXISTS putt_attempts_3_5ft      integer,
  ADD COLUMN IF NOT EXISTS putt_attempts_5_10ft     integer,
  ADD COLUMN IF NOT EXISTS putt_attempts_10_15ft    integer,
  ADD COLUMN IF NOT EXISTS putt_attempts_15_25ft    integer,
  ADD COLUMN IF NOT EXISTS putt_attempts_25_plus_ft integer,
  ADD COLUMN IF NOT EXISTS first_round_date         date;

-- Rewrite update_player_putt_make_pct to ALSO emit attempt counts per band.
-- Identical band edges to migration 20260608130000 ('<=' upper, feet clamp,
-- never ×3) so the make-% and the attempt-n agree band-for-band.
CREATE OR REPLACE FUNCTION public.update_player_putt_make_pct(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  WITH putts AS (
    SELECT LEAST(GREATEST(gs.distance_to_hole_before, 0), 120) AS feet,
           (gs.result = 'hole' OR gs.putt_made IS TRUE) AS made
    FROM golf_shots gs
    JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
      AND lower(gs.shot_type) = 'putting' AND gs.distance_to_hole_before IS NOT NULL
  ),
  agg AS (
    SELECT
      ROUND(100.0*COUNT(*) FILTER (WHERE feet<=3 AND made)              / NULLIF(COUNT(*) FILTER (WHERE feet<=3),0),1)               AS p0_3,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>3  AND feet<=5  AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>3  AND feet<=5),0),1)   AS p3_5,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>5  AND feet<=10 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>5  AND feet<=10),0),1)  AS p5_10,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>10 AND feet<=15 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>10 AND feet<=15),0),1)  AS p10_15,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=20 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=20),0),1)  AS p15_20,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>20 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>20),0),1)               AS p20_plus,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=25 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=25),0),1)  AS p15_25,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>25 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>25),0),1)               AS p25_plus,
      COUNT(*) FILTER (WHERE feet>3  AND feet<=5)  AS n3_5,
      COUNT(*) FILTER (WHERE feet>5  AND feet<=10) AS n5_10,
      COUNT(*) FILTER (WHERE feet>10 AND feet<=15) AS n10_15,
      COUNT(*) FILTER (WHERE feet>15 AND feet<=25) AS n15_25,
      COUNT(*) FILTER (WHERE feet>25)              AS n25_plus
    FROM putts
  )
  UPDATE golf_player_stats_cache psc
  SET putt_make_pct_0_3ft         = agg.p0_3,
      putt_make_pct_3_5ft         = agg.p3_5,
      putt_make_pct_5_10ft        = agg.p5_10,
      putt_make_pct_10_15ft       = agg.p10_15,
      putt_make_pct_15_20ft       = agg.p15_20,
      putt_make_pct_20_plus_ft    = agg.p20_plus,
      putt_make_pct_15_25ft       = agg.p15_25,
      putt_make_pct_25_plus_ft    = agg.p25_plus,
      putt_attempts_3_5ft         = agg.n3_5,
      putt_attempts_5_10ft        = agg.n5_10,
      putt_attempts_10_15ft       = agg.n10_15,
      putt_attempts_15_25ft       = agg.n15_25,
      putt_attempts_25_plus_ft    = agg.n25_plus,
      first_round_date            = (SELECT MIN(round_date) FROM golf_rounds
                                     WHERE player_id = p_player_id
                                       AND status = 'completed' AND total_score IS NOT NULL),
      updated_at                  = now()
  FROM agg
  WHERE psc.player_id = p_player_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid) TO service_role;

DO $$
DECLARE v_pid uuid;
BEGIN
  FOR v_pid IN SELECT player_id FROM golf_player_stats_cache LOOP
    PERFORM public.update_player_putt_make_pct(v_pid);
  END LOOP;
END $$;

-- VERIFIED 2026-06-09 against prod (qmnssrrolpinvwjjnufo): all 6 new columns
--   (putt_attempts_3_5ft..putt_attempts_25_plus_ft, first_round_date) exist on
--   golf_player_stats_cache and are populated 20/20 active players.
-- HISTORY: recorded as version 20260608075722
--   ('cache_putt_band_attempts_and_lifetime_span') — apply-time stamp from MCP
--   apply_migration, NOT this filename. Do not re-apply via db push.
-- ROLLBACK: restore the prior update_player_putt_make_pct definition, then
--   ALTER TABLE public.golf_player_stats_cache DROP COLUMN the 6 columns
--   (generators gate on NULL attempts, so dropping is read-path safe).
