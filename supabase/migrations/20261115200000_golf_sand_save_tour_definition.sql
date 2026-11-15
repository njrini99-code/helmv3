-- DECLARATIVE: exempt data backfill of golf_holes.sand_save and its archive table (functions mirrored in supabase/schemas/functions/helm_private.sql)
--
-- Sand saves on the PGA Tour's definition (stats and charts audit
-- 2026-11-15, SC-02).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md).
--
-- WHAT IS WRONG: the tracker wrote golf_holes.sand_save = true only when the
--   player got out of a greenside bunker and holed in two strokes or fewer
--   AND made par or better (src/lib/utils/shot-helpers.ts:253 before this
--   change). The PGA Tour's sand-save % counts any greenside bunker holed in
--   two or fewer, whatever the score, and so does the 50% benchmark in
--   golf_pga_standards that Clubhouse grades it against. A bogey out in two
--   after a penalty was an attempt with no save, so every player read low
--   against the Tour line. The database only counts the flag
--   (update_round_stats_cache, refresh_player_standing,
--   sg_estimate_from_holes), so the stored flags are what must change.
--
-- WHAT CHANGES:
--   (1) helm_private.golf_hole_sand_save_tour(hole_id): the Tour rule over a
--       hole's shots, the same rule calculateHoleStats now writes: the hole's
--       first greenside-bunker shot (shot_type 'around_green' from lie
--       'sand'), holed in two strokes or fewer counting that shot. Strokes are
--       the non-penalty shots, as the tracker counts them. NULL when the hole
--       has no greenside-bunker shot.
--   (2) helm_private.golf_backfill_sand_save_tour(): for every hole of a
--       COMPLETED round whose shots hole out (a non-penalty shot with result
--       'hole'), sets sand_save to (1) where it differs. Scorecard-only holes
--       (no shots) and holes whose shots stop short of the hole keep what is
--       stored. Archive first: each changed hole's old and new value and its
--       round's stats-cache row go to
--       helm_private.golf_holes_sand_save_fix_20261115. The update runs under
--       the lifecycle guard's transaction-local 'atomic' mark and with
--       helm.defer_round_totals on, so no round total is rewritten (sand_save
--       is not a round total). Then each touched round's
--       golf_round_stats_cache row is refreshed (a no-op UPDATE OF status on
--       golf_rounds fires trg_update_round_stats_cache, which fires
--       update_player_stats_complete in turn). Returns the holes changed.
--   (3) Runs (2) once. A later re-run is safe: it only touches holes whose
--       stored flag still differs from the Tour rule.
--
-- ORDER: deploy the app change in the same PR first (shot-helpers.ts writes
--   the Tour rule from then on), then apply this file. Applied before the
--   deploy, rounds submitted in between are written on the old rule; re-run
--   `select helm_private.golf_backfill_sand_save_tour();` after the deploy to
--   catch them. No migration prerequisite.
--
-- PREVIEW (read-only, before applying): holes that would change, by
--   direction.
--   select h.sand_save as stored, helm_private.golf_hole_sand_save_tour(h.id) as tour, count(*)
--   from public.golf_holes h join public.golf_rounds r on r.id = h.round_id
--   where r.status = 'completed' and exists (select 1 from public.golf_shots s
--     where s.hole_id = h.id and s.result = 'hole' and s.is_penalty is not true)
--   group by 1, 2 order by 1, 2;
--   (The function is created by this file, so run the preview after a dry run
--   or on a scratch copy; expected: mostly false -> true, bogeys or worse out
--   in two.)
--
-- ROLLBACK:
--   supabase/rollbacks/20261115200000_golf_sand_save_tour_definition.rollback.sql -- noqa: LT05
--   puts each archived hole's old sand_save back (only where it still holds
--   the value written here), refreshes those rounds' stats caches, and drops
--   the two functions. The archive table is kept.
--
-- pgTAP: supabase/tests/rls/golf_sand_save_tour_backfill.sql
--
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('helm_private.golf_hole_sand_save_tour(uuid)');
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('helm_private.golf_backfill_sand_save_tour()');
-- VERIFY: select 1 where not exists (select 1 from helm_private.golf_holes_sand_save_fix_20261115 a
-- VERIFY:   join public.golf_holes h on h.id = a.hole_id where h.sand_save is distinct from a.new_sand_save);
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY:   'helm_private.golf_holes_sand_save_fix_20261115', 'SELECT')
-- VERIFY:   and not has_table_privilege('anon',
-- VERIFY:   'helm_private.golf_holes_sand_save_fix_20261115', 'SELECT');

-- db:apply runs the file in one transaction, so SET LOCAL holds for exactly
-- this apply. The backfill row-locks the holes and rounds it touches.
SET LOCAL lock_timeout = '3s';

-- (1) The Tour rule over a hole's shots -----------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_hole_sand_save_tour(p_hole_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Sand save on the PGA Tour's definition (SC-02): the hole's first
  -- greenside-bunker shot, holed in two strokes or fewer counting it, whatever
  -- the score. NULL: no greenside-bunker shot. Strokes are the non-penalty
  -- shots (src/lib/utils/shot-helpers.ts calculateHoleStats). A shot belongs to
  -- the hole by hole_id, or by round and hole number when an old row has none.
  WITH hole AS (
    SELECT h.id, h.round_id, h.hole_number
    FROM public.golf_holes AS h
    WHERE h.id = p_hole_id
  ),
  strokes AS (
    SELECT s.shot_number, s.shot_type, s.lie_before
    FROM public.golf_shots AS s
    INNER JOIN hole ON (
      s.hole_id = hole.id
      OR (s.hole_id IS NULL AND s.round_id = hole.round_id AND s.hole_number = hole.hole_number)
    )
    WHERE s.is_penalty IS NOT TRUE
  ),
  first_sand AS (
    SELECT min(strokes.shot_number) AS shot_number
    FROM strokes
    WHERE strokes.lie_before = 'sand' AND strokes.shot_type = 'around_green'
  )
  SELECT CASE
    WHEN f.shot_number IS NULL THEN NULL
    ELSE (SELECT count(*) FROM strokes WHERE strokes.shot_number >= f.shot_number) <= 2
  END
  FROM first_sand AS f;
