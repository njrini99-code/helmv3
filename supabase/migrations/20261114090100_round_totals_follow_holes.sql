-- DECLARATIVE: exempt backfill plus an anchored patch of a live function
--
-- golf_rounds.total_score (and score_to_par) of a completed round follow its
-- holes (audit F-0003).
--
-- WHY: 15 of 1,218 completed rounds on production (the same 15 on staging,
--   read 2026-11-14) store a total_score one stroke off the sum of their
--   golf_holes.score, while front_nine and back_nine are right. All 15 have
--   every hole scored (18 of 18), were created in April 2026 and have not been
--   written since; each one's score_to_par equals its stored total minus the
--   holes' par, so it is off by the same stroke. Root cause
--   (src/lib/golf/round-total.ts:1-30): total_score, front_nine and back_nine
--   are written once at submit, and nothing rewrites total_score after a hole
--   changes. recompute_golf_round_totals, which the golf_holes trigger runs on
--   every hole write, refreshes putts, GIR and fairways only.
--
-- WHAT CHANGES:
--   (1) recompute_golf_round_totals also sets total_score = SUM(score) and
--       score_to_par = SUM(score) - SUM(par) (round-submit.ts:803-805 computes
--       both the same way, over the same holes), but only on a COMPLETED round
--       whose hole rows number exactly holes_played and are all scored.
--       Anything else keeps what is stored:
--         * an in-progress round's auto-save changes nothing here;
--         * submit_round_atomic marks the round completed BEFORE it deletes and
--           re-inserts the holes, so mid-rewrite (fewer rows than
--           holes_played) nothing is written, and the last hole INSERT writes
--           the total submit has already checked equals the holes' sum.
--       Built as an anchored text patch of the LIVE body (as 20261031134708
--       and 20261001000000 patch submit_round_atomic), so the putts/GIR rules
--       each database runs are kept as they are. Refuses unless the anchor
--       occurs exactly once; a no-op if the patch is already there.
--       Hot path: no new statement, trigger or firing. The patch adds four
--       aggregates to the subquery the UPDATE already runs over the round's
--       own hole rows (at most 18) and two CASE columns to the same UPDATE.
--       trg_update_round_stats_cache already fires on that UPDATE for a
--       completed round (total_putts is in its SET list) and stays filtered
--       out (WHEN status = 'completed') for an in-progress one;
--       golf_rounds_round_live_upd lists neither column. Works unchanged with
--       the held 20261023152000 (it defers the per-row recompute and runs this
--       function once after the last hole INSERT).
--       Today only postgres-owned atomic paths can change a completed round's
--       holes (helm_private.reject_completed_round_child_mutation refuses
--       everything else), so this guards the next such edit; it never fires
--       for a signed-in user's write to a completed round.
--   (2) Backfill, archive first (as 20261031140000): every completed round
--       matching the same rule whose total_score differs from its holes' sum
--       is copied whole (row_before) with old and new values, and its
--       golf_round_stats_cache row (stats_cache_before), into
--       helm_private.golf_rounds_total_score_fix_20261114. Then total_score
--       and score_to_par are set under the lifecycle guard's own
--       transaction-local 'atomic' bypass, and the statement after checks that
--       no other column moved. The stats cache trigger refreshes each round's
--       cache row in the same transaction. updated_at is not touched.
--
-- ORDER: no prerequisite. 20261017110000 is applied on production
--   (2026-10-31) and on staging, so both run the same recompute body, and the
--   anchor is also present in 20260606190000 and 20260708141000. Any LATER
--   full CREATE OR REPLACE of recompute_golf_round_totals (for example the
--   held draft 20260708141000) drops this patch silently: re-run this file's
--   patch block after one (it is idempotent), or build that file on this body.
--
-- ROLLBACK:
--   supabase/rollbacks/20261114090100_round_totals_follow_holes.rollback.sql -- noqa: LT05
--   puts each archived round's total_score and score_to_par back (only where
--   they still hold the values written here) and removes the patch from
--   recompute_golf_round_totals by the reverse text replacement. The archive
--   table is kept.
--
-- pgTAP: supabase/tests/rls/golf_round_totals_follow_holes.sql
--
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   to_regprocedure('public.recompute_golf_round_totals(uuid)')
-- VERIFY:   and prosrc like '%totals follow holes (20261114090100)%';
-- VERIFY: select 1 where not exists (select 1 from public.golf_rounds r
-- VERIFY:   join (select round_id, count(*) as n, count(score) as n_scored,
-- VERIFY:   sum(score) as score_sum from public.golf_holes group by round_id) h
-- VERIFY:   on h.round_id = r.id where r.status = 'completed'
-- VERIFY:   and h.n = r.holes_played and h.n_scored = h.n
-- VERIFY:   and r.total_score is distinct from h.score_sum);
-- VERIFY: select 1 where not exists (select 1 from
-- VERIFY:   helm_private.golf_rounds_total_score_fix_20261114 a
-- VERIFY:   join public.golf_round_stats_cache c on c.round_id = a.round_id
-- VERIFY:   where c.total_score is distinct from a.new_total_score);
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY:   'helm_private.golf_rounds_total_score_fix_20261114', 'SELECT')
-- VERIFY:   and not has_table_privilege('anon',
-- VERIFY:   'helm_private.golf_rounds_total_score_fix_20261114', 'SELECT');

