-- STAGE 3: fairway% denominator. total_fairways must count par-4/5 holes where a
-- fairway result was actually recorded — not every par-4/5. Counting holes with a
-- NULL fairway_hit inflated the denominator and deflated driving accuracy
-- (demo player Nick Rini: 121/203 = 59.6% -> corrected 121/199 = 60.8%).
-- The TS write paths (golf.ts saveRound, admin-tracer-data.ts) are fixed in the
-- same change. golf_rounds.total_fairways is backfilled separately/idempotently.

CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(p_round_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE golf_rounds r
  SET
    total_putts = COALESCE(t.sum_putts, 0),
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND (score - COALESCE(putts, 0)) > 0
             AND (score - COALESCE(putts, 0)) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      COUNT(*) AS cnt,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      -- denominator: par-4/5 holes with a recorded fairway result (was: all par-4/5)
      SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$function$;
