-- DECLARATIVE: exempt data backfill of golf_holes.gir / up_and_down and its
--   archive table (functions and triggers mirrored in supabase/schemas)
--
-- One GIR rule (stats and charts audit 2026-11-15, SC-05) and no up-and-down
-- on a green hit in regulation (SC-13).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md).
--
-- WHAT IS WRONG TODAY. Two rules write GIR. The app works each hole's flag
--   out from its shots (round-submit.ts, calculateGirFromShots), but the hole
--   trigger golf_holes_set_gir_fn overwrites it with score minus putts (null
--   putts counted as 0), and recompute_golf_round_totals counts the round's
--   greens with its own score-minus-putts test, skipping holes without putts.
--   A putter used from the fringe and logged as a putt reads as a green hit on
--   the card; a hole with no putt count reads as a missed green on the hole
--   and is left out of the round. And 4 demo holes carry an up-and-down on a
--   green hit in regulation (SC-13), which a scramble can never be.
--
-- WHAT CHANGES.
--   (1) public.golf_hole_gir(par, score, putts, shot_to_green) is the rule:
--       on the green in par minus 2 strokes or fewer, from the shots when they
--       record the whole hole (rows numbered 1 to the score, so a penalty
--       stroke never logged as a shot falls back), else from score minus
--       putts, NULL when neither can tell (no shots and no putt count, or an
--       unscored hole). public.golf_hole_shot_to_green() reads the shots.
--   (2) golf_holes_set_gir_fn writes the flag with it, and clears
--       up_and_down on a hole the shots show as a GIR (the card alone never
--       clears one: submit writes the holes before their shots). Its trigger
--       also fires on writes of gir, up_and_down, hole_number and round_id,
--       so no write leaves a flag off the rule. A new AFTER trigger on
--       golf_shots refreshes the hole's flag when its shots arrive or change
--       (submit writes holes, then shots).
--   (3) recompute_golf_round_totals counts total_gir and total_gir_possible
--       with the same function, hole by hole. Everything else in its body
--       (the 20261114090100 totals-follow-holes patch included) is unchanged.
--   (4) A backfill brings every stored hole onto the rule, archive first
--       (helm_private.golf_holes_gir_fix_20261115: old and new gir and
--       up_and_down plus the round's stats-cache row), under the lifecycle
--       guard's 'atomic' mark, then recomputes each touched round once; its
--       stats cache and the player's cache follow through their triggers.
--       It raises, and everything rolls back, if any archived hole is still
--       off the rule afterwards.
--
-- WHAT MOVES. Holes whose shots record them and disagree with the card
--   (a fringe putter: no GIR now). Holes with no putts and no shots: gir is
--   NULL (unknown) instead of false, so they leave the scramble count
--   (update_round_stats_cache counts gir = false as a scramble chance) as they
--   already were out of the round's greens. Up-and-downs on GIR holes are
--   cleared, which takes them out of the scramble figures. Round greens
--   (total_gir / total_gir_possible) move where a hole's shots now decide.
--   The final SELECT prints how many holes changed.
--
-- APP. No change needed: the trigger decides at submit, whatever the app
--   sends. Entry already defaults a stroke from off the green within 50 yd to
--   a chip (around_green), pinned by a test in the same PR.
--
-- ORDER. No migration prerequisite; the DO guard refuses unless
--   recompute_golf_round_totals is the body 20261114090100 leaves (md5
--   6f3b61a248c50d79e21171866194e214) and golf_holes_set_gir_fn the body
--   20260606190000 left (md5 b426f8b7ff8a4175f251e1b8adc5c648), and refuses a
--   second apply. 20261115231000 (SC-12) may go before or after. A re-run of
--   the backfill (select helm_private.golf_backfill_one_gir_rule();) is safe.
--
-- ROLLBACK: supabase/rollbacks/20261115230000_golf_one_gir_rule.rollback.sql
--   (the old bodies and trigger, the new functions and shot trigger dropped,
--   every archived hole restored, the touched rounds recomputed).
-- noqa: disable=LT05
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('public.golf_hole_gir(integer,integer,integer,integer)');
-- VERIFY: select 1 from pg_trigger where tgname = 'golf_shots_refresh_hole_gir' and tgrelid = 'public.golf_shots'::regclass;
-- VERIFY: select 1 where not exists (select 1 from public.golf_holes h where h.score is not null and h.gir is distinct from public.golf_hole_gir(h.par, h.score, h.putts, public.golf_hole_shot_to_green(h.round_id, h.hole_number, h.score)));
-- VERIFY: select 1 where not exists (select 1 from public.golf_holes h where h.gir is true and h.up_and_down is not null);
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'helm_private.golf_holes_gir_fix_20261115', 'SELECT') and not has_table_privilege('anon', 'helm_private.golf_holes_gir_fix_20261115', 'SELECT');
-- noqa: enable=LT05

