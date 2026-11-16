-- Rollback for 20261115200000_golf_sand_save_tour_definition.sql (SC-02).
--
-- Forward change: commit on branch claude/project-thread-5yymil (PR #2536).
-- Captured 2026-11-15. Prior definition: none. Both functions and the archive
-- table are new in the forward file; nothing it replaces existed before, so
-- there is no earlier body to restore.
--
-- 1. Puts each archived hole's sand_save back to its old value, but only where
--    it still holds the value the backfill wrote (a hole changed since is left
--    alone). Runs under the lifecycle guard's transaction-local 'atomic' mark
--    and with helm.defer_round_totals on, as the forward backfill did.
-- 2. Refreshes each of those rounds' golf_round_stats_cache rows (a no-op
--    UPDATE OF status fires trg_update_round_stats_cache; the player cache
--    follows from the cache row's own trigger).
-- 3. Drops the two functions. The archive table
--    helm_private.golf_holes_sand_save_fix_20261115 is kept as the record;
--    drop it separately once nobody needs it.
--
-- What rolling back costs: sand saves read on the app's old par-or-better
-- rule again for the rounds the backfill touched, while rounds submitted after
-- the app change keep the Tour rule, so a player's sand-save % mixes both
-- definitions until the forward file is applied again. Roll the app change
-- back too for one definition.
--
-- Run as postgres, in one transaction.
--
-- VERIFY (after): returns no row.
--   select 1 from helm_private.golf_holes_sand_save_fix_20261115 a
--   join public.golf_holes h on h.id = a.hole_id
--   where h.sand_save is distinct from a.old_sand_save;

SET LOCAL lock_timeout = '3s';

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
SELECT set_config('helm.defer_round_totals', 'on', true);

UPDATE public.golf_holes AS h
SET sand_save = a.old_sand_save
FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
WHERE
    a.hole_id = h.id
    AND h.sand_save IS NOT DISTINCT FROM a.new_sand_save;

SELECT set_config('helm.defer_round_totals', '', true);

UPDATE public.golf_rounds AS r
SET status = r.status
WHERE r.id IN (
    SELECT a.round_id
    FROM helm_private.golf_holes_sand_save_fix_20261115 AS a
);

SELECT set_config('helm.golf_lifecycle_write', '', true);

DROP FUNCTION IF EXISTS helm_private.golf_backfill_sand_save_tour();
DROP FUNCTION IF EXISTS helm_private.golf_hole_sand_save_tour(uuid);
