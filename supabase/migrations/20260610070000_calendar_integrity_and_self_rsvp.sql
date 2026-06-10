-- Calendar audit 2026-06-10 (docs/audits/GOLFHELM_CALENDAR_AUDIT_2026-06-10.md)
-- findings #17 (no end>=start validation; 3 corrupt prod rows), #8 (players
-- without a coach-seeded attendance row cannot RSVP — INSERT policy was
-- coach-only), #28 (anon/authenticated held TRUNCATE on calendar tables).
--
-- APPLY: via MCP apply_migration (apply-time version stamp, NOT this filename).
-- ROLLBACK: DROP CONSTRAINT golf_events_end_after_start; DROP POLICY
--   golf_event_attendance_insert_self; re-GRANT TRUNCATE (not recommended).

-- (1) Repair the three corrupt rows BEFORE adding the constraint. Two are
-- all-day events whose end DATE was typo'd before the start (set end=start,
-- single-day); one is a timed meeting whose end date was a day early with a
-- plausible time-of-day (preserve the entered wall time on the start's date).
UPDATE public.golf_events SET end_time = start_time
WHERE id IN ('2ef96c85-115f-420a-8813-031c2bc72c6b', '16fdc583-349f-493d-9752-e450d9bdd473')
  AND end_time < start_time;

UPDATE public.golf_events
SET end_time = date_trunc('day', start_time) + (end_time - date_trunc('day', end_time))
WHERE id = 'ae05b1cc-c990-4526-85c4-511f72340ac6'
  AND end_time < start_time;

-- Safety net: any other inverted rows (none at audit time) collapse to start.
UPDATE public.golf_events SET end_time = start_time
WHERE end_time IS NOT NULL AND start_time IS NOT NULL AND end_time < start_time;

ALTER TABLE public.golf_events
  ADD CONSTRAINT golf_events_end_after_start
  CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time);

-- (2) Players may create their OWN attendance row for events on a team they
-- are an active member of (self-RSVP for whole-team events where the coach
-- did not pre-seed invitees). Coach INSERT policy unchanged; the existing
-- update policy already lets a player modify their own row, so PostgREST
-- upsert(onConflict event_id,player_id) works for both arms.
CREATE POLICY golf_event_attendance_insert_self ON public.golf_event_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT gp.id FROM public.golf_players gp WHERE gp.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.golf_events e
      WHERE e.id = golf_event_attendance.event_id
        AND public.is_golf_team_player(e.team_id)
    )
  );

-- (3) Hardening: nothing should ever TRUNCATE through the API roles.
REVOKE TRUNCATE ON public.golf_events, public.golf_event_attendance,
  public.golf_event_documents, public.golf_calendar_feeds,
  public.golf_calendar_notifications
FROM anon, authenticated;