SET LOCAL lock_timeout = '3s';

DO $guard$
DECLARE
  v_src text;
BEGIN
  -- Build on the live bodies exactly: recompute_golf_round_totals as
  -- 20261114090100 leaves it (its totals-follow-holes patch included) and the
  -- per-hole GIR trigger as 20260606190000 left it.
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.recompute_golf_round_totals(uuid)');
  IF v_src IS NULL OR md5(v_src) <> '6f3b61a248c50d79e21171866194e214' THEN
    RAISE EXCEPTION 'one GIR rule: live recompute_golf_round_totals(uuid) is not the body 20261114090100 leaves (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.golf_holes_set_gir_fn()');
  IF v_src IS NULL OR md5(v_src) <> 'b426f8b7ff8a4175f251e1b8adc5c648' THEN
    RAISE EXCEPTION 'one GIR rule: live golf_holes_set_gir_fn() is not the expected body (md5 %). Rebase this file on the live body.', md5(v_src);
  END IF;
END
$guard$;

-- (1) The rule ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.golf_hole_gir(
    p_par integer, p_score integer, p_putts integer, p_shot_to_green integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- A green in regulation: on the putting surface in par minus 2 strokes or
  -- fewer (PGA Tour). From the shots when they record the hole, else from the
  -- scorecard's score minus putts; unknown (NULL) when neither can tell.
  SELECT CASE
    WHEN p_par IS NULL OR p_score IS NULL OR p_score <= 0 THEN NULL
    WHEN p_shot_to_green IS NOT NULL THEN p_shot_to_green <= p_par - 2
    WHEN p_putts IS NULL THEN NULL
    ELSE (p_score - p_putts) > 0 AND (p_score - p_putts) <= p_par - 2
  END;
$$;

ALTER FUNCTION public.golf_hole_gir(integer, integer, integer, integer)
OWNER TO postgres;
REVOKE ALL ON FUNCTION public.golf_hole_gir(integer, integer, integer, integer)
FROM public, anon;
GRANT EXECUTE
ON FUNCTION public.golf_hole_gir(integer, integer, integer, integer)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.golf_hole_shot_to_green(
    p_round_id uuid, p_hole_number integer, p_score integer
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- The stroke that first reached the green (or holed), counting penalty
  -- rows, but only when the hole's shot rows are the whole hole: numbered 1
  -- to the score with none missing. Otherwise NULL, and the rule falls back
  -- to score minus putts (a penalty stroke never logged as a shot, a hole
  -- logged in part).
  SELECT CASE
    WHEN count(*) = p_score AND min(s.shot_number) = 1 AND max(s.shot_number) = p_score
    THEN min(s.shot_number) FILTER (WHERE s.result IN ('green', 'hole'))
  END
  FROM public.golf_shots AS s
  WHERE s.round_id = p_round_id
    AND s.hole_number = p_hole_number;
$$;

ALTER FUNCTION public.golf_hole_shot_to_green(uuid, integer, integer)
OWNER TO postgres;
REVOKE ALL ON FUNCTION public.golf_hole_shot_to_green(uuid, integer, integer)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_hole_shot_to_green(uuid, integer, integer)
TO authenticated, service_role;

-- (2) The hole's flag: written by the rule, on every hole write --------------

CREATE OR REPLACE FUNCTION public.golf_holes_set_gir_fn() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_shot_to_green integer;
BEGIN
  -- One GIR rule (20261115230000): public.golf_hole_gir, from the hole's
  -- shots when they record the whole hole, else from score minus putts. The
  -- round totals (recompute_golf_round_totals) read the same function.
  IF NEW.par IS NOT NULL AND NEW.score IS NOT NULL THEN
    v_shot_to_green := public.golf_hole_shot_to_green(NEW.round_id, NEW.hole_number, NEW.score);
    NEW.gir := public.golf_hole_gir(NEW.par, NEW.score, NEW.putts, v_shot_to_green);
  END IF;
  -- An up-and-down is a missed green got down in two: never on a GIR hole.
  -- Only the shots clear one. Submit writes the holes before the shots, so
  -- while the card alone decides, a recorded up-and-down is kept: the shots
  -- that follow can still show a missed green (a putter from the fringe the
  -- card counted as a putt), and the shot trigger clears it if they show a GIR.
  IF NEW.gir IS TRUE AND v_shot_to_green IS NOT NULL THEN
    NEW.up_and_down := NULL;
  END IF;
  RETURN NEW;
END
$$;

-- The trigger also runs when the flag itself, the up-and-down or the hole's
-- position is written, so no write can leave a flag off the rule.
CREATE OR REPLACE TRIGGER golf_holes_set_gir
BEFORE INSERT OR UPDATE OF
par, score, putts, gir, up_and_down, hole_number, round_id
ON public.golf_holes
FOR EACH ROW EXECUTE FUNCTION public.golf_holes_set_gir_fn();

-- The shots arrive after the holes (submit_round_atomic writes the holes,
-- then the shots one by one), so a shot write refreshes its hole's flag. Only
-- a hole whose flag the rule now reads differently is written; a normal round
-- writes none. (Row level: Postgres allows transition tables on one event
-- only, and submit writes its shots one row at a time anyway.)
CREATE OR REPLACE FUNCTION public.golf_shots_refresh_hole_gir_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round uuid;
  v_hole integer;
BEGIN
  FOR v_round, v_hole IN
    SELECT DISTINCT t.round_id, t.hole_number
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.round_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.hole_number END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.round_id END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.hole_number END)
    ) AS t (round_id, hole_number)
    WHERE t.round_id IS NOT NULL AND t.hole_number IS NOT NULL
  LOOP
    -- The hole's own trigger recomputes the flag on this write and clears
    -- an up-and-down the shots show to be on a green in regulation.
    UPDATE public.golf_holes AS gh
    SET gir = g.gir
    FROM (
      SELECT h.id, s.shot_to_green, public.golf_hole_gir(
        h.par, h.score, h.putts, s.shot_to_green
      ) AS gir
      FROM public.golf_holes AS h
      CROSS JOIN LATERAL (
        SELECT public.golf_hole_shot_to_green(h.round_id, h.hole_number, h.score) AS shot_to_green
      ) AS s
      WHERE h.round_id = v_round AND h.hole_number = v_hole AND h.score IS NOT NULL
    ) AS g
    WHERE gh.id = g.id
      AND (
        gh.gir IS DISTINCT FROM g.gir
        OR (g.gir IS TRUE AND g.shot_to_green IS NOT NULL AND gh.up_and_down IS NOT NULL)
      );
  END LOOP;
  RETURN NULL;