-- The backfill row-locks the rounds it fixes; nothing here takes a table lock
-- beyond CREATE TABLE on the new archive. db:apply runs the file in one
-- transaction, so SET LOCAL holds for exactly this apply.
SET LOCAL lock_timeout = '3s';

-- (1) recompute_golf_round_totals: totals follow holes on a completed round --

DO $patch$
DECLARE
  fn_definition text;
  marker CONSTANT text := 'totals follow holes (20261114090100)';
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

  IF position(marker IN fn_definition) > 0 THEN
    RAISE NOTICE 'recompute_golf_round_totals already carries the totals patch; unchanged';
    RETURN;
  END IF;

  occurrences := (length(fn_definition) - length(replace(fn_definition, anchor, ''))) / length(anchor);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'recompute_golf_round_totals totals anchor found % times (expected 1); refusing unsafe patch', occurrences;
  END IF;

  -- CREATE OR REPLACE keeps the owner, the ACL and the trigger that calls it.
  EXECUTE replace(fn_definition, anchor, patched);
END
$patch$;

-- (2) Backfill, archive first -----------------------------------------------

-- The four score columns stay integer: they mirror golf_rounds.total_score and
-- golf_rounds.score_to_par, which are integer.
CREATE TABLE IF NOT EXISTS helm_private.golf_rounds_total_score_fix_20261114 (
    round_id uuid PRIMARY KEY,
    -- squawk-ignore prefer-bigint-over-int
    old_total_score integer,
    -- squawk-ignore prefer-bigint-over-int
    new_total_score integer NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    old_score_to_par integer,
    -- squawk-ignore prefer-bigint-over-int
    new_score_to_par integer,
    row_before jsonb NOT NULL,
    stats_cache_before jsonb,
    archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helm_private.golf_rounds_total_score_fix_20261114
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helm_private.golf_rounds_total_score_fix_20261114
FROM public, anon, authenticated;

WITH holes AS (
    SELECT
        h.round_id,
        count(*) AS n,
        count(h.score) AS n_scored,
        sum(h.score) AS score_sum,
        sum(h.par) AS par_sum
    FROM public.golf_holes AS h
    GROUP BY h.round_id
)

INSERT INTO helm_private.golf_rounds_total_score_fix_20261114 (
    round_id, old_total_score, new_total_score, old_score_to_par,
    new_score_to_par, row_before, stats_cache_before
)
SELECT
    r.id,
    r.total_score,
    h.score_sum,
    r.score_to_par,
    h.score_sum - h.par_sum AS new_score_to_par,
    to_jsonb(r) AS row_before,
    (
        SELECT to_jsonb(c)
        FROM public.golf_round_stats_cache AS c
        WHERE c.round_id = r.id
    ) AS stats_cache_before
FROM public.golf_rounds AS r
INNER JOIN holes AS h ON r.id = h.round_id
WHERE
    r.status = 'completed'
    AND h.n > 0
    AND h.n = r.holes_played
    AND h.n_scored = h.n
    AND r.total_score IS DISTINCT FROM h.score_sum
-- A round only matches while it is drifted, so a re-run (say after the
-- rollback file) archives its current state again.
ON CONFLICT (round_id) DO UPDATE SET
    old_total_score = excluded.old_total_score,
    new_total_score = excluded.new_total_score,
    old_score_to_par = excluded.old_score_to_par,
    new_score_to_par = excluded.new_score_to_par,
    row_before = excluded.row_before,
    stats_cache_before = excluded.stats_cache_before,
    archived_at = excluded.archived_at;

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);

UPDATE public.golf_rounds AS r
SET
    total_score = a.new_total_score,
    score_to_par = a.new_score_to_par
FROM helm_private.golf_rounds_total_score_fix_20261114 AS a
WHERE
    a.round_id = r.id
    AND a.archived_at = now()
    AND r.total_score IS NOT DISTINCT FROM a.old_total_score;

SELECT set_config('helm.golf_lifecycle_write', '', true);

-- Nothing but total_score and score_to_par may differ from the archived row
-- (rows archived in this transaction), and each now holds the holes' sum.
DO $check$
DECLARE
  drifted int;
  unfixed int;
BEGIN
  SELECT count(*) INTO drifted
  FROM helm_private.golf_rounds_total_score_fix_20261114 a
  JOIN public.golf_rounds r ON r.id = a.round_id
  WHERE a.archived_at = now()
    AND (to_jsonb(r) - ARRAY['total_score', 'score_to_par'])
      IS DISTINCT FROM (a.row_before - ARRAY['total_score', 'score_to_par']);
  IF drifted > 0 THEN
    RAISE EXCEPTION 'total_score backfill changed % rounds beyond total_score and score_to_par; rolling back', drifted;
  END IF;

  SELECT count(*) INTO unfixed
  FROM helm_private.golf_rounds_total_score_fix_20261114 a
  JOIN public.golf_rounds r ON r.id = a.round_id
  WHERE a.archived_at = now()
    AND (r.total_score IS DISTINCT FROM a.new_total_score
      OR r.score_to_par IS DISTINCT FROM a.new_score_to_par);
  IF unfixed > 0 THEN
    RAISE EXCEPTION 'total_score backfill left % archived rounds unfixed; rolling back', unfixed;
  END IF;
END
$check$;
