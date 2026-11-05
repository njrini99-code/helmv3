-- ROLLBACK for supabase/migrations/20261031140000_golf_rounds_tee_id_backfill.sql
--
-- Puts each backfilled round's tee_id back to what the archive recorded (NULL for every row in it), only where the
-- round still holds the backfilled value, then checks the rows match their archived state again. The archive table is
-- kept; drop it by hand once it is no longer wanted.

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);

UPDATE golf_rounds r
SET tee_id = a.old_tee_id
FROM helm_private.golf_rounds_tee_backfill_20261031 a
WHERE a.round_id = r.id
  AND r.tee_id = a.new_tee_id;

SELECT set_config('helm.golf_lifecycle_write', '', true);

DO $$
DECLARE
  differ int;
BEGIN
  SELECT count(*) INTO differ
  FROM helm_private.golf_rounds_tee_backfill_20261031 a
  JOIN golf_rounds r ON r.id = a.round_id
  WHERE to_jsonb(r) IS DISTINCT FROM a.row_before;
  IF differ > 0 THEN
    RAISE NOTICE '% rounds differ from their archived row (changed since the backfill by something else)', differ;
  END IF;
END;
$$;
