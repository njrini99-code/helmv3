-- Rollback for 20261115230000_golf_one_gir_rule.sql (SC-05, SC-13).
--
-- Forward change: branch claude/project-thread-5yymil (PR #2536).
-- 1. The hole trigger and recompute_golf_round_totals go back to the bodies
--    the forward file replaced, verbatim (prosrc md5
--    b426f8b7ff8a4175f251e1b8adc5c648 and 6f3b61a248c50d79e21171866194e214),
--    and the hole trigger to its old column list. The shot trigger and its
--    function are dropped.
-- 2. Every archived hole gets its old gir and up_and_down back, under the
--    lifecycle guard's 'atomic' mark with the per-hole totals deferred, then
--    each touched round is recomputed once with the old body (its stats cache
--    and the player's cache follow through their triggers).
-- 3. The rule functions and the backfill function are dropped. The archive
--    table helm_private.golf_holes_gir_fix_20261115 is kept as the record of
--    what ran; drop it by hand once nobody needs it.
--
-- Run as postgres, in one transaction.
--
-- VERIFY (after): each returns one row.
--   select 1 from pg_proc where oid = to_regprocedure('public.golf_holes_set_gir_fn()') and md5(prosrc) = 'b426f8b7ff8a4175f251e1b8adc5c648';
--   select 1 from pg_proc where oid = to_regprocedure('public.recompute_golf_round_totals(uuid)') and md5(prosrc) = '6f3b61a248c50d79e21171866194e214';
--   select 1 where to_regprocedure('public.golf_hole_gir(integer,integer,integer,integer)') is null and not exists (select 1 from pg_trigger where tgname = 'golf_shots_refresh_hole_gir');
--   select 1 where not exists (select 1 from helm_private.golf_holes_gir_fix_20261115 a join public.golf_holes h on h.id = a.hole_id where h.gir is distinct from a.old_gir or h.up_and_down is distinct from a.old_up_and_down);

SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS golf_shots_refresh_hole_gir ON public.golf_shots;
DROP FUNCTION IF EXISTS public.golf_shots_refresh_hole_gir_fn();

CREATE OR REPLACE FUNCTION "public"."golf_holes_set_gir_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.par IS NOT NULL AND NEW.score IS NOT NULL THEN
    NEW.gir := (NEW.par >= 3
                AND NEW.score > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) <= (NEW.par - 2));
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION "public"."golf_holes_set_gir_fn"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "golf_holes_set_gir" BEFORE INSERT OR UPDATE OF "par", "score", "putts" ON "public"."golf_holes" FOR EACH ROW EXECUTE FUNCTION "public"."golf_holes_set_gir_fn"();

CREATE OR REPLACE FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE golf_rounds r
  SET
    -- NULL when no hole has a putt count: "not recorded", never 0 putts.
    total_putts = t.sum_putts,
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt_gir_known, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0),
    -- totals follow holes (20261114090100): on a completed round whose hole
    -- rows number holes_played and are all scored, total_score and
    -- score_to_par are the holes' own sums, as round-submit.ts computes them.
    -- Anything else (an in-progress save, the middle of a submit's hole
    -- rewrite) keeps what is stored.
    total_score = CASE
      WHEN r.status = 'completed'
       AND t.helm_holes > 0
       AND t.helm_holes = r.holes_played
       AND t.helm_scored = t.helm_holes
      THEN t.helm_score_sum
      ELSE r.total_score
    END,
    score_to_par = CASE
      WHEN r.status = 'completed'
       AND t.helm_holes > 0
       AND t.helm_holes = r.holes_played
       AND t.helm_scored = t.helm_holes
      THEN t.helm_score_sum - t.helm_par_sum
      ELSE r.score_to_par
    END
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      COUNT(*) AS helm_holes,
      COUNT(score) AS helm_scored,
      SUM(score) AS helm_score_sum,
      SUM(par) AS helm_par_sum,
      -- GIR needs the putt count: a hole without one is never credited.
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND putts IS NOT NULL
             AND (score - putts) > 0
             AND (score - putts) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      -- denominator: scored holes with a recorded putt count (was: every hole row)
      SUM(CASE WHEN score > 0 AND putts IS NOT NULL THEN 1 ELSE 0 END) AS cnt_gir_known,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      -- denominator: par-4/5 holes with a recorded fairway result (was: all par-4/5)
      SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$$;

ALTER FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") OWNER TO "postgres";

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
SELECT set_config('helm.defer_round_totals', 'on', true);

UPDATE public.golf_holes AS h
SET gir = a.old_gir,
    up_and_down = a.old_up_and_down
FROM helm_private.golf_holes_gir_fix_20261115 AS a
WHERE a.hole_id = h.id;

SELECT set_config('helm.defer_round_totals', '', true);

SELECT public.recompute_golf_round_totals(x.round_id)
FROM (SELECT DISTINCT a.round_id FROM helm_private.golf_holes_gir_fix_20261115 AS a) AS x;

SELECT set_config('helm.golf_lifecycle_write', '', true);

DROP FUNCTION IF EXISTS helm_private.golf_backfill_one_gir_rule();
DROP FUNCTION IF EXISTS public.golf_hole_shot_to_green(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.golf_hole_gir(integer, integer, integer, integer);