$$;

ALTER FUNCTION helm_private.golf_hole_sand_save_tour(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION helm_private.golf_hole_sand_save_tour(uuid) FROM PUBLIC, anon, authenticated;

-- (2) The archive and the backfill -----------------------------------------

CREATE TABLE IF NOT EXISTS helm_private.golf_holes_sand_save_fix_20261115 (
    hole_id uuid PRIMARY KEY,
    round_id uuid NOT NULL,
    old_sand_save boolean,
    new_sand_save boolean,
    stats_cache_before jsonb,
    archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helm_private.golf_holes_sand_save_fix_20261115
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helm_private.golf_holes_sand_save_fix_20261115
FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION helm_private.golf_backfill_sand_save_tour()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_changed integer;
  v_unfixed integer;
  v_cache_off integer;
BEGIN
  -- Archive every hole whose stored flag differs from the Tour rule: holes of
  -- completed rounds whose shots hole out. Scorecard-only holes and holes
  -- whose shots stop short of the hole are never read.
  INSERT INTO helm_private.golf_holes_sand_save_fix_20261115 (
    hole_id, round_id, old_sand_save, new_sand_save, stats_cache_before
  )
  SELECT
    h.id,
    h.round_id,
    h.sand_save,
    t.tour,
    (SELECT to_jsonb(c) FROM public.golf_round_stats_cache AS c WHERE c.round_id = h.round_id)
  FROM public.golf_holes AS h
  INNER JOIN public.golf_rounds AS r ON r.id = h.round_id
  CROSS JOIN LATERAL (SELECT helm_private.golf_hole_sand_save_tour(h.id) AS tour) AS t
  WHERE r.status = 'completed'
    AND EXISTS (
      SELECT 1
      FROM public.golf_shots AS s
      WHERE (s.hole_id = h.id OR (s.hole_id IS NULL AND s.round_id = h.round_id AND s.hole_number = h.hole_number))
        AND s.result = 'hole'
        AND s.is_penalty IS NOT TRUE
    )
    AND h.sand_save IS DISTINCT FROM t.tour
  ON CONFLICT (hole_id) DO UPDATE SET
    round_id = excluded.round_id,
    old_sand_save = excluded.old_sand_save,
    new_sand_save = excluded.new_sand_save,
    stats_cache_before = excluded.stats_cache_before,
    archived_at = excluded.archived_at;

  -- The lifecycle guards let postgres change a completed round's holes under
  -- the transaction-local 'atomic' mark; defer_round_totals keeps the hole
  -- trigger from recomputing round totals (sand_save is not one).
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM set_config('helm.defer_round_totals', 'on', true);

  UPDATE public.golf_holes AS h
  SET sand_save = a.new_sand_save
  FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
  WHERE a.hole_id = h.id
    AND a.archived_at = now()
    AND h.sand_save IS NOT DISTINCT FROM a.old_sand_save;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  PERFORM set_config('helm.defer_round_totals', '', true);

  -- Refresh each touched round's stats cache: trg_update_round_stats_cache
  -- fires on UPDATE OF status (it recounts sand_saves and sand_attempts from
  -- the holes), and the cache row's own trigger refreshes the player's.
  UPDATE public.golf_rounds AS r
  SET status = r.status
  WHERE r.id IN (
    SELECT a.round_id
    FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
    WHERE a.archived_at = now()
  );

  PERFORM set_config('helm.golf_lifecycle_write', '', true);

  SELECT count(*) INTO v_unfixed
  FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
  INNER JOIN public.golf_holes AS h ON h.id = a.hole_id
  WHERE a.archived_at = now()
    AND h.sand_save IS DISTINCT FROM a.new_sand_save;
  IF v_unfixed > 0 THEN
    RAISE EXCEPTION 'sand_save backfill left % archived holes unchanged; rolling back', v_unfixed;
  END IF;

  SELECT count(*) INTO v_cache_off
  FROM (
    SELECT DISTINCT a.round_id
    FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
    WHERE a.archived_at = now()
  ) AS touched
  INNER JOIN public.golf_round_stats_cache AS c ON c.round_id = touched.round_id
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE h.sand_save) AS saves,
      count(*) FILTER (WHERE h.sand_save IS NOT NULL) AS attempts
    FROM public.golf_holes AS h
    WHERE h.round_id = touched.round_id
  ) AS k
  WHERE c.sand_saves IS DISTINCT FROM k.saves
    OR c.sand_attempts IS DISTINCT FROM k.attempts;
  IF v_cache_off > 0 THEN
    RAISE EXCEPTION 'sand_save backfill: % round stats caches disagree with their holes; rolling back', v_cache_off;
  END IF;

  RETURN v_changed;
END
$$;

ALTER FUNCTION helm_private.golf_backfill_sand_save_tour() OWNER TO postgres;
REVOKE ALL ON FUNCTION helm_private.golf_backfill_sand_save_tour() FROM PUBLIC, anon, authenticated;

-- (3) Run it once ------------------------------------------------------------

SELECT helm_private.golf_backfill_sand_save_tour();
