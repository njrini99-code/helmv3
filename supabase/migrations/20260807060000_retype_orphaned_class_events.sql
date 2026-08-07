-- 213 class meetings are typed `other` instead of `class`.
--
-- They were written on 2026-08-06 01:48–01:53 by the pre-fix sync, AFTER the
-- typed-`class` backfill migration had already run — so the earlier backfill
-- could not have caught them. Every one carries the load-bearing
-- `[class:<id>]` description tag, and all 213 resolve to a real
-- golf_player_classes row (0 orphans). They belong to 2 players on 1 team.
--
-- This is not cosmetic. `event_type` is the marker every SQL-level filter uses,
-- and a mistyped row passes straight through the exclusions:
--
--   * the iCal feed route excludes classes with `.neq('event_type','class')`,
--     which these rows SATISFY — so one player's personal class schedule
--     exports to the whole team's subscribed calendar. That exclusion was added
--     on 2026-08-05 for exactly this reason and these rows silently defeat it.
--   * every "team events" sweep counts them as team events, which is the
--     "578 upcoming team events, 556 of them two players' fall semesters"
--     problem the typing was introduced to solve.
--
-- Scoped precisely: only rows that are BOTH `other` AND carry the class tag.
-- Idempotent — re-running matches nothing once applied.
--
-- Applied to production 2026-08-07. Verified after: 879 class events all typed
-- `class`, 0 mistyped remaining, and the affected team's "team events" count
-- dropped from 214 to 1.
UPDATE public.golf_events
SET    event_type = 'class'
WHERE  event_type = 'other'
  AND  description LIKE '%[class:%';
