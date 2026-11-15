-- Rollback for 20261114090100_round_totals_follow_holes.sql.
--
-- 1. Puts each archived round's total_score and score_to_par back, but only
--    where both still hold the values the migration wrote (a round changed
--    since is left alone). The stats cache trigger refreshes each round's
--    golf_round_stats_cache row in the same transaction.
-- 2. Removes the totals patch from recompute_golf_round_totals by the reverse
--    text replacement, so whichever putts/GIR body the database ran before is
--    restored exactly. Refuses unless the patched block occurs exactly once.
-- The archive table helm_private.golf_rounds_total_score_fix_20261114 is kept
-- as the record; drop it separately once nobody needs it.
-- Run as postgres, in one transaction (db query --linked does that).

SET LOCAL lock_timeout = '3s';

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);

UPDATE public.golf_rounds AS r
SET
    total_score = a.old_total_score,
    score_to_par = a.old_score_to_par
FROM helm_private.golf_rounds_total_score_fix_20261114 AS a
WHERE
    a.round_id = r.id
    AND r.total_score IS NOT DISTINCT FROM a.new_total_score
    AND r.score_to_par IS NOT DISTINCT FROM a.new_score_to_par;

SELECT set_config('helm.golf_lifecycle_write', '', true);

DO $unpatch$
DECLARE
  fn_definition text;
  anchor CONSTANT text := $anchor$    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
$anchor$;
  patched CONSTANT text := $patched$    total_fairways = COALESCE(t.cnt_par4plus, 0),
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
$patched$;
  occurrences int;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_definition
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.recompute_golf_round_totals(uuid)');

  IF fn_definition IS NULL THEN
    RAISE EXCEPTION 'recompute_golf_round_totals(uuid) not found';
  END IF;

  occurrences := (length(fn_definition) - length(replace(fn_definition, patched, ''))) / length(patched);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'totals patch found % times in recompute_golf_round_totals (expected 1); refusing', occurrences;
  END IF;

  EXECUTE replace(fn_definition, patched, anchor);
END
$unpatch$;
