-- Rollback for 20261115210000_integrity_completed_round_total_vs_holes.sql.
--
-- Removes the completed_round_total_vs_holes block from run_integrity_checks()
-- by the reverse text replacement: the forward file inserted that block,
-- verbatim, in front of the function's only `RETURN v;`, so taking it out
-- restores the body each database ran before, byte for byte. Refuses unless
-- the block occurs exactly once. No data changes either way.
--
-- Prior definition: not captured from the production catalog (the thread that
-- wrote this has no production reads). The reverse replacement does not need
-- it; supabase/schemas/functions/public.sql at the parent of the forward
-- commit holds the expected prior body.
-- Forward change: branch claude/project-thread-vt56zc (QUEUE row lr-data-05).
-- Cost of rolling back: the nightly integrity run stops reporting
-- completed_round_total_vs_holes; nothing else changes.
-- Run as postgres, in one transaction (db query --linked does that).
--
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   to_regprocedure('public.run_integrity_checks()')
-- VERIFY:   and prosrc not like '%completed_round_total_vs_holes%';

DO $unpatch$
DECLARE
  fn_definition text;
  block CONSTANT text := $block$-- Totals follow holes (20261114090100): a completed round whose hole rows
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
  RETURN v;$block$;
  occurrences int;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_definition
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.run_integrity_checks()');

  IF fn_definition IS NULL THEN
    RAISE EXCEPTION 'public.run_integrity_checks() not found';
  END IF;

  occurrences := (length(fn_definition) - length(replace(fn_definition, block, ''))) / length(block);
  IF occurrences = 0 THEN
    RAISE NOTICE 'run_integrity_checks does not carry completed_round_total_vs_holes; unchanged';
    RETURN;
  END IF;
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'completed_round_total_vs_holes block found % times (expected 1); refusing', occurrences;
  END IF;

  EXECUTE replace(fn_definition, block, 'RETURN v;');
END
$unpatch$;

REVOKE ALL ON FUNCTION public.run_integrity_checks()
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_checks() TO service_role;
