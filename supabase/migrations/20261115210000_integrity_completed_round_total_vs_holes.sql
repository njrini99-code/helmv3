-- DECLARATIVE: exempt anchored patch of a live function body
-- (the same check block is in supabase/schemas/functions/public.sql)
--
-- Nightly integrity check: a completed round's total follows its holes
-- (launch readiness 2026-11-15, DATA-05; QUEUE row lr-data-05).
--
-- WHY: 20261114090100 made recompute_golf_round_totals keep total_score equal
--   to the holes' sum on a completed round whose hole rows number holes_played
--   and are all scored, and backfilled the 15 rounds that were one stroke off.
--   Nothing watches that it stays true. The golf_holes trigger only fires on a
--   hole write, so a later write to golf_rounds.total_score alone (an admin
--   tool, a script, a new save path) would put two totals on one round again
--   (src/lib/golf/round-total.ts:1-30), and no check would say so. This is a
--   guard: the launch-readiness read on 2026-11-15 found 0 mismatches on the
--   demo team, and 20261114090100's own VERIFY (same rule, every team) passed
--   on apply.
--
-- WHAT CHANGES: run_integrity_checks() gains one check,
--   completed_round_total_vs_holes: completed rounds whose golf_holes rows
--   number holes_played and are all scored, but whose total_score is not the
--   sum of those scores. It uses exactly the rule recompute_golf_round_totals
--   uses, so a round the trigger leaves alone (in progress, a missing hole row
--   or score, total-only) is never flagged. Count plus the 5 newest round ids,
--   like completed_round_zero_scored_holes. /api/cron/integrity-check needs no
--   change: it logs every check the function returns (pass at info, fail at
--   error, which feeds Sentry and the admin banner).
--   score_to_par follows the same rule in the trigger but is not checked here:
--   the backfill only rewrote rounds whose total was off, so older rounds'
--   score_to_par has not been read against their holes. Add it after a read
--   shows 0.
--   Cost: one GROUP BY over golf_holes (about 22,000 rows today) once a night.
--
-- HOW: an anchored text patch of the LIVE body (as 20261001120000 did), so
--   whatever the five earlier checks look like on each database is kept. The
--   block goes in front of the function's only `RETURN v;`. Refuses unless the
--   body carries 20261001120000's change and the anchor occurs exactly once;
--   a no-op once the check is there.
--
-- Expected after apply: the check passes (0). Read-only, before applying:
--   select count(*) from public.golf_rounds r join (select round_id,
--   count(*) as n, count(score) as n_scored, sum(score) as score_sum
--   from public.golf_holes group by round_id) h on h.round_id = r.id
--   where r.status = 'completed' and h.n = r.holes_played
--   and h.n_scored = h.n and r.total_score is distinct from h.score_sum;
--
-- ROLLBACK:
--   supabase/rollbacks/20261115210000_integrity_completed_round_total_vs_holes.rollback.sql -- noqa: LT05
--   removes the block by the reverse text replacement; nothing else moves.
--
-- pgTAP: supabase/tests/rls/integrity_completed_round_total_vs_holes.sql
--
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   to_regprocedure('public.run_integrity_checks()')
-- VERIFY:   and prosrc like '%completed_round_total_vs_holes%';
-- VERIFY: select 1 from jsonb_array_elements(public.run_integrity_checks()) c
-- VERIFY:   where c->>'check' = 'completed_round_total_vs_holes';

DO $patch$
DECLARE
  fn_definition text;
  marker CONSTANT text := 'completed_round_total_vs_holes';
  prerequisite CONSTANT text := 'r.front_nine IS NULL AND r.back_nine IS NULL';
  -- No leading spaces: production's body was applied from reformatted text, so
  -- its indentation is not assumed. The block keeps whatever precedes RETURN.
  anchor CONSTANT text := 'RETURN v;';
  patched CONSTANT text := $patched$-- Totals follow holes (20261114090100): a completed round whose hole rows
  -- number holes_played and are all scored stores their sum as its total.
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT r.id, row_number() OVER (ORDER BY r.created_at DESC) AS rn
    FROM golf_rounds r
    JOIN (
      SELECT h.round_id, count(*) AS holes, count(h.score) AS scored, sum(h.score) AS score_sum
      FROM golf_holes h
      GROUP BY h.round_id
    ) t ON t.round_id = r.id
    WHERE r.status = 'completed'
      AND t.holes = r.holes_played
      AND t.scored = t.holes
      AND r.total_score IS DISTINCT FROM t.score_sum
  ) q;
  v := v || jsonb_build_object('check', 'completed_round_total_vs_holes',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  RETURN v;$patched$;
  occurrences int;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_definition
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.run_integrity_checks()');

  IF fn_definition IS NULL THEN
    RAISE EXCEPTION 'public.run_integrity_checks() not found';
  END IF;

  IF position(marker IN fn_definition) > 0 THEN
    RAISE NOTICE 'run_integrity_checks already carries completed_round_total_vs_holes; unchanged';
    RETURN;
  END IF;

  IF position(prerequisite IN fn_definition) = 0 THEN
    RAISE EXCEPTION 'run_integrity_checks lacks 20261001120000 (total-only rounds); apply that first';
  END IF;

  occurrences := (length(fn_definition) - length(replace(fn_definition, anchor, ''))) / length(anchor);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'run_integrity_checks RETURN anchor found % times (expected 1); refusing unsafe patch', occurrences;
  END IF;

  -- CREATE OR REPLACE keeps the owner and SECURITY DEFINER.
  EXECUTE replace(fn_definition, anchor, patched);
END
$patch$;

-- CREATE OR REPLACE keeps the ACL; restated as the house convention.
REVOKE ALL ON FUNCTION public.run_integrity_checks()
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_checks() TO service_role;