END
$$;

ALTER FUNCTION public.golf_shots_refresh_hole_gir_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.golf_shots_refresh_hole_gir_fn()
FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_shots_refresh_hole_gir
AFTER INSERT OR DELETE OR UPDATE OF
round_id, hole_number, shot_number, result
ON public.golf_shots
FOR EACH ROW EXECUTE FUNCTION public.golf_shots_refresh_hole_gir_fn();

-- (3) The round totals: the same rule, hole by hole --------------------------

CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      SUM(h.putts) AS sum_putts,
      COUNT(*) AS helm_holes,
      COUNT(h.score) AS helm_scored,
      SUM(h.score) AS helm_score_sum,
      SUM(h.par) AS helm_par_sum,
      -- One GIR rule (20261115230000): public.golf_hole_gir, the function the
      -- hole's own flag is written by (shots when they record the whole hole,
      -- else score minus putts). A hole it cannot read is in neither count.
      SUM(CASE WHEN g.gir IS TRUE THEN 1 ELSE 0 END) AS sum_gir,
      SUM(CASE WHEN g.gir IS NOT NULL THEN 1 ELSE 0 END) AS cnt_gir_known,
      SUM(CASE WHEN h.par >= 4 AND h.fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      -- denominator: par-4/5 holes with a recorded fairway result (was: all par-4/5)
      SUM(CASE WHEN h.par >= 4 AND h.fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes AS h
    CROSS JOIN LATERAL (
      SELECT public.golf_hole_gir(
        h.par, h.score, h.putts,
        public.golf_hole_shot_to_green(h.round_id, h.hole_number, h.score)
      ) AS gir
    ) AS g
    WHERE h.round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$$;

-- (4) Backfill, archive first ------------------------------------------------

CREATE TABLE IF NOT EXISTS helm_private.golf_holes_gir_fix_20261115 (
    hole_id uuid PRIMARY KEY,
    round_id uuid NOT NULL,
    old_gir boolean,
    new_gir boolean,
    old_up_and_down boolean,
    new_up_and_down boolean,
    stats_cache_before jsonb,
    archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helm_private.golf_holes_gir_fix_20261115
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helm_private.golf_holes_gir_fix_20261115
FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION helm_private.golf_backfill_one_gir_rule()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_changed integer;
  v_unfixed integer;
BEGIN
  -- Archive every scored hole whose flag the rule reads differently, or that
  -- carries an up-and-down on a green hit in regulation.
  INSERT INTO helm_private.golf_holes_gir_fix_20261115 (
    hole_id, round_id, old_gir, new_gir, old_up_and_down, new_up_and_down, stats_cache_before
  )
  SELECT
    h.id,
    h.round_id,
    h.gir,
    g.gir,
    h.up_and_down,
    CASE WHEN g.gir IS TRUE THEN NULL ELSE h.up_and_down END,
    (SELECT to_jsonb(c) FROM public.golf_round_stats_cache AS c WHERE c.round_id = h.round_id)
  FROM public.golf_holes AS h
  CROSS JOIN LATERAL (
    SELECT public.golf_hole_gir(
      h.par, h.score, h.putts,
      public.golf_hole_shot_to_green(h.round_id, h.hole_number, h.score)
    ) AS gir
  ) AS g
  WHERE h.score IS NOT NULL
    AND (h.gir IS DISTINCT FROM g.gir OR (g.gir IS TRUE AND h.up_and_down IS NOT NULL))
  -- A hole only matches while it is off the rule, so a re-run archives its
  -- current state again.
  ON CONFLICT (hole_id) DO UPDATE SET
    round_id = excluded.round_id,
    old_gir = excluded.old_gir,
    new_gir = excluded.new_gir,
    old_up_and_down = excluded.old_up_and_down,
    new_up_and_down = excluded.new_up_and_down,
    stats_cache_before = excluded.stats_cache_before,
    archived_at = excluded.archived_at;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  -- Completed rounds' holes change only under the lifecycle guard's
  -- transaction-local 'atomic' mark. The per-hole totals trigger is deferred
  -- and each touched round is recomputed once; that UPDATE of golf_rounds
  -- fires trg_update_round_stats_cache (greens, scrambling), whose cache row
  -- refreshes the player's in turn.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM set_config('helm.defer_round_totals', 'on', true);

  UPDATE public.golf_holes AS h
  SET gir = a.new_gir,
      up_and_down = a.new_up_and_down
  FROM helm_private.golf_holes_gir_fix_20261115 AS a
  WHERE a.hole_id = h.id
    AND a.archived_at = now();

  PERFORM set_config('helm.defer_round_totals', '', true);

  PERFORM public.recompute_golf_round_totals(x.round_id)
  FROM (
    SELECT DISTINCT a.round_id
    FROM helm_private.golf_holes_gir_fix_20261115 AS a
    WHERE a.archived_at = now()
  ) AS x;

  PERFORM set_config('helm.golf_lifecycle_write', '', true);

  SELECT count(*) INTO v_unfixed
  FROM helm_private.golf_holes_gir_fix_20261115 AS a
  INNER JOIN public.golf_holes AS h ON h.id = a.hole_id
  WHERE a.archived_at = now()
    AND (h.gir IS DISTINCT FROM a.new_gir OR h.up_and_down IS DISTINCT FROM a.new_up_and_down);
  IF v_unfixed > 0 THEN
    RAISE EXCEPTION 'one GIR rule backfill left % archived holes off the rule; rolling back', v_unfixed;
  END IF;

  RETURN v_changed;
END
$$;

ALTER FUNCTION helm_private.golf_backfill_one_gir_rule() OWNER TO postgres;
REVOKE ALL ON FUNCTION helm_private.golf_backfill_one_gir_rule()
FROM public, anon, authenticated;

SELECT helm_private.golf_backfill_one_gir_rule();
