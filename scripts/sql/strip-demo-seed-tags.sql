-- strip-demo-seed-tags.sql: take the "[seed-from-...]" tags out of the demo
-- team's round notes (launch readiness DD-02). For the owner to apply.
--
-- Why: the old clone seeders (removed with the demo generator) appended a tag
-- naming the real player each round was copied from to golf_rounds.notes, and
-- the round review prints notes. 90 demo-team rounds carried it on
-- 2026-11-15. This removes the text now; part B of golf-demo-cleanup.sql later
-- removes the cloned rounds themselves.
--
-- Scope: golf_rounds of the demo team (6ecdd1a6-63fe-4beb-b094-00118f334163)
-- whose notes contain the tag, and nothing else. The rest of a note is kept;
-- a note that held only the tag becomes NULL.
--
-- How to run: staging first, then production, in the Supabase SQL editor (role
-- postgres: the round guard lets only that role make this edit). The script
-- ends in ROLLBACK, so the first run only shows the counts. Read them, change
-- the last line to COMMIT and run it again.
--
-- Expected: "tagged" about 90 on production before, "still_tagged" 0 after.
-- Undo: none on purpose. The removed text names real people; the rest of each
-- note is unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Completed rounds are permanent history to guard_golf_round_lifecycle. The
-- owner mark (honoured for role postgres only) lets this one edit through;
-- the live-round broadcast stays off, since no round here is live.
SELECT pg_catalog.set_config('helm.golf_lifecycle_write', 'atomic', true);
SELECT pg_catalog.set_config('helm.round_live_off', 'on', true);

-- 1. Before.
SELECT count(*) AS tagged,
       count(*) FILTER (WHERE status = 'completed') AS completed,
       min(round_date) AS first_date,
       max(round_date) AS last_date
  FROM public.golf_rounds
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND notes ~ '\[seed-from-';

-- 2. Strip the tag, and the line break the seeder put before it.
UPDATE public.golf_rounds
   SET notes = NULLIF(btrim(regexp_replace(notes, '\n?\[seed-from-[^]]*\]', '', 'g'), E' \n'), '')
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND notes ~ '\[seed-from-';

-- 3. After: 0 expected in both columns (the second also catches any other
--    seed marker the coverage check looks for, in rounds and holes).
SELECT (SELECT count(*)
          FROM public.golf_rounds
         WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND notes ~ '\[seed-from-') AS still_tagged,
       (SELECT count(*)
          FROM public.golf_rounds AS r
          LEFT JOIN public.golf_holes AS h ON h.round_id = r.id
         WHERE r.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND (r.notes ~* '\[seed[-:]|seed-from-' OR h.notes ~* '\[seed[-:]|seed-from-')) AS other_seed_markers;

ROLLBACK; -- change to COMMIT once the counts above look right
