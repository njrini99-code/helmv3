-- ============================================================================
-- Cloud Course Library — Phase 5: dedup guard (UNIQUE normalized_name + trigger)
-- ----------------------------------------------------------------------------
-- Makes the cloud catalog's dedup spine ENFORCED rather than advisory:
--   1. A BEFORE INSERT/UPDATE trigger keeps golf_courses.normalized_name in
--      lockstep with name via golf_normalize_name() — so EVERY write path
--      (the new DAL, legacy courses.ts createCourse, anything future) gets a
--      correct dedup key without having to remember to set it.
--   2. A PARTIAL UNIQUE index on normalized_name WHERE active makes a duplicate
--      facility impossible to insert; callers that already handle 23505
--      (course-library.ts createCourse → dedup re-fetch; courses.ts createCourse
--      → friendly error) self-heal onto the existing row.
--
-- SCOPE NOTE (decision 2026-06-13): the legacy golf_player_courses → team-saved
-- DATA migration is intentionally DEFERRED. Those 35 rows are free-text,
-- name-only (no course_id), and include junk; backfilling them into a SHARED
-- multi-team catalog is a high-cost, low-recoverability move. The cloud library
-- starts clean as of now and grows from real user contribution; the legacy
-- player-saved-courses feature is left fully intact and keeps running. The data
-- migration, if ever wanted, will be coordinated with the round-flow rewrite.
--
-- SAFETY (adversarially verified, 4 lenses, 0 refutations):
--   • Touches ONLY golf_courses. Analytics group by golf_rounds.course_name
--     STRING (0 rounds reference course_id), so no normalized_name change can
--     affect any historical round/stat truth.
--   • Prod has 0 active duplicate normalized_name groups → the unique index
--     builds directly. A pre-flight RAISE aborts (harmlessly) if that ever
--     stops being true; recovery = soft-delete one course per dup pair, re-run.
--   • Trigger is SECURITY INVOKER; `authenticated` already holds EXECUTE on
--     golf_normalize_name (anon does not), so authenticated inserts work and
--     anon stays blocked. search_path is statically anchored (no injection).
--   • Idempotent / CI-replay-safe: CREATE OR REPLACE, DROP ... IF EXISTS,
--     CREATE ... IF NOT EXISTS, UPDATE ... WHERE IS DISTINCT FROM.
-- ============================================================================

-- 1) Keep normalized_name authoritative on the DB side for ALL write paths.
CREATE OR REPLACE FUNCTION golf_courses_set_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  NEW.normalized_name := golf_normalize_name(NEW.name);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_golf_courses_set_normalized_name ON golf_courses;
CREATE TRIGGER trg_golf_courses_set_normalized_name
  BEFORE INSERT OR UPDATE OF name ON golf_courses
  FOR EACH ROW
  EXECUTE FUNCTION golf_courses_set_normalized_name();

-- 2) Re-backfill (idempotent) so every existing row equals the trigger output
--    before the unique index is built. (Setting normalized_name only — not name
--    — does NOT fire the BEFORE UPDATE OF name trigger, so no recursion.)
UPDATE golf_courses
SET normalized_name = golf_normalize_name(name)
WHERE normalized_name IS DISTINCT FROM golf_normalize_name(name);

-- 3) Pre-flight: abort (harmlessly — index swap below never runs) if any active
--    duplicate normalized_name group exists. Excludes '' so degenerate
--    stopword-only names (which the index below also excludes) can't trip it.
DO $blk$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1 FROM golf_courses
    WHERE deleted_at IS NULL AND normalized_name IS NOT NULL AND normalized_name <> ''
    GROUP BY normalized_name HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique index: % active normalized_name duplicate group(s) — soft-delete one course per pair then re-run', dup_count;
  END IF;
END $blk$;

-- 4) Swap the Phase-1 non-unique partial index for a UNIQUE partial index.
--    Partial WHERE active: a soft-deleted course leaves the index so its name
--    can be re-used, matching the soft-delete model. Excludes '' so two
--    degenerate stopword-only names don't collide on an empty key.
DROP INDEX IF EXISTS golf_courses_normalized_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS golf_courses_normalized_name_key
  ON golf_courses (normalized_name)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL AND normalized_name <> '';
