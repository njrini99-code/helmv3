-- ============================================================================
-- Backfill golf_player_classes.semester
--
-- RUN THIS ONLY AFTER the fix in 0bf466dcf is deployed to production.
-- Before that deploy, any class a player re-saves is re-dated by the OLD
-- derivation and this backfill is undone.
--
-- WHY
-- Three write paths stored `semester: … || null` while three read paths fell
-- back to `detectSemester('')` — a pure function of TODAY'S DATE. A null column
-- therefore did not mean "no term", it meant "re-guess the term on every edit",
-- and the guess moves as the calendar does. Measured 2026-08-13: 26 of 30
-- synced class series carried a null semester.
--
-- The code fix stops new nulls. This repairs the rows already written, by
-- recording the term the class's OWN CALENDAR EVENTS already sit in. That is
-- deliberately conservative: it changes no meeting times and no event rows, it
-- only writes down the term that is already in effect, so a future edit
-- reproduces the current calendar instead of a different one.
--
-- Step 4 is separate and DOES delete rows — read its comment before running.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Snapshot. Reversibility first: this table is the undo.
--    Drop it once the backfill has been verified in the UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_class_semester_20260813 AS
SELECT id, player_id, class_name, semester, updated_at
FROM golf_player_classes;

-- ---------------------------------------------------------------------------
-- 2. What term does each class's existing event series actually sit in?
--    Boundaries mirror src/lib/golf/semester.ts:
--      Spring 01-15..05-15 · Summer 06-01..08-15 · Fall 08-20..12-15
--
--    Classified on the LAST meeting, not the first. Term ENDS are fixed;
--    starts are not — parseSemesterDates honours a customStartDate read off the
--    player's schedule, so a Fall class can legitimately begin on 12 August,
--    before Fall's own 20 August default. A dry run against production on
--    2026-08-13 proved this matters: classifying on the first meeting labelled
--    four classes "Summer 2026" whose events run through to 14 December. Their
--    last meeting is the honest signal, and it moves 17 classes to Fall rather
--    than 13.
--
--    Cast in the team's zone (all 10 production golf teams are
--    America/New_York); a UTC-midnight cast would shift an early-morning
--    meeting to the previous day.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE class_term AS
WITH ce AS (
  SELECT substring(e.description FROM '\[class:([0-9a-f-]+)\]')::uuid AS class_id,
         MIN(e.start_time AT TIME ZONE 'America/New_York')::date      AS first_meeting,
         MAX(e.start_time AT TIME ZONE 'America/New_York')::date      AS last_meeting,
         COUNT(*)                                                     AS meetings
  FROM golf_events e
  WHERE e.description LIKE '%[class:%'
  GROUP BY 1
)
SELECT ce.*,
       CASE
         WHEN EXTRACT(MONTH FROM last_meeting) BETWEEN 1 AND 5 THEN 'Spring'
         WHEN EXTRACT(MONTH FROM last_meeting) IN (6, 7, 8)    THEN 'Summer'
         ELSE 'Fall'
       END || ' ' || EXTRACT(YEAR FROM last_meeting)::int       AS implied_term
FROM ce;

-- Dry-run result against production, 2026-08-13 (nothing written):
--   step 3  Fall 2026    17 classes,  741 events  (labels only, events untouched)
--   step 3  Summer 2026   5 classes,  132 events  (genuinely summer: Jun 1 - Aug 14)
--   step 4  truncated     4 classes,    6 events  (relabelled Fall 2026, events deleted)
--   -> 26 null-semester rows resolved, matching the 26 measured before the fix.

-- ---------------------------------------------------------------------------
-- 3. Fill only rows that have no term AND have a real series to infer from.
--    A truncated series (<= 3 meetings) is EXCLUDED here — its events are the
--    bug's output, so inferring the term from them would write the wrong term
--    down and make it permanent. Those are handled in step 4.
-- ---------------------------------------------------------------------------
UPDATE golf_player_classes pc
SET semester = ct.implied_term,
    updated_at = NOW()
FROM class_term ct
WHERE ct.class_id = pc.id
  AND (pc.semester IS NULL OR pc.semester = '')
  AND ct.meetings > 3;

-- ---------------------------------------------------------------------------
-- 4. The four truncated series.
--
--    These are the ones that generated 1-2 meetings: a schedule imported on
--    6 August carried a Fall start date (12 August) but a "Summer 2026" label,
--    so parseSemesterDates produced 2026-08-12 -> 2026-08-15. Their events are
--    wrong, not merely unlabelled.
--
--    Setting the term is safe. Deleting the bogus meetings is a judgement call:
--    it removes 1-2 real rows per class from the calendar. It is included
--    because those meetings are already in the past AND misleading — they show
--    a full-semester class as a three-day one. Once the term is recorded, the
--    player re-saving the class regenerates the full Fall series through the
--    FIXED code path.
--
--    If you would rather leave the events in place, run steps 1-3 only.
-- ---------------------------------------------------------------------------
UPDATE golf_player_classes pc
SET semester = 'Fall 2026', updated_at = NOW()
FROM class_term ct
WHERE ct.class_id = pc.id
  AND ct.meetings <= 3
  AND ct.first_meeting >= DATE '2026-08-01';

DELETE FROM golf_events e
USING class_term ct
WHERE substring(e.description FROM '\[class:([0-9a-f-]+)\]')::uuid = ct.class_id
  AND ct.meetings <= 3
  AND ct.first_meeting >= DATE '2026-08-01';

-- ---------------------------------------------------------------------------
-- 5. Verify BEFORE committing. Expect remaining_null_semester = 0 for every
--    class that has a synced series.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM golf_player_classes
     WHERE semester IS NULL OR semester = '')                       AS remaining_null_semester,
  (SELECT COUNT(*) FROM golf_player_classes pc
     JOIN class_term ct ON ct.class_id = pc.id
    WHERE pc.semester IS NULL OR pc.semester = '')                  AS synced_but_still_null,
  (SELECT COUNT(*) FROM golf_events WHERE description LIKE '%[class:%') AS class_events_now;

-- Inspect the numbers above, then:
--   COMMIT;    -- if they look right
--   ROLLBACK;  -- if they do not
-- Nothing is persisted until you choose.
ROLLBACK;
