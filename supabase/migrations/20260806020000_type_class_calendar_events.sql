-- ============================================================================
-- Type synced class meetings as `class`, not `other`
-- ----------------------------------------------------------------------------
-- syncClassToCalendar writes one golf_events row per class meeting onto the
-- TEAM calendar (so classes appear on the calendar's "All" lens — coaches want
-- that). Until now those rows were written as event_type 'other', making them
-- indistinguishable from real team events in every team-scoped query:
--
--   * the coach dashboard's "Upcoming events" read 192 on a team with 22
--   * every player's home dashboard listed teammates' classes as today's events
--   * subscribed iCal feeds exported one player's schedule to the whole roster
--
-- The description tag `[class:<id>]` already identified them, but only via a
-- LIKE scan no query could reasonably filter on. event_type is NOT NULL, so
-- `event_type <> 'class'` is a safe, index-friendly "team events only" filter.
--
-- Idempotent. Reversible exactly: every row this touches is currently 'other'
-- (verified 2026-08-06 — 496 rows, all 'other'; no practice/tournament/qualifier
-- row carries a class tag), so the inverse is
--   UPDATE golf_events SET event_type = 'other'
--    WHERE event_type = 'class' AND description LIKE '%[class:%';
--
-- Application code tolerates either value on read (typeMeta falls back), so this
-- can be applied before or after the deploy without a broken window.
-- ============================================================================

-- The reversibility claim above is only true while every tagged row is 'other'
-- or already 'class'. That was a point-in-time observation, so enforce it rather
-- than trust it: if a third type ever carries a class tag, stop instead of
-- silently making the documented inverse wrong.
DO $$
DECLARE
  unexpected integer;
BEGIN
  SELECT count(*) INTO unexpected
    FROM golf_events
   WHERE description LIKE '%[class:%'
     AND event_type NOT IN ('other', 'class');

  IF unexpected > 0 THEN
    RAISE EXCEPTION
      'Refusing to backfill: % class-tagged golf_events rows carry an event_type other than other/class. Reclassifying them would not be reversible by the documented inverse.',
      unexpected;
  END IF;
END $$;

UPDATE golf_events
   SET event_type = 'class'
 WHERE description LIKE '%[class:%'
   AND event_type IS DISTINCT FROM 'class';
