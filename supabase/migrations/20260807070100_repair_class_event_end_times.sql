-- Companion to 20260807070000_repair_class_events_dst_offset.
--
-- That repair scoped itself to rows whose START disagreed with the class, which
-- is exactly the DST population. It therefore skipped one row whose start was
-- already correct but whose END was not: PSY-222-F2F1 on 2026-08-14, ending
-- 15:00 while the class says 15:30. Not the DST defect — a stale occurrence
-- whose end never followed an edit to the class.
--
-- Same principle: the class row is authoritative for wall-clock time, resolved
-- in the team's zone on the event's own local date. Scoped to end-time
-- disagreements only; idempotent.
WITH tagged AS (
    SELECT e.id,
           e.end_time,
           substring(e.description FROM '\[class:([0-9a-f-]+)\]')::uuid AS class_id,
           COALESCE(s.timezone, 'America/New_York') AS tz
    FROM   public.golf_events e
    LEFT   JOIN public.golf_team_settings s ON s.team_id = e.team_id
    WHERE  e.description LIKE '%[class:%'
      AND  e.end_time IS NOT NULL
),
target AS (
    SELECT t.id, t.tz,
           (t.end_time AT TIME ZONE t.tz)::date AS local_date,
           c.end_time AS src_end
    FROM   tagged t
    JOIN   public.golf_player_classes c ON c.id = t.class_id
    WHERE  c.end_time IS NOT NULL
      AND  (t.end_time AT TIME ZONE t.tz)::time <> c.end_time::time
)
UPDATE public.golf_events e
SET    end_time = ((target.local_date + target.src_end::time) AT TIME ZONE target.tz),
       updated_at = now()
FROM   target
WHERE  e.id = target.id;
