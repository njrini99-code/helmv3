-- REPAIR: 281 class meetings were stored one hour early.
--
-- syncClassToCalendar stamped every occurrence in a series with ONE UTC offset,
-- captured at save time. A schedule entered in August (EDT, -04:00) wrote its
-- December occurrences as -04:00 as well — but December is EST (-05:00) — so
-- every meeting on or after the 1 November change was stored an hour early.
--
-- Measured before this ran: 879 class events total, 598 already correct, 281
-- wrong, spanning 2026-11-02 to 2026-12-15, across 17 classes and 2 teams.
-- Every discrepancy was exactly +1 hour (07:30->08:30, 09:00->10:00, ...).
--
-- The repair does NOT assume a uniform +1h shift. It recomputes each event from
-- the CLASS's own wall-clock time, interpreted in that team's timezone on that
-- event's own local date — correct regardless of which side of the change a row
-- falls on, and a no-op for the 598 already-correct rows.
--
-- Idempotent: scoped to rows whose local time disagrees with the class, so
-- re-running matches nothing. The code-side fix (per-occurrence offset from the
-- caller's IANA zone) ships alongside in calendar-sync.ts.
WITH tagged AS (
    SELECT e.id,
           e.start_time,
           substring(e.description FROM '\[class:([0-9a-f-]+)\]')::uuid AS class_id,
           COALESCE(s.timezone, 'America/New_York') AS tz
    FROM   public.golf_events e
    LEFT   JOIN public.golf_team_settings s ON s.team_id = e.team_id
    WHERE  e.description LIKE '%[class:%'
),
target AS (
    SELECT t.id, t.tz,
           (t.start_time AT TIME ZONE t.tz)::date AS local_date,
           c.start_time AS src_start,
           c.end_time   AS src_end
    FROM   tagged t
    JOIN   public.golf_player_classes c ON c.id = t.class_id
    WHERE  c.start_time IS NOT NULL
      AND  (t.start_time AT TIME ZONE t.tz)::time <> c.start_time::time
)
UPDATE public.golf_events e
SET    start_time = ((target.local_date + target.src_start::time) AT TIME ZONE target.tz),
       end_time   = CASE
                      WHEN target.src_end IS NOT NULL
                      THEN ((target.local_date + target.src_end::time) AT TIME ZONE target.tz)
                      ELSE e.end_time
                    END,
       updated_at = now()
FROM   target
WHERE  e.id = target.id;
