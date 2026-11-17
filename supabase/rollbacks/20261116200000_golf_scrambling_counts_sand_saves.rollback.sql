-- Rollback for 20261116200000_golf_scrambling_counts_sand_saves.sql.
--
-- Forward change: branch claude/scrambling-counts-sand-saves. Captured
-- 2026-11-16. Prior definitions: update_round_stats_cache as applied by
-- 20261115231000_golf_round_cache_fairways_par4.sql (prosrc md5
-- 81bdb47ae70329fc9ae898251750ca53) and refresh_player_stats_cache as live on
-- production on 2026-11-16 (prosrc md5 da0ba53873b7c8ac519b9541f0b5f2eb).
-- The forward file patched only the scramble lines in place; this puts the
-- old lines back the same way, so each body returns to those md5s.
--
-- 1. Puts the old scramble lines back in both functions (missed greens only).
-- 2. Refreshes every archived round's golf_round_stats_cache row on the old
--    rule (a no-op UPDATE OF status fires trg_update_round_stats_cache; the
--    player cache follows from the cache row's own trigger).
-- 3. Drops the backfill function. The archive table
--    helm_private.golf_round_cache_scrambling_fix_20261116 is kept as the
--    record; drop it separately once nobody needs it.
--
-- What rolling back costs: Scrambling stops counting sand saves in the
-- database while the app (holeScramble) still counts them for shot-derived
-- figures. Roll the app change back too for one definition.
--
-- Run as postgres, in one transaction.
--
-- noqa: disable=LT05
-- VERIFY (after): select 1 from pg_proc where oid = to_regprocedure('public.update_round_stats_cache()') and md5(prosrc) = '81bdb47ae70329fc9ae898251750ca53';
-- noqa: enable=LT05

SET LOCAL lock_timeout = '3s';

DO $patch$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_fn := to_regprocedure('public.update_round_stats_cache()');
  v_new := $new1$
  -- Scrambling counts sand saves (20261116200000): a chance is a missed green
  -- or a greenside-bunker visit, one per hole; made is par or better after the
  -- miss, or a sand save (any score). Mirrors holeScramble in
  -- src/lib/golf/stat-formulas.ts.
  SELECT COALESCE(SUM(CASE WHEN (gir=false AND (score-par)<=0) OR sand_save=true THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false OR sand_save IS NOT NULL THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;
$new1$;
  v_old := $old1$
  SELECT COALESCE(SUM(CASE WHEN gir=false AND (score-par)<=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;
$old1$;
  v_def := pg_get_functiondef(v_fn);
  IF (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new) <> 1 THEN
    RAISE EXCEPTION 'rollback: update_round_stats_cache() does not carry the forward scramble lines; nothing to undo there.';
  END IF;
  EXECUTE replace(v_def, v_new, v_old);

  v_fn := to_regprocedure('public.refresh_player_stats_cache(uuid)');
  v_new := $new2$
    -- Scrambling counts sand saves (20261116200000), as update_round_stats_cache does.
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND ((h.gir = false AND (h.score - h.par) <= 0) OR h.sand_save = true)), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.gir = false OR h.sand_save IS NOT NULL)), 0),
$new2$;
  v_old := $old2$
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0),
$old2$;
  v_def := pg_get_functiondef(v_fn);
  IF (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new) <> 1 THEN
    RAISE EXCEPTION 'rollback: refresh_player_stats_cache(uuid) does not carry the forward scramble lines; nothing to undo there.';
  END IF;
  EXECUTE replace(v_def, v_new, v_old);
END
$patch$;

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);

UPDATE public.golf_rounds AS r
SET status = r.status
WHERE r.id IN (
    SELECT a.round_id
    FROM helm_private.golf_round_cache_scrambling_fix_20261116 AS a
);

SELECT set_config('helm.golf_lifecycle_write', '', true);

DROP FUNCTION IF EXISTS helm_private.golf_backfill_scrambling_sand_saves();
