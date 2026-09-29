-- CoachHelm deep audit row 24 (2026-09-28): putt make % by distance reads
-- test rounds and uncountable rounds. WRITTEN, NOT APPLIED. Apply only AFTER
-- 20260924120000_golf_countable_round_stats_cache.sql (OD-01), which creates
-- public.golf_round_is_countable; the DO block below refuses to run without it.
--
-- Why. update_player_putt_make_pct (production body read with
-- pg_get_functiondef on 2026-09-28, identical to
-- 20260609090000_cache_putt_band_attempts_and_lifetime_span.sql) joins
-- golf_rounds on status = 'completed' AND total_score IS NOT NULL only. It has
-- no is_test filter (applied 2026-09-27, 20260924130000) and no countable-round
-- rule. The audit's recompute: 2 of 285 player-band cells differ by up to
-- 13.4 pp from a non-test recompute, and 1 of 181 live putt_distance insights
-- carries that test-round value. OD-01's own header lists this function as a
-- follow-up it did not cover.
--
-- Change. The putts CTE and the first_round_date subquery both read only
-- rounds that are is_test = false AND golf_round_is_countable(...). Band
-- edges, clamps, the made predicate, columns written, SECURITY DEFINER,
-- search_path, owner and grants are unchanged (CREATE OR REPLACE keeps ACLs;
-- the REVOKE/GRANT pair is restated as in the 20260609 file).
--
-- Window. Deliberately NOT windowed: these are lifetime cache columns, and
-- the standing and fingerprint readers bind to them as lifetime. The
-- putt_distance generator labels the value lifetime and now publishes the
-- band n and a 95% interval next to it.
--
-- After apply (owner, service role) refresh every cache row so existing
-- values pick up the filter:
--   SELECT public.update_player_putt_make_pct(player_id)
--   FROM public.golf_player_stats_cache;
-- then let the next generator run (post-round or roster sweep) re-emit the
-- putt_distance insights.
--
-- ROLLBACK: CREATE OR REPLACE public.update_player_putt_make_pct with the body
-- in 20260609090000_cache_putt_band_attempts_and_lifetime_span.sql, then rerun
-- the refresh above.
-- VERIFY: select 1 from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'update_player_putt_make_pct'
--     and p.prosrc like '%is_test = false%'
--     and p.prosrc like '%golf_round_is_countable%';

DO $$
BEGIN
  IF to_regprocedure('public.golf_round_is_countable(text, integer, integer, integer, integer, integer, numeric)') IS NULL THEN
    RAISE EXCEPTION 'apply 20260924120000_golf_countable_round_stats_cache.sql (OD-01) first: golf_round_is_countable does not exist';
  END IF;
END $$;

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
      AND r.is_test = false
      AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)
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
      first_round_date            = (SELECT MIN(r.round_date) FROM golf_rounds r
                                     WHERE r.player_id = p_player_id
                                       AND r.status = 'completed' AND r.total_score IS NOT NULL
                                       AND r.is_test = false
                                       AND public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total)),
      updated_at                  = now()
  FROM agg
  WHERE psc.player_id = p_player_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid) FROM anon,
authenticated,
public;
GRANT EXECUTE ON FUNCTION public.update_player_putt_make_pct(
    uuid
) TO service_role;
